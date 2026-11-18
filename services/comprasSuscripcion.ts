/*
=======================================================
NITRO SYNC - COMPRAS SIMULADAS DEL PLAN ÚNICO
=======================================================

  comprasSuscripcion/{orgId}_AAAA-MM

Una sola compra por mes y aseguradora: eso evita compras
duplicadas. La compra SIEMPRE nace en estado PENDIENTE y
NO activa la suscripción.

El precio se copia desde `configuracionSuscripcion` en el
momento de la compra: cambios posteriores del precio no
modifican esta operación.

Al crear la compra se genera también la notificación del
súper administrador (misma id), en tiempo real.
=======================================================
*/

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import { PLAN_SUPER_EMPRESARIAL } from '@/data/planSuscripcion';
import { hoyISO, fechaMasDias } from '@/utils/fechas';

import { leerConfiguracionSuscripcion } from '@/services/configuracionSuscripcion';
import { registrarAuditoria } from '@/services/auditoria';
import { registrarHistorialSuscripcion } from '@/services/historialSuscripciones';

import type {
  CompraSuscripcion,
  EstadoCompraSuscripcion,
  NotificacionAdmin,
} from '@/types/negocio';

const COMPRAS = 'comprasSuscripcion';
const NOTIFICACIONES = 'notificacionesAdmin';
const SUSCRIPCIONES = 'subscriptions';

export function idCompraSuscripcion(orgId: string, fecha: string = hoyISO()): string {
  return `${orgId}_${fecha.slice(0, 7)}`;
}

function convertirCompra(id: string, datos: DocumentData): CompraSuscripcion {
  return {
    id,
    orgId: String(datos.orgId ?? ''),
    orgNombre: String(datos.orgNombre ?? ''),
    planId: String(datos.planId ?? PLAN_SUPER_EMPRESARIAL.id),
    planNombre: String(datos.planNombre ?? PLAN_SUPER_EMPRESARIAL.nombre),
    precioCop: Number(datos.precioCop ?? 0),
    periodicidad: 'monthly',
    beneficios: Array.isArray(datos.beneficios)
      ? datos.beneficios.map((b: unknown) => String(b))
      : [],
    estado: (datos.estado ?? 'pendiente') as EstadoCompraSuscripcion,
    compradorUid: String(datos.compradorUid ?? ''),
    compradorCorreo: datos.compradorCorreo ?? null,
    fechaCompra: String(datos.fechaCompra ?? ''),
    registradoEn: Number(datos.registradoEn ?? 0),
    aprobadaPor: datos.aprobadaPor ?? null,
    aprobadaEn: datos.aprobadaEn ?? null,
    simulado: true,
  };
}

/**
 * Las reglas validan `keys().hasOnly([...])`, por lo que el id
 * del objeto de negocio NO debe guardarse como campo: el id real
 * es el del documento. Se quita antes de escribir.
 */
function quitarId<T extends { id: string }>(valor: T): Omit<T, 'id'> {
  const copia: Record<string, unknown> = { ...valor };
  delete copia.id;
  return copia as Omit<T, 'id'>;
}

function convertirNotificacion(id: string, datos: DocumentData): NotificacionAdmin {
  return {
    id,
    compraId: String(datos.compraId ?? id),
    orgId: String(datos.orgId ?? ''),
    orgNombre: String(datos.orgNombre ?? ''),
    planId: String(datos.planId ?? PLAN_SUPER_EMPRESARIAL.id),
    planNombre: String(datos.planNombre ?? PLAN_SUPER_EMPRESARIAL.nombre),
    precioCop: Number(datos.precioCop ?? 0),
    fechaCompra: String(datos.fechaCompra ?? ''),
    estadoCompra: (datos.estadoCompra ?? 'pendiente') as EstadoCompraSuscripcion,
    leida: datos.leida === true,
    leidaPor: datos.leidaPor ?? null,
    leidaEn: datos.leidaEn ?? null,
    creadoEn: Number(datos.creadoEn ?? 0),
    simulado: true,
  };
}

/** Todas las compras (súper administrador). */
export function suscribirComprasSuscripcion(
  onData: (compras: CompraSuscripcion[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, COMPRAS),
    (instantanea) => {
      onData(
        instantanea.docs
          .map((documento) => convertirCompra(documento.id, documento.data()))
          .sort((a, b) => b.registradoEn - a.registradoEn)
      );
    },
    (error) => onError?.(error)
  );
}

/** Compras de una aseguradora (una sola condición: sin índice compuesto). */
export function suscribirComprasOrg(
  orgId: string | null,
  onData: (compras: CompraSuscripcion[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!orgId) {
    onData([]);
    return () => {};
  }

  return onSnapshot(
    query(collection(db, COMPRAS), where('orgId', '==', orgId)),
    (instantanea) => {
      onData(
        instantanea.docs
          .map((documento) => convertirCompra(documento.id, documento.data()))
          .sort((a, b) => b.registradoEn - a.registradoEn)
      );
    },
    (error) => onError?.(error)
  );
}

export interface DatosCompra {
  orgId: string;
  orgNombre: string;
  compradorUid: string;
  compradorCorreo: string | null;
}

/**
 * Compra SIMULADA: nunca cobra nada y no activa el plan.
 * Lanza error si ya existe una compra del mes.
 */
export async function crearCompraSuscripcion(
  datos: DatosCompra
): Promise<CompraSuscripcion> {
  const configuracion = await leerConfiguracionSuscripcion();
  const ahora = Date.now();
  const fecha = hoyISO();
  const id = idCompraSuscripcion(datos.orgId, fecha);
  const referencia = doc(db, COMPRAS, id);

  if ((await getDoc(referencia)).exists()) {
    throw new Error('Ya existe una compra registrada para este mes.');
  }

  const compra: CompraSuscripcion = {
    id,
    orgId: datos.orgId,
    orgNombre: datos.orgNombre,
    planId: PLAN_SUPER_EMPRESARIAL.id,
    planNombre: PLAN_SUPER_EMPRESARIAL.nombre,
    precioCop: configuracion.precioCop,
    periodicidad: 'monthly',
    beneficios: [...configuracion.beneficios],
    estado: 'pendiente',
    compradorUid: datos.compradorUid,
    compradorCorreo: datos.compradorCorreo,
    fechaCompra: fecha,
    registradoEn: ahora,
    aprobadaPor: null,
    aprobadaEn: null,
    simulado: true,
  };

  const notificacion: NotificacionAdmin = {
    id,
    compraId: id,
    orgId: datos.orgId,
    orgNombre: datos.orgNombre,
    planId: compra.planId,
    planNombre: compra.planNombre,
    precioCop: compra.precioCop,
    fechaCompra: compra.fechaCompra,
    estadoCompra: 'pendiente',
    leida: false,
    leidaPor: null,
    leidaEn: null,
    creadoEn: ahora,
    simulado: true,
  };

  const lote = writeBatch(db);
  lote.set(referencia, quitarId(compra));
  lote.set(doc(db, NOTIFICACIONES, id), quitarId(notificacion));
  await lote.commit();

  await registrarAuditoria({
    actorUid: datos.compradorUid,
    actorCorreo: datos.compradorCorreo,
    actorRol: 'insurer_admin',
    orgId: datos.orgId,
    accion: 'suscripcion.compra.solicitar',
    entidad: COMPRAS,
    entidadId: id,
    detalle: { planId: compra.planId, precioCop: compra.precioCop, simulado: true },
  });

  return compra;
}

export interface ResultadoRespuestaCompra {
  compra: CompraSuscripcion;
  vencimiento: string | null;
}

/**
 * El súper administrador aprueba o rechaza. Aprobar activa
 * la suscripción con el precio CONGELADO de la compra.
 */
export async function responderCompraSuscripcion(
  compra: CompraSuscripcion,
  aprobar: boolean,
  administrador: { uid: string; correo: string | null }
): Promise<ResultadoRespuestaCompra> {
  const ahora = Date.now();
  const fin = aprobar ? fechaMasDias(hoyISO(), 30) : null;
  const lote = writeBatch(db);

  lote.update(doc(db, COMPRAS, compra.id), {
    estado: aprobar ? 'aprobada' : 'rechazada',
    aprobadaPor: administrador.uid,
    aprobadaEn: ahora,
  });

  lote.update(doc(db, NOTIFICACIONES, compra.id), {
    estadoCompra: aprobar ? 'aprobada' : 'rechazada',
  });

  if (aprobar) {
    lote.set(
      doc(db, SUSCRIPCIONES, compra.orgId),
      {
        orgId: compra.orgId,
        planId: PLAN_SUPER_EMPRESARIAL.id,
        precioCop: compra.precioCop,
        estado: 'active',
        inicio: hoyISO(),
        vencimiento: fin,
        activadaPor: administrador.uid,
        activadaEn: ahora,
        desactivadaPor: null,
        desactivadaEn: null,
        motivoDesactivacion: null,
        actualizadaEn: ahora,
        simulado: true,
      },
      { merge: true }
    );
  }

  await lote.commit();

  await registrarHistorialSuscripcion({
    orgId: compra.orgId,
    orgNombre: compra.orgNombre,
    tipo: aprobar ? 'aprobacion' : 'desactivacion',
    estado: aprobar ? 'active' : 'inactive',
    precioCop: compra.precioCop,
    responsableUid: administrador.uid,
    responsableCorreo: administrador.correo,
    motivo: aprobar ? `Compra ${compra.id} aprobada` : `Compra ${compra.id} rechazada`,
  });

  await registrarAuditoria({
    actorUid: administrador.uid,
    actorCorreo: administrador.correo,
    actorRol: 'super_admin',
    orgId: compra.orgId,
    accion: aprobar
      ? 'suscripcion.compra.aprobar'
      : 'suscripcion.compra.rechazar',
    entidad: COMPRAS,
    entidadId: compra.id,
    detalle: { precioCop: compra.precioCop, simulado: true },
  });

  return { compra, vencimiento: fin };
}

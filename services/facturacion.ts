/*
=======================================================
NITRO SYNC - FACTURACIÓN DE ASEGURADORAS
=======================================================

  plans/{planId}              -> planes mensuales en COP
  subscriptions/{orgId}       -> suscripción de la aseguradora
  payments/{paymentId}        -> pagos registrados a mano

NO hay pasarela de pago ni cobros automáticos: los pagos
los registra el super administrador cuando recibe una
transferencia. El estado de la suscripción controla si la
aseguradora puede operar.

El id de `subscriptions` es el propio `orgId` (una
suscripción por aseguradora).
=======================================================
*/

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import type {
  EstadoSuscripcion,
  Pago,
  Plan,
  Suscripcion,
} from '@/types/negocio';

const COLECCION_PLANES = 'plans';
const COLECCION_SUSCRIPCIONES = 'subscriptions';
const COLECCION_PAGOS = 'payments';

/* -----------------------------------------------
   PLANES
----------------------------------------------- */

function convertirPlan(id: string, datos: DocumentData): Plan {
  return {
    id,
    nombre: String(datos.nombre ?? 'Plan'),
    precioCop: Number(datos.precioCop ?? 0),
    moneda: 'COP',
    periodicidad: 'monthly',
    limiteEmpleados: datos.limiteEmpleados ?? null,
    limiteVehiculos: datos.limiteVehiculos ?? null,
    funciones: Array.isArray(datos.funciones) ? datos.funciones.map(String) : [],
    activo: datos.activo !== false,
    creadoEn: Number(datos.creadoEn ?? 0),
  };
}

export function suscribirPlanes(
  onData: (planes: Plan[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION_PLANES), orderBy('precioCop', 'asc')),
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) =>
          convertirPlan(documento.id, documento.data())
        )
      );
    },
    (error) => onError?.(error)
  );
}

export async function guardarPlan(datos: {
  id?: string;
  nombre: string;
  precioCop: number;
  limiteEmpleados?: number | null;
  limiteVehiculos?: number | null;
  funciones?: string[];
  activo?: boolean;
}): Promise<string> {
  const referencia = datos.id
    ? doc(db, COLECCION_PLANES, datos.id)
    : doc(collection(db, COLECCION_PLANES));

  await setDoc(
    referencia,
    {
      nombre: datos.nombre,
      precioCop: datos.precioCop,
      moneda: 'COP',
      periodicidad: 'monthly',
      limiteEmpleados: datos.limiteEmpleados ?? null,
      limiteVehiculos: datos.limiteVehiculos ?? null,
      funciones: datos.funciones ?? [],
      activo: datos.activo !== false,
      creadoEn: Date.now(),
    },
    { merge: true }
  );

  return referencia.id;
}

/* -----------------------------------------------
   SUSCRIPCIONES
----------------------------------------------- */

function convertirSuscripcion(id: string, datos: DocumentData): Suscripcion {
  return {
    id,
    orgId: String(datos.orgId ?? id),
    planId: datos.planId ?? null,
    estado: (datos.estado ?? 'trial') as EstadoSuscripcion,
    inicio: datos.inicio ?? null,
    vencimiento: datos.vencimiento ?? null,
    precioCop: datos.precioCop ?? null,
    actualizadaEn: Number(datos.actualizadaEn ?? 0),
    simulado: datos.simulado === true ? true : undefined,
    /* Trazabilidad: se expone para el detalle del súper administrador. */
    activadaPor: datos.activadaPor ?? null,
    activadaEn: datos.activadaEn == null ? null : Number(datos.activadaEn),
    desactivadaPor: datos.desactivadaPor ?? null,
    desactivadaEn: datos.desactivadaEn == null ? null : Number(datos.desactivadaEn),
    motivoDesactivacion: datos.motivoDesactivacion ?? null,
    renovadaEn: datos.renovadaEn == null ? null : Number(datos.renovadaEn),
  };
}

export function suscripcionRef(orgId: string) {
  return doc(db, COLECCION_SUSCRIPCIONES, orgId);
}

export function suscribirSuscripcionOrg(
  orgId: string,
  onData: (suscripcion: Suscripcion | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    suscripcionRef(orgId),
    (documento) => {
      onData(
        documento.exists()
          ? convertirSuscripcion(documento.id, documento.data())
          : null
      );
    },
    (error) => onError?.(error)
  );
}

/** Todas las suscripciones (solo super_admin). */
export function suscribirSuscripciones(
  onData: (suscripciones: Suscripcion[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, COLECCION_SUSCRIPCIONES),
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) =>
          convertirSuscripcion(documento.id, documento.data())
        )
      );
    },
    (error) => onError?.(error)
  );
}

export async function guardarSuscripcion(
  orgId: string,
  cambios: Partial<
    Pick<Suscripcion, 'planId' | 'estado' | 'inicio' | 'vencimiento' | 'precioCop'>
  >
): Promise<void> {
  await setDoc(
    suscripcionRef(orgId),
    {
      orgId,
      ...cambios,
      actualizadaEn: Date.now(),
    },
    { merge: true }
  );
}

/*
-------------------------------------------------------
FASE 7 · MEMBRESÍA SIMULADA
-------------------------------------------------------
*/

/** Activa o suspende la membresía sin tocar el plan asignado. */
export async function cambiarMembresia(
  orgId: string,
  habilitada: boolean
): Promise<void> {
  await guardarSuscripcion(orgId, {
    estado: habilitada ? 'active' : 'suspended',
  });
}

/**
 * Renueva 30 días la suscripción. SIMULADO: no se cobra
 * nada; solo se desplaza la vigencia y se marca el origen.
 */
export async function renovarSuscripcion30Dias(
  orgId: string,
  datos: {
    planId: string | null;
    precioCop: number | null;
    estado?: EstadoSuscripcion;
  }
): Promise<string> {
  const hoy = new Date();
  const fin = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);

  await guardarSuscripcion(orgId, {
    planId: datos.planId,
    precioCop: datos.precioCop,
    estado: datos.estado ?? 'active',
    inicio: hoy.toISOString().slice(0, 10),
    vencimiento: fin.toISOString().slice(0, 10),
  });

  await setDoc(
    suscripcionRef(orgId),
    { simulado: true, actualizadaEn: Date.now() },
    { merge: true }
  );

  return fin.toISOString().slice(0, 10);
}

/** OrgIds con suscripción registrada pero sin plan asignado. */
export function orgsSinPlan(suscripciones: Suscripcion[]): string[] {
  return suscripciones.filter((s) => !s.planId).map((s) => s.orgId);
}

/* -----------------------------------------------
   PAGOS
----------------------------------------------- */

function convertirPago(id: string, datos: DocumentData): Pago {
  return {
    id,
    orgId: String(datos.orgId ?? ''),
    suscripcionId: String(datos.suscripcionId ?? ''),
    periodo: String(datos.periodo ?? ''),
    montoCop: Number(datos.montoCop ?? 0),
    estado: datos.estado === 'pagado' ? 'pagado' : 'pendiente',
    metodo: (datos.metodo ?? 'transferencia') as Pago['metodo'],
    referencia: datos.referencia ?? null,
    registradoPor: String(datos.registradoPor ?? ''),
    registradoEn: Number(datos.registradoEn ?? 0),
    pagadoEn: datos.pagadoEn ?? null,
    simulado: datos.simulado === true ? true : undefined,
  };
}

export function suscribirPagosOrg(
  orgId: string,
  onData: (pagos: Pago[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION_PAGOS), where('orgId', '==', orgId)),
    (snapshot) => {
      onData(
        snapshot.docs
          .map((documento) => convertirPago(documento.id, documento.data()))
          .sort((a, b) => b.registradoEn - a.registradoEn)
      );
    },
    (error) => onError?.(error)
  );
}

/** Todos los pagos (solo super_admin). */
export function suscribirTodosPagos(
  onData: (pagos: Pago[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION_PAGOS), orderBy('registradoEn', 'desc')),
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) =>
          convertirPago(documento.id, documento.data())
        )
      );
    },
    (error) => onError?.(error)
  );
}

export async function registrarPago(datos: {
  orgId: string;
  periodo: string;
  montoCop: number;
  metodo?: Pago['metodo'];
  referencia?: string | null;
  registradoPor: string;
  pagado?: boolean;
}): Promise<string> {
  const referencia = doc(collection(db, COLECCION_PAGOS));
  const marca = Date.now();

  await setDoc(referencia, {
    orgId: datos.orgId,
    suscripcionId: datos.orgId,
    periodo: datos.periodo,
    montoCop: datos.montoCop,
    estado: datos.pagado ? 'pagado' : 'pendiente',
    metodo: datos.metodo ?? 'transferencia',
    referencia: datos.referencia ?? null,
    registradoPor: datos.registradoPor,
    registradoEn: marca,
    pagadoEn: datos.pagado ? new Date().toISOString() : null,
    /* F7: ningún pago se cobra de verdad. */
    simulado: true,
  });

  return referencia.id;
}

export async function marcarPagoPagado(pagoId: string): Promise<void> {
  await updateDoc(doc(db, COLECCION_PAGOS, pagoId), {
    estado: 'pagado',
    pagadoEn: new Date().toISOString(),
  });
}

/** Formatea un monto en pesos colombianos. */
export function formatearCop(monto: number | null | undefined): string {
  const valor = Number(monto ?? 0);
  return `$${valor.toLocaleString('es-CO')} COP`;
}

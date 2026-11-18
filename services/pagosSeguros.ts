/*
=======================================================
NITRO SYNC - PAGOS SIMULADOS DE CLIENTES A ASEGURADORAS
=======================================================

  pagosSeguros/{id}   (colección INDEPENDIENTE de
                       `comprasSuscripcion` y de `payments`)

Flulo acordado:

  - El CLIENTE registra el pago -> `pendiente`.
  - La ASEGURADORA receptora confirma o rechaza.
  - El SÚPER ADMINISTRADOR consulta todos.
  - Un pago CONFIRMADO o RECHAZADO es INMUTABLE.

Nunca hay cobro real: el registro pasa por `ProveedorPagos`
y el aviso por `ProveedorMensajes`, ambos simulados.

Consultas de UN SOLO campo (`orgId` / `propietarioUid`) para
evitar índices compuestos nuevos. El filtro por estado se
hace en cliente.
=======================================================
*/

import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import { formatearCop } from '@/services/facturacion';
import {
  proveedorMensajes,
  proveedorPagos,
  type ResultadoMensaje,
} from '@/services/proveedores';

import type {
  EstadoPagoSeguro,
  MetodoPagoSimulado,
  PagoSeguro,
} from '@/types/negocio';

const COLECCION = 'pagosSeguros';

function convertir(id: string, datos: DocumentData): PagoSeguro {
  return {
    id,
    orgId: String(datos.orgId ?? ''),
    vehiculoId: String(datos.vehiculoId ?? ''),
    propietarioUid: String(datos.propietarioUid ?? ''),
    polizaId: datos.polizaId ?? null,
    producto: String(datos.producto ?? 'Seguro'),
    periodo: String(datos.periodo ?? ''),
    montoCop: Number(datos.montoCop ?? 0),
    referencia: datos.referencia ?? null,
    estado: (datos.estado ?? 'pendiente') as EstadoPagoSeguro,
    simulado: true,
    registradoPor: String(datos.registradoPor ?? ''),
    registradoEn: Number(datos.registradoEn ?? 0),
    respondidaEn: datos.respondidaEn ?? null,
    clienteNombre: datos.clienteNombre ?? null,
    orgNombre: datos.orgNombre ?? null,
    concepto: datos.concepto ?? null,
    metodoPago: datos.metodoPago ?? null,
    fechaOperacion: datos.fechaOperacion ?? null,
    respondidaPor: datos.respondidaPor ?? null,
  };
}

/* -------------------------------------------------------
   SUSCRIPCIONES
------------------------------------------------------- */

export function suscribirPagosSegurosOrg(
  orgId: string,
  onData: (pagos: PagoSeguro[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION), where('orgId', '==', orgId)),
    (instantanea) => {
      onData(
        instantanea.docs
          .map((documento) => convertir(documento.id, documento.data()))
          .sort((a, b) => b.registradoEn - a.registradoEn)
      );
    },
    (error) => onError?.(error)
  );
}

export function suscribirPagosSegurosPropietario(
  propietarioUid: string,
  onData: (pagos: PagoSeguro[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION), where('propietarioUid', '==', propietarioUid)),
    (instantanea) => {
      onData(
        instantanea.docs
          .map((documento) => convertir(documento.id, documento.data()))
          .sort((a, b) => b.registradoEn - a.registradoEn)
      );
    },
    (error) => onError?.(error)
  );
}

export function suscribirTodosPagosSeguros(
  onData: (pagos: PagoSeguro[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, COLECCION),
    (instantanea) => {
      onData(
        instantanea.docs
          .map((documento) => convertir(documento.id, documento.data()))
          .sort((a, b) => b.registradoEn - a.registradoEn)
      );
    },
    (error) => onError?.(error)
  );
}

/** Filtro por estado en cliente (no requiere índice compuesto). */
export function filtrarPagosPorEstado(
  pagos: PagoSeguro[],
  estado: EstadoPagoSeguro | 'todos'
): PagoSeguro[] {
  return estado === 'todos' ? pagos : pagos.filter((pago) => pago.estado === estado);
}

/* -------------------------------------------------------
   REGISTRO (SIEMPRE SIMULADO)
------------------------------------------------------- */

export interface DatosPagoSeguro {
  orgId: string;
  orgNombre: string;
  vehiculoId: string;
  propietarioUid: string;
  clienteNombre: string;
  polizaId?: string | null;
  producto: string;
  concepto: string;
  periodo: string;
  montoCop: number;
  metodoPago: MetodoPagoSimulado;
  fechaOperacion: string;
  /** Quien registra: uid del cliente o de la aseguradora. */
  registradoPor: string;
}

/**
 * Registra un pago SIMULADO en estado PENDIENTE.
 * Las reglas comprueban que `registradoPor == auth.uid`, que
 * el vehículo pertenece al cliente (cuando lo crea uno) y que
 * la organización existe. El importe nunca lo valida el
 * navegador para las compras de suscripción; aquí es un pago
 * libre entre cliente y aseguradora.
 */
export async function registrarPagoSeguro(
  datos: DatosPagoSeguro
): Promise<{ id: string; referencia: string }> {
  if (!Number.isFinite(datos.montoCop) || datos.montoCop <= 0) {
    throw new Error('El valor del pago debe ser mayor a cero.');
  }

  const referencia = doc(collection(db, COLECCION));

  /* El proveedor simulado decide la referencia; no hay cobro real. */
  const resultado = await proveedorPagos.cobrar({
    referencia: referencia.id,
    montoCop: datos.montoCop,
    descripcion: `${datos.concepto || datos.producto} · ${datos.periodo}`,
  });

  if (!resultado.exito) {
    throw new Error(resultado.mensaje);
  }

  await setDoc(referencia, {
    orgId: datos.orgId,
    orgNombre: datos.orgNombre,
    vehiculoId: datos.vehiculoId,
    propietarioUid: datos.propietarioUid,
    clienteNombre: datos.clienteNombre,
    polizaId: datos.polizaId ?? null,
    producto: datos.producto,
    concepto: datos.concepto,
    periodo: datos.periodo,
    montoCop: datos.montoCop,
    metodoPago: datos.metodoPago,
    fechaOperacion: datos.fechaOperacion,
    referencia: resultado.referencia,
    estado: 'pendiente' as EstadoPagoSeguro,
    simulado: true,
    registradoPor: datos.registradoPor,
    registradoEn: Date.now(),
    respondidaEn: null,
    respondidaPor: null,
  });

  return { id: referencia.id, referencia: resultado.referencia };
}

/**
 * Solo la ASEGURADORA receptora confirma o rechaza, y solo
 * mientras el pago esté pendiente. Las reglas bloquean
 * cualquier otra modificación.
 */
export async function responderPagoSeguro(
  id: string,
  estado: Extract<EstadoPagoSeguro, 'confirmado' | 'rechazado'>,
  respondidaPor: string
): Promise<void> {
  await updateDoc(doc(db, COLECCION, id), {
    estado,
    respondidaEn: Date.now(),
    respondidaPor,
  });
}

/* -------------------------------------------------------
   AVISO POR WHATSAPP (WA.ME)
------------------------------------------------------- */

export function mensajePagoSeguro(datos: {
  aseguradora: string;
  propietario: string;
  vehiculo: string;
  montoCop: number;
  periodo: string;
}): string {
  return (
    `Hola ${datos.propietario || 'estimado cliente'}, de ${datos.aseguradora}. ` +
    `Registramos el pago ${datos.periodo} de tu seguro ${datos.vehiculo} ` +
    `por ${formatearCop(datos.montoCop)} (simulado, sin cobro real). ` +
    `La aseguradora revisará y confirmará el registro desde Nitro Sync.`
  );
}

export async function prepararAvisoPagoSeguro(datos: {
  destino: string | null;
  propietario: string;
  aseguradora: string;
  vehiculo: string;
  montoCop: number;
  periodo: string;
  referencia: string;
}): Promise<ResultadoMensaje> {
  return proveedorMensajes.preparar({
    destino: datos.destino,
    referencia: datos.referencia,
    mensaje: mensajePagoSeguro({
      aseguradora: datos.aseguradora,
      propietario: datos.propietario,
      vehiculo: datos.vehiculo,
      montoCop: datos.montoCop,
      periodo: datos.periodo,
    }),
  });
}

export async function abrirAvisoPagoSeguro(enlace: string): Promise<boolean> {
  return proveedorMensajes.abrir(enlace);
}

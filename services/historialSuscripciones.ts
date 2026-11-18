/*
=======================================================
NITRO SYNC - HISTORIAL DE SUSCRIPCIONES
=======================================================

  historialSuscripciones/{id}

Cada compra, aprobación, activación, renovación,
desactivación o cambio de precio deja un registro. Las
operaciones son SIMULADAS y llevan `simulado: true`.

El súper administrador ve todo; cada aseguradora solo ve
el historial de su propia organización.
=======================================================
*/

import {
  addDoc,
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import type {
  EstadoCompraSuscripcion,
  EstadoSuscripcion,
  HistorialSuscripcion,
  TipoHistorialSuscripcion,
} from '@/types/negocio';

const COLECCION = 'historialSuscripciones';

function convertir(id: string, datos: DocumentData): HistorialSuscripcion {
  return {
    id,
    orgId: String(datos.orgId ?? ''),
    orgNombre: datos.orgNombre ?? null,
    tipo: datos.tipo as TipoHistorialSuscripcion,
    estado: datos.estado ?? null,
    precioCop: datos.precioCop ?? null,
    fecha: String(datos.fecha ?? ''),
    responsableUid: String(datos.responsableUid ?? ''),
    responsableCorreo: datos.responsableCorreo ?? null,
    motivo: datos.motivo ?? null,
    creadoEn: Number(datos.creadoEn ?? 0),
    simulado: true,
  };
}

export interface DatosHistorial {
  orgId: string;
  orgNombre?: string | null;
  tipo: TipoHistorialSuscripcion;
  estado?: EstadoSuscripcion | EstadoCompraSuscripcion | null;
  precioCop?: number | null;
  fecha?: string;
  responsableUid: string;
  responsableCorreo?: string | null;
  motivo?: string | null;
}

export async function registrarHistorialSuscripcion(
  datos: DatosHistorial
): Promise<string> {
  const referencia = await addDoc(collection(db, COLECCION), {
    orgId: datos.orgId,
    orgNombre: datos.orgNombre ?? null,
    tipo: datos.tipo,
    estado: datos.estado ?? null,
    precioCop: datos.precioCop ?? null,
    fecha: datos.fecha ?? new Date().toISOString(),
    responsableUid: datos.responsableUid,
    responsableCorreo: datos.responsableCorreo ?? null,
    motivo: datos.motivo ?? null,
    creadoEn: Date.now(),
    simulado: true,
  });

  return referencia.id;
}

/** Historial completo (solo súper administrador). */
export function suscribirHistorialSuscripciones(
  onData: (historial: HistorialSuscripcion[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, COLECCION),
    (instantanea) => {
      onData(
        instantanea.docs
          .map((documento) => convertir(documento.id, documento.data()))
          .sort((a, b) => b.creadoEn - a.creadoEn)
      );
    },
    (error) => onError?.(error)
  );
}

/** Historial de una aseguradora (una sola condición: sin índice nuevo). */
export function suscribirHistorialOrg(
  orgId: string | null,
  onData: (historial: HistorialSuscripcion[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!orgId) {
    onData([]);
    return () => {};
  }

  return onSnapshot(
    query(collection(db, COLECCION), where('orgId', '==', orgId)),
    (instantanea) => {
      onData(
        instantanea.docs
          .map((documento) => convertir(documento.id, documento.data()))
          .sort((a, b) => b.creadoEn - a.creadoEn)
      );
    },
    (error) => onError?.(error)
  );
}

export interface FiltrosHistorial {
  orgId?: string | null;
  tipo?: TipoHistorialSuscripcion | null;
  estado?: string | null;
  desde?: string | null;
  hasta?: string | null;
}

/** Filtros en cliente: evitan índices compuestos nuevos. */
export function filtrarHistorialSuscripciones(
  registros: HistorialSuscripcion[],
  filtros: FiltrosHistorial = {}
): HistorialSuscripcion[] {
  return registros.filter((registro) => {
    if (filtros.orgId && registro.orgId !== filtros.orgId) return false;
    if (filtros.tipo && registro.tipo !== filtros.tipo) return false;
    if (filtros.estado && registro.estado !== filtros.estado) return false;

    const dia = registro.fecha.slice(0, 10);
    if (filtros.desde && dia < filtros.desde) return false;
    if (filtros.hasta && dia > filtros.hasta) return false;

    return true;
  });
}

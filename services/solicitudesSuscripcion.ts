/*
=======================================================
NITRO SYNC - SOLICITUDES DE CAMBIO DE PLAN (F7)
=======================================================

  solicitudesSuscripcion/{id}

La aseguradora pide un cambio de plan; el super
administrador lo aprueba o lo rechaza. Es SIMULADO: no
genera ningún cobro ni comunicación externa.

Consultas de UN SOLO campo (`orgId`) para no necesitar
índices compuestos nuevos. La ordenación se hace en el
cliente.
=======================================================
*/

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import type {
  EstadoSolicitudSuscripcion,
  SolicitudSuscripcion,
} from '@/types/negocio';

const COLECCION = 'solicitudesSuscripcion';

function convertir(id: string, datos: DocumentData): SolicitudSuscripcion {
  return {
    id,
    orgId: String(datos.orgId ?? ''),
    planId: String(datos.planId ?? ''),
    planNombre: String(datos.planNombre ?? 'Plan'),
    precioCop: Number(datos.precioCop ?? 0),
    motivo: datos.motivo ?? null,
    estado: (datos.estado ?? 'pendiente') as EstadoSolicitudSuscripcion,
    solicitadoPor: String(datos.solicitadoPor ?? ''),
    solicitadoEn: Number(datos.solicitadoEn ?? 0),
    respondidaPor: datos.respondidaPor ?? null,
    respondidaEn: datos.respondidaEn ?? null,
    simulado: true,
  };
}

export function suscribirSolicitudesSuscripcion(
  onData: (solicitudes: SolicitudSuscripcion[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, COLECCION),
    (instantanea) => {
      onData(
        instantanea.docs
          .map((documento) => convertir(documento.id, documento.data()))
          .sort((a, b) => b.solicitadoEn - a.solicitadoEn)
      );
    },
    (error) => onError?.(error)
  );
}

export function suscribirSolicitudesOrg(
  orgId: string,
  onData: (solicitudes: SolicitudSuscripcion[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION), where('orgId', '==', orgId)),
    (instantanea) => {
      onData(
        instantanea.docs
          .map((documento) => convertir(documento.id, documento.data()))
          .sort((a, b) => b.solicitadoEn - a.solicitadoEn)
      );
    },
    (error) => onError?.(error)
  );
}

export async function crearSolicitudSuscripcion(datos: {
  orgId: string;
  planId: string;
  planNombre: string;
  precioCop: number;
  motivo?: string | null;
  solicitadoPor: string;
}): Promise<string> {
  const referencia = await addDoc(collection(db, COLECCION), {
    orgId: datos.orgId,
    planId: datos.planId,
    planNombre: datos.planNombre,
    precioCop: datos.precioCop,
    motivo: datos.motivo?.trim() || null,
    estado: 'pendiente' as EstadoSolicitudSuscripcion,
    solicitadoPor: datos.solicitadoPor,
    solicitadoEn: Date.now(),
    respondidaPor: null,
    respondidaEn: null,
    simulado: true,
  });

  return referencia.id;
}

export async function responderSolicitudSuscripcion(
  id: string,
  estado: Extract<EstadoSolicitudSuscripcion, 'aprobada' | 'rechazada'>,
  respondidaPor: string
): Promise<void> {
  await updateDoc(doc(db, COLECCION, id), {
    estado,
    respondidaPor,
    respondidaEn: Date.now(),
  });
}

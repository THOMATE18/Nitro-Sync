/*
=======================================================
NITRO SYNC - NOTIFICACIONES DEL SÚPER ADMINISTRADOR
=======================================================

  notificacionesAdmin/{compraId}

Documentos persistentes y en tiempo real: una notificación
por compra SIMULADA del plan SÚPER EMPRESARIAL.

Permite: contador de no leídas, historial, marcar como leída
y abrir directamente la compra en el panel.
=======================================================
*/

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import type { NotificacionAdmin } from '@/types/negocio';

const COLECCION = 'notificacionesAdmin';

function convertir(id: string, datos: DocumentData): NotificacionAdmin {
  return {
    id,
    compraId: String(datos.compraId ?? id),
    orgId: String(datos.orgId ?? ''),
    orgNombre: String(datos.orgNombre ?? ''),
    planId: String(datos.planId ?? ''),
    planNombre: String(datos.planNombre ?? ''),
    precioCop: Number(datos.precioCop ?? 0),
    fechaCompra: String(datos.fechaCompra ?? ''),
    estadoCompra: datos.estadoCompra ?? 'pendiente',
    leida: datos.leida === true,
    leidaPor: datos.leidaPor ?? null,
    leidaEn: datos.leidaEn ?? null,
    creadoEn: Number(datos.creadoEn ?? 0),
    simulado: true,
  };
}

function ordenar(items: NotificacionAdmin[]): NotificacionAdmin[] {
  return [...items].sort((a, b) => b.creadoEn - a.creadoEn);
}

/** Todas las notificaciones (solo super_admin). */
export function suscribirNotificacionesAdmin(
  onData: (notificaciones: NotificacionAdmin[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, COLECCION),
    (instantanea) => {
      onData(
        ordenar(
          instantanea.docs.map((documento) =>
            convertir(documento.id, documento.data())
          )
        )
      );
    },
    (error) => onError?.(error)
  );
}

/** Solo no leídas: una condición simple, sin índice compuesto. */
export function suscribirNotificacionesNoLeidas(
  onData: (notificaciones: NotificacionAdmin[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION), where('leida', '==', false)),
    (instantanea) => {
      onData(
        ordenar(
          instantanea.docs.map((documento) =>
            convertir(documento.id, documento.data())
          )
        )
      );
    },
    (error) => onError?.(error)
  );
}

export async function marcarNotificacionLeida(
  notificacion: NotificacionAdmin,
  administradorUid: string
): Promise<void> {
  if (notificacion.leida) return;

  await docUpdate(notificacion.id, administradorUid);
}

async function docUpdate(id: string, administradorUid: string): Promise<void> {
  await writeBatch(db)
    .update(doc(db, COLECCION, id), {
      leida: true,
      leidaPor: administradorUid,
      leidaEn: Date.now(),
    })
    .commit();
}

export async function marcarTodasLeidas(
  notificaciones: NotificacionAdmin[],
  administradorUid: string
): Promise<void> {
  const pendientes = notificaciones.filter((item) => !item.leida);
  if (pendientes.length === 0) return;

  const lote = writeBatch(db);
  for (const notificacion of pendientes) {
    lote.update(doc(db, COLECCION, notificacion.id), {
      leida: true,
      leidaPor: administradorUid,
      leidaEn: Date.now(),
    });
  }

  await lote.commit();
}

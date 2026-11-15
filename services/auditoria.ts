/*
=======================================================
NITRO SYNC - AUDITORÍA
=======================================================

  auditLogs/{logId}

Registro de acciones sensibles de los paneles de
aseguradora y super administrador: creación de pólizas,
cambios de suscripción, habilitación/deshabilitación de
organizaciones, envíos por WhatsApp, etc.

Solo el super administrador puede leer toda la auditoría.
El actor queda registrado con su uid, correo y rol.
=======================================================
*/

import {
  addDoc,
  collection,
  limit as limitar,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import type { RegistroAuditoria, Rol } from '@/types/negocio';

const COLECCION = 'auditLogs';

function convertir(id: string, datos: DocumentData): RegistroAuditoria {
  return {
    id,
    actorUid: String(datos.actorUid ?? ''),
    actorCorreo: datos.actorCorreo ?? null,
    actorRol: (datos.actorRol ?? null) as Rol | null,
    orgId: datos.orgId ?? null,
    accion: String(datos.accion ?? ''),
    entidad: String(datos.entidad ?? ''),
    entidadId: String(datos.entidadId ?? ''),
    detalle:
      datos.detalle && typeof datos.detalle === 'object'
        ? (datos.detalle as RegistroAuditoria['detalle'])
        : {},
    creadoEn: Number(datos.creadoEn ?? 0),
  };
}

export interface DatosAuditoria {
  actorUid: string;
  actorCorreo: string | null;
  actorRol: Rol | null;
  orgId?: string | null;
  accion: string;
  entidad: string;
  entidadId: string;
  detalle?: RegistroAuditoria['detalle'];
}

/**
 * Registra una acción. Nunca lanza: si falla, la operación
 * principal del usuario no debe romperse por la auditoría.
 */
export async function registrarAuditoria(datos: DatosAuditoria): Promise<void> {
  try {
    await addDoc(collection(db, COLECCION), {
      actorUid: datos.actorUid,
      actorCorreo: datos.actorCorreo,
      actorRol: datos.actorRol,
      orgId: datos.orgId ?? null,
      accion: datos.accion,
      entidad: datos.entidad,
      entidadId: datos.entidadId,
      detalle: datos.detalle ?? {},
      creadoEn: Date.now(),
    });
  } catch {
    /* La auditoría es best-effort. */
  }
}

/** Últimos registros (solo super_admin puede leerlos). */
export function suscribirAuditoria(
  onData: (registros: RegistroAuditoria[]) => void,
  onError?: (error: Error) => void,
  maximo = 100
): () => void {
  return onSnapshot(
    query(
      collection(db, COLECCION),
      orderBy('creadoEn', 'desc'),
      limitar(maximo)
    ),
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) =>
          convertir(documento.id, documento.data())
        )
      );
    },
    (error) => onError?.(error)
  );
}

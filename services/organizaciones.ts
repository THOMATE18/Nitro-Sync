/*
=======================================================
NITRO SYNC - ORGANIZACIONES (ASEGURADORAS)
=======================================================

  organizations/{orgId}

Cada aseguradora es una organización independiente.
El super_admin las administra; cada aseguradora solo
puede leer la suya.

Los datos de contacto (web, teléfono, WhatsApp) se
conservan también en `data/aseguradoras.ts`, que sigue
siendo la fuente única del directorio público.
=======================================================
*/

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import { claveAseguradora } from '@/data/aseguradoras';

import type { EstadoOrganizacion, Organizacion } from '@/types/negocio';

const COLECCION = 'organizations';

function convertir(id: string, datos: DocumentData): Organizacion {
  const nombre = String(datos.nombre ?? 'Sin nombre');

  /*
  La clave se calcula SIEMPRE a partir del nombre. Si el
  documento ya la trae se respeta; si no (organizaciones
  creadas antes de que existiera el campo), se deriva aquí
  para que el panel funcione sin intervención manual.
  */
  const claveGuardada = String(datos.aseguradoraClave ?? '');

  return {
    id,
    nombre,
    slug: String(datos.slug ?? id),
    correo: datos.correo ?? null,
    telefono: datos.telefono ?? null,
    web: datos.web ?? null,
    whatsapp: datos.whatsapp ?? null,
    color: datos.color ?? null,
    especialidad: datos.especialidad ?? null,
    estado: (datos.estado ?? 'pending') as EstadoOrganizacion,
    accesoHabilitado: datos.accesoHabilitado !== false,
    creadaEn: datos.creadaEn ?? null,
    actualizadaEn: datos.actualizadaEn ?? null,
    aseguradoraClave: claveGuardada || claveAseguradora(nombre) || null,
    telefonoContacto: datos.telefonoContacto ?? null,
  };
}

export function organizacionRef(orgId: string) {
  return doc(db, COLECCION, orgId);
}

/** Todas las organizaciones (solo super_admin puede leerlas). */
export function suscribirOrganizaciones(
  onData: (organizaciones: Organizacion[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION), orderBy('nombre')),
    (snapshot) => {
      onData(snapshot.docs.map((documento) => convertir(documento.id, documento.data())));
    },
    (error) => onError?.(error)
  );
}

/**
 * Organización por clave normalizada de aseguradora.
 * Los clientes la usan para leer la LÍNEA DE ATENCIÓN en
 * tiempo real (una sola condición: sin índice compuesto).
 */
export function suscribirOrganizacionPorClave(
  clave: string | null,
  onData: (organizacion: Organizacion | null) => void,
  onError?: (error: Error) => void
): () => void {
  if (!clave) {
    onData(null);
    return () => {};
  }

  return onSnapshot(
    query(collection(db, COLECCION), where('aseguradoraClave', '==', clave)),
    (instantanea) => {
      onData(
        instantanea.empty ? null : convertir(instantanea.docs[0].id, instantanea.docs[0].data())
      );
    },
    (error) => onError?.(error)
  );
}

/** Una organización concreta (su propia aseguradora). */
export function suscribirOrganizacion(
  orgId: string | null,
  onData: (organizacion: Organizacion | null) => void,
  onError?: (error: Error) => void
): () => void {
  if (!orgId) {
    onData(null);
    return () => {};
  }

  return onSnapshot(
    organizacionRef(orgId),
    (documento) => {
      onData(documento.exists() ? convertir(documento.id, documento.data()) : null);
    },
    (error) => onError?.(error)
  );
}

export async function actualizarOrganizacion(
  orgId: string,
  cambios: Partial<
    Pick<
      Organizacion,
      'estado' | 'accesoHabilitado' | 'aseguradoraClave' | 'telefonoContacto'
    >
  >
): Promise<void> {
  await updateDoc(organizacionRef(orgId), {
    ...cambios,
    actualizadaEn: new Date().toISOString(),
  });
}

export interface NuevaOrganizacion {
  slug: string;
  nombre: string;
  correo: string;
  telefono?: string | null;
  web?: string | null;
  whatsapp?: string | null;
  especialidad?: string | null;
}

export async function crearOrganizacion(datos: NuevaOrganizacion): Promise<string> {
  const marca = new Date().toISOString();

  await setDoc(organizacionRef(datos.slug), {
    nombre: datos.nombre,
    slug: datos.slug,
    correo: datos.correo,
    telefono: datos.telefono ?? null,
    web: datos.web ?? null,
    whatsapp: datos.whatsapp ?? null,
    color: null,
    especialidad: datos.especialidad ?? null,
    estado: 'pending' as EstadoOrganizacion,
    accesoHabilitado: true,
    creadaEn: marca,
    actualizadaEn: marca,
    aseguradoraClave: claveAseguradora(datos.nombre) || null,
    telefonoContacto: null,
  });

  return datos.slug;
}

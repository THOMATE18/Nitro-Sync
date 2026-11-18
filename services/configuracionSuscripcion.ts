/*
=======================================================
NITRO SYNC - CONFIGURACIÓN DEL PLAN SÚPER EMPRESARIAL
=======================================================

Fuente única del precio vigente:

  configuracionSuscripcion/super_empresarial

Cualquier usuario autenticado puede LEERLO (las aseguradoras
necesitan el precio para comprar; los clientes pueden verlo).
Solo el súper administrador puede ESCRIBIRLO.

Si el documento aún no existe se usa el valor inicial de
`data/planSuscripcion.ts`, que es el único lugar donde aparece
el $149.900 de demostración.

La histórica de cambios vive en:

  configuracionSuscripcion/super_empresarial/historial/{id}
=======================================================
*/

import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import {
  ID_CONFIGURACION_SUSCRIPCION,
  PLAN_SUPER_EMPRESARIAL,
} from '@/data/planSuscripcion';

import type {
  ConfiguracionSuscripcion,
  HistorialPrecioSuscripcion,
} from '@/types/negocio';

const COLECCION = 'configuracionSuscripcion';

export function configuracionSuscripcionRef() {
  return doc(db, COLECCION, ID_CONFIGURACION_SUSCRIPCION);
}

function convertir(datos: DocumentData): ConfiguracionSuscripcion {
  return {
    id: ID_CONFIGURACION_SUSCRIPCION,
    planId: String(datos.planId ?? PLAN_SUPER_EMPRESARIAL.id),
    nombre: String(datos.nombre ?? PLAN_SUPER_EMPRESARIAL.nombre),
    precioCop: Number(datos.precioCop ?? PLAN_SUPER_EMPRESARIAL.precioInicialCop),
    moneda: 'COP',
    periodicidad: 'monthly',
    descripcion: String(datos.descripcion ?? PLAN_SUPER_EMPRESARIAL.descripcion),
    beneficios: Array.isArray(datos.beneficios)
      ? datos.beneficios.map((b: unknown) => String(b))
      : [...PLAN_SUPER_EMPRESARIAL.beneficios],
    actualizadaEn: Number(datos.actualizadaEn ?? 0),
    actualizadaPor: String(datos.actualizadaPor ?? ''),
    actualizadoPorCorreo: datos.actualizadoPorCorreo ?? null,
  };
}

/** Configuración por defecto cuando nadie ha guardado aún un precio. */
export function configuracionPorDefecto(): ConfiguracionSuscripcion {
  return {
    id: ID_CONFIGURACION_SUSCRIPCION,
    planId: PLAN_SUPER_EMPRESARIAL.id,
    nombre: PLAN_SUPER_EMPRESARIAL.nombre,
    precioCop: PLAN_SUPER_EMPRESARIAL.precioInicialCop,
    moneda: 'COP',
    periodicidad: 'monthly',
    descripcion: PLAN_SUPER_EMPRESARIAL.descripcion,
    beneficios: [...PLAN_SUPER_EMPRESARIAL.beneficios],
    actualizadaEn: 0,
    actualizadaPor: '',
    actualizadoPorCorreo: null,
  };
}

/** Lee la configuración vigente (o los valores iniciales). */
export async function leerConfiguracionSuscripcion(): Promise<ConfiguracionSuscripcion> {
  const documento = await getDoc(configuracionSuscripcionRef());

  return documento.exists() ? convertir(documento.data()) : configuracionPorDefecto();
}

/** Suscripción en tiempo real al precio vigente. */
export function suscribirConfiguracionSuscripcion(
  onData: (configuracion: ConfiguracionSuscripcion) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    configuracionSuscripcionRef(),
    (documento) => {
      onData(documento.exists() ? convertir(documento.data()) : configuracionPorDefecto());
    },
    (error) => onError?.(error)
  );
}

export function suscribirHistorialPreciosSuscripcion(
  onData: (historial: HistorialPrecioSuscripcion[]) => void,
  onError?: (error: Error) => void
): () => void {
  const ruta = collection(db, COLECCION, ID_CONFIGURACION_SUSCRIPCION, 'historial');

  return onSnapshot(
    query(ruta, orderBy('creadoEn', 'desc')),
    (instantanea) => {
      onData(
        instantanea.docs.map((documento) => ({
          id: documento.id,
          planId: String(documento.data().planId ?? ID_CONFIGURACION_SUSCRIPCION),
          precioCop: Number(documento.data().precioCop ?? 0),
          precioAnteriorCop: Number(documento.data().precioAnteriorCop ?? 0),
          cambiadoPor: String(documento.data().cambiadoPor ?? ''),
          cambiadoCorreo: documento.data().cambiadoCorreo ?? null,
          creadoEn: Number(documento.data().creadoEn ?? 0),
        }))
      );
    },
    (error) => onError?.(error)
  );
}

/**
 * Guarda un nuevo precio. Solo lo llama el panel del súper
 * administrador; las reglas lo validan también en Firebase.
 */
export async function guardarPrecioSuscripcion(
  precioCop: number,
  administrador: { uid: string; correo: string | null }
): Promise<void> {
  if (!Number.isFinite(precioCop) || precioCop <= 0) {
    throw new Error('El precio debe ser mayor a cero.');
  }

  const anterior = await leerConfiguracionSuscripcion();
  const ahora = Date.now();

  await setDoc(
    configuracionSuscripcionRef(),
    {
      planId: ID_CONFIGURACION_SUSCRIPCION,
      nombre: PLAN_SUPER_EMPRESARIAL.nombre,
      precioCop,
      moneda: 'COP',
      periodicidad: 'monthly',
      descripcion: PLAN_SUPER_EMPRESARIAL.descripcion,
      beneficios: [...PLAN_SUPER_EMPRESARIAL.beneficios],
      actualizadaEn: ahora,
      actualizadaPor: administrador.uid,
      actualizadoPorCorreo: administrador.correo,
    },
    { merge: true }
  );

  /* El historial conserva SIEMPRE el precio anterior. */
  await addDoc(
    collection(db, COLECCION, ID_CONFIGURACION_SUSCRIPCION, 'historial'),
    {
      planId: ID_CONFIGURACION_SUSCRIPCION,
      precioCop,
      precioAnteriorCop: anterior.precioCop,
      cambiadoPor: administrador.uid,
      cambiadoCorreo: administrador.correo,
      creadoEn: ahora,
    }
  );
}

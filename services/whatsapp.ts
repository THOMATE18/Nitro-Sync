/*
=======================================================
NITRO SYNC - WHATSAPP Y NOTIFICACIONES
=======================================================

La app NO tiene credenciales de Meta, así que no puede
enviar mensajes por la API de WhatsApp. En su lugar:

  1. Se construye un enlace `wa.me` con un mensaje
     prellenado (plantilla). El usuario lo abre desde la
     app y el mensaje sale de SU número.
  2. Se registra cada aviso en `notificationLogs` para
     tener trazabilidad (pendiente / manual / enviado /
     omitido).

Cuando exista backend con la WhatsApp Cloud API, el mismo
registro servirá para marcar `enviado` automáticamente.
Sin credenciales, el estado queda en `manual`.

El envío comercial (promocionar planes) SOLO se hace si la
aseguradora dio su opt-in. El operativo (recordatorios,
renovaciones) no requiere opt-in porque es parte del
servicio contratado.
=======================================================
*/

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';

import { Linking } from 'react-native';

import { db } from '@/firebaseConfig';

import {
  idNotificacion,
  type CanalNotificacion,
  type EstadoNotificacion,
  type RegistroNotificacion,
} from '@/types/negocio';

const COLECCION = 'notificationLogs';

/* -----------------------------------------------
   ENLACES wa.me
----------------------------------------------- */

/** Deja solo dígitos (wa.me no acepta espacios ni guiones). */
export function numeroWhatsapp(numero: string | null | undefined): string {
  return (numero ?? '').replace(/[^\d]/g, '');
}

/**
 * Construye un enlace `wa.me` con el mensaje prellenado.
 * Devuelve null si el número no es válido.
 */
export function construirEnlaceWhatsapp(
  numero: string | null | undefined,
  mensaje: string
): string | null {
  const destino = numeroWhatsapp(numero);

  if (destino.length < 8) return null;

  return `https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`;
}

/** Abre el enlace en WhatsApp (o el navegador en web). */
export async function abrirWhatsapp(enlace: string): Promise<boolean> {
  try {
    await Linking.openURL(enlace);
    return true;
  } catch {
    return false;
  }
}

/* -----------------------------------------------
   PLANTILLAS
----------------------------------------------- */

export type PlantillaWhatsapp =
  | 'recordatorio_soat'
  | 'recordatorio_seguro'
  | 'renovacion'
  | 'oferta_comercial';

export const PLANTILLAS: Record<
  PlantillaWhatsapp,
  { titulo: string; requiereOptIn: boolean }
> = {
  recordatorio_soat: { titulo: 'Recordatorio SOAT', requiereOptIn: false },
  recordatorio_seguro: { titulo: 'Recordatorio de seguro', requiereOptIn: false },
  renovacion: { titulo: 'Renovación de póliza', requiereOptIn: false },
  oferta_comercial: { titulo: 'Oferta comercial', requiereOptIn: true },
};

export function redactarPlantilla(
  plantilla: PlantillaWhatsapp,
  variables: Record<string, string>
): string {
  const nombre = variables.propietario ?? 'estimado cliente';
  const aseguradora = variables.aseguradora ?? 'tu aseguradora';
  const vehiculo = variables.vehiculo ?? 'tu vehículo';
  const fecha = variables.fecha ?? '';

  switch (plantilla) {
    case 'recordatorio_soat':
      return `Hola ${nombre}, te escribimos de ${aseguradora}. El SOAT de ${vehiculo} vence el ${fecha}. ¿Deseas renovarlo con nosotros?`;

    case 'recordatorio_seguro':
      return `Hola ${nombre}, de ${aseguradora}. El seguro de ${vehiculo} vence el ${fecha}. Escríbenos para renovarlo sin perder cobertura.`;

    case 'renovacion':
      return `Hola ${nombre}, ${aseguradora} tiene lista la renovación de la póliza de ${vehiculo} con vencimiento ${fecha}. ¿Te enviamos la propuesta?`;

    case 'oferta_comercial':
      return `Hola ${nombre}, en ${aseguradora} tenemos una promoción para ${vehiculo}. ¿Quieres que te cuente los detalles?`;

    default:
      return `Hola ${nombre}, te escribimos de ${aseguradora}.`;
  }
}

/* -----------------------------------------------
   REGISTRO DE AVISOS
----------------------------------------------- */

function convertir(id: string, datos: DocumentData): RegistroNotificacion {
  return {
    id,
    canal: (datos.canal ?? 'whatsapp') as CanalNotificacion,
    motivo: datos.motivo ?? null,
    orgId: datos.orgId ?? null,
    propietarioUid: datos.propietarioUid ?? null,
    vehiculoId: datos.vehiculoId ?? null,
    destino: datos.destino ?? null,
    plantilla: String(datos.plantilla ?? ''),
    variables:
      datos.variables && typeof datos.variables === 'object'
        ? (datos.variables as Record<string, string>)
        : {},
    estado: (datos.estado ?? 'pendiente') as EstadoNotificacion,
    creadoEn: Number(datos.creadoEn ?? 0),
    enviadoEn: datos.enviadoEn ?? null,
  };
}

export interface NuevoAviso {
  canal: CanalNotificacion;
  orgId: string | null;
  propietarioUid: string | null;
  vehiculoId: string | null;
  destino: string | null;
  plantilla: string;
  variables: Record<string, string>;
  estado: EstadoNotificacion;
  /** Motivo cuando el aviso no se pudo enviar. */
  motivo?: string | null;
  /** Fecha para la clave de idempotencia (AAAA-MM-DD). */
  fecha: string;
  /** Referencia única (póliza, vínculo...). */
  referencia: string;
}

export async function registrarAviso(datos: NuevoAviso): Promise<string> {
  const id = idNotificacion(
    datos.canal,
    datos.referencia,
    datos.plantilla,
    datos.fecha
  );

  await addDoc(collection(db, COLECCION), {
    _claveIdempotencia: id,
    canal: datos.canal,
    motivo: datos.motivo ?? null,
    orgId: datos.orgId,
    propietarioUid: datos.propietarioUid,
    vehiculoId: datos.vehiculoId,
    destino: datos.destino,
    plantilla: datos.plantilla,
    variables: datos.variables,
    estado: datos.estado,
    creadoEn: Date.now(),
    enviadoEn: datos.estado === 'enviado' ? new Date().toISOString() : null,
  });

  return id;
}

export async function marcarAvisoEnviado(avisoId: string): Promise<void> {
  await updateDoc(doc(db, COLECCION, avisoId), {
    estado: 'enviado' as EstadoNotificacion,
    enviadoEn: new Date().toISOString(),
  });
}

export function suscribirAvisosOrg(
  orgId: string,
  onData: (avisos: RegistroNotificacion[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, COLECCION),
      where('orgId', '==', orgId),
      orderBy('creadoEn', 'desc')
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

/**
 * Flujo completo de un aviso manual por WhatsApp:
 *
 *   1. Si el número no existe -> se registra como `omitido`.
 *   2. Si la plantilla es comercial y no hay opt-in ->
 *      `omitido` con motivo `sin_opt_in_comercial`.
 *   3. En otro caso se registra `manual` y se devuelve el
 *      enlace wa.me para abrirlo.
 *
 * Nunca lanza: devuelve el resultado para que la pantalla
 * decida qué mostrar.
 */
export async function prepararAvisoWhatsapp(datos: {
  orgId: string | null;
  propietarioUid: string | null;
  vehiculoId: string | null;
  destino: string | null;
  plantilla: PlantillaWhatsapp;
  variables: Record<string, string>;
  referencia: string;
  fecha: string;
  optInComercial: boolean;
}): Promise<{ estado: EstadoNotificacion; enlace: string | null; motivo: string | null }> {
  const mensaje = redactarPlantilla(datos.plantilla, datos.variables);
  const enlace = construirEnlaceWhatsapp(datos.destino, mensaje);

  if (!enlace) {
    await registrarAviso({
      canal: 'whatsapp',
      orgId: datos.orgId,
      propietarioUid: datos.propietarioUid,
      vehiculoId: datos.vehiculoId,
      destino: datos.destino,
      plantilla: datos.plantilla,
      variables: datos.variables,
      estado: 'omitido',
      motivo: 'sin_telefono',
      fecha: datos.fecha,
      referencia: datos.referencia,
    });

    return { estado: 'omitido', enlace: null, motivo: 'sin_telefono' };
  }

  if (PLANTILLAS[datos.plantilla].requiereOptIn && !datos.optInComercial) {
    await registrarAviso({
      canal: 'whatsapp',
      orgId: datos.orgId,
      propietarioUid: datos.propietarioUid,
      vehiculoId: datos.vehiculoId,
      destino: datos.destino,
      plantilla: datos.plantilla,
      variables: datos.variables,
      estado: 'omitido',
      motivo: 'sin_opt_in_comercial',
      fecha: datos.fecha,
      referencia: datos.referencia,
    });

    return {
      estado: 'omitido',
      enlace: null,
      motivo: 'sin_opt_in_comercial',
    };
  }

  await registrarAviso({
    canal: 'whatsapp',
    orgId: datos.orgId,
    propietarioUid: datos.propietarioUid,
    vehiculoId: datos.vehiculoId,
    destino: datos.destino,
    plantilla: datos.plantilla,
    variables: datos.variables,
    estado: 'manual',
    motivo: null,
    fecha: datos.fecha,
    referencia: datos.referencia,
  });

  return { estado: 'manual', enlace, motivo: null };
}

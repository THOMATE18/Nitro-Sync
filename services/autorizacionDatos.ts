/*
=======================================================
NITRO SYNC - AUTORIZACIÓN DE TRATAMIENTO DE DATOS
=======================================================

Ley 1581 de 2012 (Colombia) - protección de datos
personales.

El propietario (y cualquier usuario de la plataforma)
debe autorizar de forma EXPRESA, LIBRE E INFORMADA el
tratamiento de sus datos personales antes de usar la
aplicación.

QUÉ SE GUARDA

En `usuarios/{uid}.autorizacionDatos`:

  - version      -> versión del texto aceptado.
  - aceptadoEn   -> fecha y hora exactas (ISO).
  - aceptadoPor  -> uid de quien aceptó (trazabilidad).
  - correo       -> correo de la cuenta.

Y en el historial append-only
`usuarios/{uid}/autorizaciones/{version}` para conservar
la evidencia de cada versión aceptada (si el texto cambia,
la versión nueva se guarda aparte; nunca se sobrescribe la
anterior).

REGLA DE NEGOCIO

`autorizacionVigente()` devuelve false mientras el perfil
no tenga la versión ACTUAL aceptada. El layout raíz usa
ese dato para bloquear la navegación hasta que la persona
acepte.
=======================================================
*/

import { doc, getDoc, setDoc } from 'firebase/firestore';

import { db } from '@/firebaseConfig';

/*
=======================================================
VERSIÓN DEL TEXTO

Al cambiar el contenido legal se sube esta versión
(p. ej. '2027-01-01'); así se vuelve a pedir la
autorización y queda registro de la anterior.
=======================================================
*/
export const VERSION_AUTORIZACION_DATOS = '2026-11-17';

export const TITULO_AUTORIZACION_DATOS =
  'Autorización para el tratamiento de datos personales';

export const TEXTO_AUTORIZACION_DATOS = `Autorizo de manera previa, expresa e informada a Nitro Sync para recolectar, almacenar, usar, circular y suprimir mis datos personales (identificación, contacto, datos del vehículo y de sus pólizas) con las siguientes finalidades:

1. Prestar el servicio de gestión del garaje: registrar vehículos, documentos (SOAT, técnico-mecánica, seguro), mantenimientos, recordatorios y gastos.

2. Enviar recordatorios y avisos de vencimiento por notificaciones, correo electrónico o WhatsApp, cuando yo lo haya autorizado.

3. Compartir los datos técnicos de mis vehículos (foto, placa, marca, modelo, año, tipo, estado y vencimiento del seguro) y mis datos de contacto (nombre y teléfono) ÚNICAMENTE con la aseguradora con la que mi vehículo tenga el seguro vigente, para la gestión de mi póliza, la atención de mis solicitudes y el contacto por WhatsApp sobre renovaciones. No se comparten mis gastos, mantenimientos, documentos, ubicación ni correo.

Conozco que puedo conocer, actualizar, rectificar y suprimir mis datos, así como revocar esta autorización, escribiendo al correo de soporte de la plataforma, y que la revocatoria no procede cuando exista un deber legal de conservar la información.`;

export interface AutorizacionDatos {
  version: string;
  aceptadoEn: string;
  aceptadoPor: string;
  correo: string;
}

function convertir(datos: Record<string, unknown>): AutorizacionDatos | null {
  const autorizacion = datos?.autorizacionDatos as
    | Partial<AutorizacionDatos>
    | undefined;

  if (!autorizacion || typeof autorizacion.version !== 'string') {
    return null;
  }

  return {
    version: autorizacion.version,
    aceptadoEn: String(autorizacion.aceptadoEn ?? ''),
    aceptadoPor: String(autorizacion.aceptadoPor ?? ''),
    correo: String(autorizacion.correo ?? ''),
  };
}

/**
 * ¿El perfil ya tiene aceptada la versión ACTUAL del texto?
 * Se usa como gate en el layout raíz.
 */
export function autorizacionVigente(autorizacion: AutorizacionDatos | null): boolean {
  return autorizacion?.version === VERSION_AUTORIZACION_DATOS;
}

export async function obtenerAutorizacionDatos(
  uid: string
): Promise<AutorizacionDatos | null> {
  const documento = await getDoc(doc(db, 'usuarios', uid));
  return documento.exists() ? convertir(documento.data()) : null;
}

/**
 * Registra la aceptación del texto vigente.
 *
 * Se ejecuta con el uid autenticado: las reglas de Firestore
 * solo permiten escribir en `usuarios/{uid}` propio.
 */
export async function registrarAutorizacionDatos(
  uid: string,
  correo: string
): Promise<void> {
  const aceptadoEn = new Date().toISOString();

  const autorizacion: AutorizacionDatos = {
    version: VERSION_AUTORIZACION_DATOS,
    aceptadoEn,
    aceptadoPor: uid,
    correo,
  };

  /* Estado actual (para el gate). */
  await setDoc(
    doc(db, 'usuarios', uid),
    { autorizacionDatos: autorizacion },
    { merge: true }
  );

  /* Historial append-only por versión (evidencia). */
  await setDoc(
    doc(db, 'usuarios', uid, 'autorizaciones', VERSION_AUTORIZACION_DATOS),
    autorizacion,
    { merge: true }
  );
}

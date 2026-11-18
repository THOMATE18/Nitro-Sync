/*
=======================================================
NITRO SYNC - AVISOS DE RENOVACIÓN (TAREA PROGRAMADA)
=======================================================

Detecta los vehículos de la aseguradora que están por vencer
y prepara el recordatorio por CORREO y por WHATSAPP.

REGLA DE DATOS

  La aseguradora trabaja con los vehículos que tienen su
  seguro (`aseguradoraClave`). De cada uno solo conoce la
  placa, marca, modelo, vencimiento y el contacto del
  propietario (nombre y teléfono). NO tiene su correo, así
  que el canal de correo siempre queda `omitido` con motivo
  `sin_correo`: se conserva la lógica, pero no se afirma que
  se envió nada.

REGLAS DE NEGOCIO

  - Solo se avisa de vehículos con vencimiento dentro del
    umbral (sin contar los ya vencidos).
  - Solo se avisa si el propietario otorgó el
    consentimiento OPERATIVO para ese vehículo y esa
    organización. Sin autorización no se prepara nada.
  - El correo usa un PROVEEDOR MOCK (no hay credenciales):
    se registra como `manual` con motivo
    `mock_sin_credenciales`, nunca como `enviado`.
  - El WhatsApp se prepara como enlace `wa.me` (envío
    manual): se registra como `manual` y se devuelve el
    enlace para que la aseguradora lo abra.
  - Se evitan duplicados por `canal + vehículo + plantilla
    + fecha`, comparando con los avisos ya registrados.

La tarea se puede ejecutar desde el panel de aseguradora.
Cuando exista un programador real (Cloud Scheduler) solo
habrá que llamar a `ejecutarRecordatoriosRenovacion` con
los mismos datos.
=======================================================
*/

import { correoValido, enviarCorreo, redactarCorreoRenovacion } from '@/services/correo';
import {
  construirEnlaceWhatsapp,
  redactarPlantilla,
  registrarAviso,
} from '@/services/whatsapp';
import type {
  CanalNotificacion,
  Consentimiento,
  EstadoNotificacion,
  RegistroNotificacion,
} from '@/types/negocio';
import type { VehiculoAdmin } from '@/types/models';

/** Días de antelación con los que se empieza a avisar. */
export const UMBRAL_DIAS_DEFAULT = 30;

/** Plantillas usadas por la tarea (una por canal). */
export const PLANTILLA_CORREO = 'renovacion_email';
export const PLANTILLA_WHATSAPP = 'renovacion';

/* -----------------------------------------------
   FECHAS
----------------------------------------------- */

/** Fecha de hoy en formato AAAA-MM-DD. */
export function fechaHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fecha (AAAA-MM-DD) de una marca de tiempo en milisegundos. */
export function fechaDeMarca(marca: number): string {
  if (!marca) return '';
  return new Date(marca).toISOString().slice(0, 10);
}

/**
 * Días enteros que faltan desde `hoy` hasta `fechaIso`.
 * Devuelve null si la fecha no es válida.
 */
export function diasHasta(
  fechaIso: string | null | undefined,
  hoy: Date = new Date()
): number | null {
  if (!fechaIso) return null;

  const objetivo = new Date(`${fechaIso}T00:00:00`);

  if (Number.isNaN(objetivo.getTime())) return null;

  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const diferencia = objetivo.getTime() - base.getTime();

  return Math.round(diferencia / 86400000);
}

/* -----------------------------------------------
   SELECCIÓN DE VEHÍCULOS Y AUTORIZACIÓN
----------------------------------------------- */

/**
 * Vehículos cuya vigencia vence dentro del umbral (hoy
 * incluido). Se ordenan del vencimiento más próximo al más
 * lejano. Los ya vencidos no entran aquí.
 */
export function renovacionesProximas(
  vehiculos: VehiculoAdmin[],
  umbralDias: number = UMBRAL_DIAS_DEFAULT,
  hoy: Date = new Date()
): VehiculoAdmin[] {
  return vehiculos
    .map((vehiculo) => ({
      vehiculo,
      dias: diasHasta(vehiculo.vencimientoSeguro, hoy),
    }))
    .filter(
      (item) =>
        item.dias !== null && item.dias >= 0 && item.dias <= umbralDias
    )
    .sort((a, b) => (a.dias as number) - (b.dias as number))
    .map((item) => item.vehiculo);
}

/**
 * El propietario autorizó el uso OPERATIVO de los datos de
 * ese vehículo para esa aseguradora.
 */
export function tieneAutorizacionOperativa(
  consentimientos: Consentimiento[],
  vehiculoId: string,
  orgId: string
): boolean {
  return consentimientos.some(
    (consentimiento) =>
      consentimiento.vehiculoId === vehiculoId &&
      consentimiento.orgId === orgId &&
      consentimiento.finalidad === 'operativo' &&
      consentimiento.estado === 'otorgado'
  );
}

/* -----------------------------------------------
   PREPARACIÓN DE UN AVISO
----------------------------------------------- */

export interface ResultadoAvisoRenovacion {
  canal: CanalNotificacion;
  estado: EstadoNotificacion;
  motivo: string | null;
  destino: string | null;
  /** Enlace `wa.me` cuando el canal es WhatsApp y hay teléfono. */
  enlace: string | null;
}

function variablesDe(
  vehiculo: VehiculoAdmin,
  organizacionNombre: string
): Record<string, string> {
  return {
    propietario: vehiculo.contactoPropietario?.nombre?.trim() || 'estimado cliente',
    aseguradora: organizacionNombre || 'tu aseguradora',
    vehiculo: `${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.placa})`.trim(),
    fecha: vehiculo.vencimientoSeguro ?? 'pronto',
  };
}

/**
 * Prepara (y registra) el recordatorio de renovación de un
 * vehículo por el canal indicado.
 *
 *   - Correo    -> sin correo disponible queda `omitido`
 *                  (`sin_correo`): la aseguradora no ve el
 *                  correo del propietario.
 *   - WhatsApp  -> enlace `wa.me`. Sin teléfono queda
 *                  `omitido` (`sin_telefono`).
 *
 * Nunca lanza: devuelve el resultado para que el llamador
 * decida qué mostrar.
 */
export async function prepararAvisoRenovacion(datos: {
  canal: 'email' | 'whatsapp';
  orgId: string;
  organizacionNombre: string;
  vehiculo: VehiculoAdmin;
  fecha: string;
}): Promise<ResultadoAvisoRenovacion> {
  const variables = variablesDe(datos.vehiculo, datos.organizacionNombre);

  if (datos.canal === 'email') {
    /*
    El correo del propietario NO se comparte con la
    aseguradora, así que aquí siempre está vacío y el aviso
    queda `omitido`. Se conserva la lógica por si más adelante
    se habilita un canal de correo propio.
    */
    const destino = '';

    if (!correoValido(destino)) {
      await registrarAviso({
        canal: 'email',
        orgId: datos.orgId,
        propietarioUid: datos.vehiculo.propietarioUid,
        vehiculoId: datos.vehiculo.id,
        destino,
        plantilla: PLANTILLA_CORREO,
        variables,
        estado: 'omitido',
        motivo: 'sin_correo',
        fecha: datos.fecha,
        referencia: datos.vehiculo.id,
      });

      return {
        canal: 'email',
        estado: 'omitido',
        motivo: 'sin_correo',
        destino,
        enlace: null,
      };
    }

    const { asunto, cuerpo } = redactarCorreoRenovacion({
      propietario: variables.propietario,
      aseguradora: variables.aseguradora,
      vehiculo: variables.vehiculo,
      fecha: variables.fecha,
    });

    const resultado = await enviarCorreo({ para: destino, asunto, cuerpo });

    /*
    El proveedor mock acepta el mensaje pero NO lo entrega:
    se registra como `manual` con el motivo devuelto, para
    no afirmar que el correo salió.
    */
    const estado: EstadoNotificacion = resultado.aceptado ? 'manual' : 'omitido';
    const motivo = resultado.motivo ?? (resultado.aceptado ? null : 'correo_invalido');

    await registrarAviso({
      canal: 'email',
      orgId: datos.orgId,
      propietarioUid: datos.vehiculo.propietarioUid,
      vehiculoId: datos.vehiculo.id,
      destino,
      plantilla: PLANTILLA_CORREO,
      variables: { ...variables, asunto },
      estado,
      motivo,
      fecha: datos.fecha,
      referencia: datos.vehiculo.id,
    });

    return { canal: 'email', estado, motivo, destino, enlace: null };
  }

  /* WhatsApp: enlace manual. */
  const destino = datos.vehiculo.contactoPropietario?.telefono ?? '';
  const mensaje = redactarPlantilla('renovacion', variables);
  const enlace = construirEnlaceWhatsapp(destino, mensaje);

  if (!enlace) {
    await registrarAviso({
      canal: 'whatsapp',
      orgId: datos.orgId,
      propietarioUid: datos.vehiculo.propietarioUid,
      vehiculoId: datos.vehiculo.id,
      destino,
      plantilla: PLANTILLA_WHATSAPP,
      variables,
      estado: 'omitido',
      motivo: 'sin_telefono',
      fecha: datos.fecha,
      referencia: datos.vehiculo.id,
    });

    return {
      canal: 'whatsapp',
      estado: 'omitido',
      motivo: 'sin_telefono',
      destino,
      enlace: null,
    };
  }

  await registrarAviso({
    canal: 'whatsapp',
    orgId: datos.orgId,
    propietarioUid: datos.vehiculo.propietarioUid,
    vehiculoId: datos.vehiculo.id,
    destino,
    plantilla: PLANTILLA_WHATSAPP,
    variables,
    estado: 'manual',
    motivo: null,
    fecha: datos.fecha,
    referencia: datos.vehiculo.id,
  });

  return {
    canal: 'whatsapp',
    estado: 'manual',
    motivo: null,
    destino,
    enlace,
  };
}

/* -----------------------------------------------
   TAREA PROGRAMADA
----------------------------------------------- */

export interface EnlacePreparado {
  vehiculoId: string;
  placa: string;
  propietarioUid: string;
  enlace: string;
}

export interface ResumenTareaRenovacion {
  fecha: string;
  /** Vehículos con vencimiento dentro del umbral. */
  proximos: number;
  /** Vehículos con consentimiento operativo vigente. */
  autorizados: number;
  /** Vehículos descartados por falta de autorización. */
  sinAutorizacion: number;
  /** Correos preparados (mock) y omitidos. */
  correosPreparados: number;
  correosOmitidos: number;
  /** WhatsApp preparados (enlace) y omitidos. */
  whatsappPreparados: number;
  whatsappOmitidos: number;
  /** Avisos que ya existían para hoy y no se repitieron. */
  duplicados: number;
  /** Enlaces `wa.me` listos para abrir manualmente. */
  enlaces: EnlacePreparado[];
}

/** Clave de deduplicación de un aviso. */
export function claveAviso(
  canal: CanalNotificacion,
  vehiculoId: string | null,
  plantilla: string,
  fecha: string
): string {
  return `${canal}|${vehiculoId ?? ''}|${plantilla}|${fecha}`;
}

/**
 * Ejecuta la tarea de recordatorios de renovación.
 *
 * `avisosExistentes` son los avisos ya cargados por la
 * pantalla; se usan para no repetir el mismo aviso del
 * mismo día (misma clave canal + vehículo + plantilla +
 * fecha).
 */
export async function ejecutarRecordatoriosRenovacion(datos: {
  orgId: string;
  organizacionNombre: string;
  vehiculos: VehiculoAdmin[];
  consentimientos: Consentimiento[];
  avisosExistentes: RegistroNotificacion[];
  umbralDias?: number;
  fecha?: string;
}): Promise<ResumenTareaRenovacion> {
  const fecha = datos.fecha ?? fechaHoy();
  const umbral = datos.umbralDias ?? UMBRAL_DIAS_DEFAULT;
  const hoy = new Date(`${fecha}T00:00:00`);
  const proximos = renovacionesProximas(datos.vehiculos, umbral, hoy);

  /* Claves ya registradas hoy (o en cualquier fecha). */
  const claves = new Set(
    datos.avisosExistentes.map((aviso) =>
      claveAviso(
        aviso.canal,
        aviso.vehiculoId,
        aviso.plantilla,
        fechaDeMarca(aviso.creadoEn)
      )
    )
  );

  const resumen: ResumenTareaRenovacion = {
    fecha,
    proximos: proximos.length,
    autorizados: 0,
    sinAutorizacion: 0,
    correosPreparados: 0,
    correosOmitidos: 0,
    whatsappPreparados: 0,
    whatsappOmitidos: 0,
    duplicados: 0,
    enlaces: [],
  };

  for (const vehiculo of proximos) {
    if (
      !tieneAutorizacionOperativa(
        datos.consentimientos,
        vehiculo.id,
        datos.orgId
      )
    ) {
      resumen.sinAutorizacion += 1;
      continue;
    }

    resumen.autorizados += 1;

    const canales: { canal: 'email' | 'whatsapp'; plantilla: string }[] = [
      { canal: 'email', plantilla: PLANTILLA_CORREO },
      { canal: 'whatsapp', plantilla: PLANTILLA_WHATSAPP },
    ];

    for (const { canal, plantilla } of canales) {
      const clave = claveAviso(canal, vehiculo.id, plantilla, fecha);

      if (claves.has(clave)) {
        resumen.duplicados += 1;
        continue;
      }

      const resultado = await prepararAvisoRenovacion({
        canal,
        orgId: datos.orgId,
        organizacionNombre: datos.organizacionNombre,
        vehiculo,
        fecha,
      });

      /* Marcar en memoria para no repetir dentro de la corrida. */
      claves.add(clave);

      if (canal === 'email') {
        if (resultado.estado === 'manual') {
          resumen.correosPreparados += 1;
        } else {
          resumen.correosOmitidos += 1;
        }
      } else if (resultado.enlace) {
        resumen.whatsappPreparados += 1;
        resumen.enlaces.push({
          vehiculoId: vehiculo.id,
          placa: vehiculo.placa,
          propietarioUid: vehiculo.propietarioUid,
          enlace: resultado.enlace,
        });
      } else {
        resumen.whatsappOmitidos += 1;
      }
    }
  }

  return resumen;
}

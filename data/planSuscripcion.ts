/*
=======================================================
NITRO SYNC - ÚNICO PLAN DE SUSCRIPCIÓN
=======================================================

Este archivo es la ÚNICA definición local del plan. No
existen planes Básico, Profesional ni Empresarial.

El precio de $149.900 COP es solo el valor inicial de
demostración. El precio vigente se lee siempre de
`configuracionSuscripcion/super_empresarial` en Firestore
(servicio `services/configuracionSuscripcion.ts`).
=======================================================
*/

export const PLAN_SUPER_EMPRESARIAL = {
  id: 'super_empresarial',
  nombre: 'Súper Empresarial',
  /** Precio inicial de demostración; no se usa directamente en la UI. */
  precioInicialCop: 149900,
  moneda: 'COP' as const,
  periodicidad: 'monthly' as const,
  descripcion:
    'Plan único para aseguradoras: gestión de vehículos, pólizas, cotizaciones, clientes y pagos simulados en un solo lugar.',
  beneficios: [
    'Panel de aseguradora con clientes y vehículos vinculados',
    'Registro y renovación de pólizas con avisos',
    'Cotizaciones y solicitudes de los propietarios',
    'Línea de atención y WhatsApp con número oficial configurable',
    'Pagos simulados de clientes y historial de operaciones',
    'Soporte desde el panel del súper administrador',
  ],
} as const;

export const ID_CONFIGURACION_SUSCRIPCION = PLAN_SUPER_EMPRESARIAL.id;

/** Clave del documento firebase que guarda el precio vigente. */
export const RUTA_CONFIGURACION_SUSCRIPCION = `configuracionSuscripcion/${PLAN_SUPER_EMPRESARIAL.id}`;

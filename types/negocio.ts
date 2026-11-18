/*
=======================================================
NITRO SYNC - MODELO DE NEGOCIO (MULTI-TENANT)
=======================================================

Entidades nuevas que acompañan a las existentes
(`usuarios`, `vehiculos`, `solicitudes`, `opiniones`).

  organizations/{orgId}          -> aseguradora
  plans/{planId}                 -> plan mensual en COP
  subscriptions/{orgId}          -> suscripción de la aseguradora
  payments/{paymentId}           -> pago registrado manualmente
  consents/{consentId}           -> autorización del propietario
  vehicleInsurerLinks/{linkId}   -> vínculo vehículo <-> aseguradora
  policies/{policyId}            -> póliza
  offers/{offerId}               -> oferta de renovación
  notificationLogs/{id}          -> registro de envíos
  auditLogs/{id}                 -> auditoría de acciones

REGLAS DE DISEÑO

- Los roles viven en custom claims (los asigna el backend).
- El perfil de Firestore NO concede privilegios por sí solo.
- Un vehículo puede tener varias aseguradoras con productos
  distintos (SOAT, todo riesgo, etc.).
- La aseguradora nunca lee `usuarios/{uid}/vehiculos`; lee la
  proyección autorizada en `vehicleInsurerLinks`.
=======================================================
*/

/* -----------------------------------------------
   ROLES
----------------------------------------------- */

import type { TipoVehiculo } from './models';

export type Rol = 'customer' | 'insurer_agent' | 'insurer_admin' | 'super_admin';

export const ROLES: Rol[] = [
  'customer',
  'insurer_agent',
  'insurer_admin',
  'super_admin',
];

/** Roles que pueden entrar al Panel de Aseguradora. */
export const ROLES_ASEGURADORA: Rol[] = ['insurer_admin', 'insurer_agent'];

export function esRolAseguradora(rol: Rol | null): boolean {
  return rol === 'insurer_admin' || rol === 'insurer_agent';
}

/* -----------------------------------------------
   ORGANIZACIONES
----------------------------------------------- */

export type EstadoOrganizacion = 'pending' | 'active' | 'suspended';

export interface Organizacion {
  id: string;
  nombre: string;
  slug: string;
  correo: string | null;
  telefono: string | null;
  web: string | null;
  whatsapp: string | null;
  color: string | null;
  especialidad: string | null;
  estado: EstadoOrganizacion;
  accesoHabilitado: boolean;
  creadaEn: string | null;
  actualizadaEn: string | null;
  /*
  Clave normalizada de la aseguradora (ver
  `data/aseguradoras.ts` -> `claveAseguradora`). La asigna el
  super_admin y es la que usan las reglas de Firestore para
  permitir la lectura SOLO de los vehículos de su aseguradora:

    resource.data.aseguradoraClave ==
      get(organizations/$(miOrg())).data.aseguradoraClave
  */
  aseguradoraClave: string | null;
  /*
  Teléfono de atención que la aseguradora puede editar desde su
  panel. Se copia a `telefonoAseguradora` de sus vehículos para
  que el propietario vea la línea correcta en la ficha de su
  seguro. Si está vacío se usa el del directorio
  (`data/aseguradoras.ts`).
  */
  telefonoContacto: string | null;
}

export const ETIQUETA_ESTADO_ORG: Record<EstadoOrganizacion, string> = {
  pending: 'Pendiente',
  active: 'Activa',
  suspended: 'Suspendida',
};

/* -----------------------------------------------
   CONSENTIMIENTOS
----------------------------------------------- */

export type FinalidadConsentimiento = 'operativo' | 'comercial';
export type EstadoConsentimiento = 'otorgado' | 'revocado';

export interface Consentimiento {
  id: string;
  vehiculoId: string;
  propietarioUid: string;
  orgId: string;
  finalidad: FinalidadConsentimiento;
  estado: EstadoConsentimiento;
  /** Datos que el propietario autoriza compartir. */
  alcance: string[];
  otorgadoEn: string;
  revocadoEn: string | null;
  actualizadoEn: number;
}

export function idConsentimiento(
  vehiculoId: string,
  orgId: string,
  finalidad: FinalidadConsentimiento
): string {
  return `${vehiculoId}_${orgId}_${finalidad}`;
}

/* -----------------------------------------------
   VÍNCULOS VEHÍCULO <-> ASEGURADORA
----------------------------------------------- */

export type EstadoVinculo = 'solicitado' | 'activo' | 'revocado';

export const ETIQUETA_ESTADO_VINCULO: Record<EstadoVinculo, string> = {
  solicitado: 'Solicitado',
  activo: 'Activo',
  revocado: 'Revocado',
};

export interface VinculoAseguradora {
  id: string;
  vehiculoId: string;
  propietarioUid: string;
  propietarioNombre: string | null;
  propietarioTelefono: string | null;
  /** Correo del propietario (solo si autorizó compartirlo). */
  propietarioCorreo: string | null;
  orgId: string;
  producto: string;
  placa: string;
  marca: string;
  modelo: string;
  year: number | null;
  tipo: string;
  poliza: string | null;
  vigencia: string | null;
  estado: EstadoVinculo;
  /** Si el propietario autorizó mostrar sus datos personales. */
  datosPropietarioVisibles: boolean;
  creadoEn: number;
  actualizadoEn: number;
}

export function idVinculo(vehiculoId: string, orgId: string, producto: string): string {
  const limpio = producto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${vehiculoId}_${orgId}_${limpio || 'general'}`;
}

/* -----------------------------------------------
   PÓLIZAS
----------------------------------------------- */

export type EstadoPoliza = 'vigente' | 'por_vencer' | 'vencida' | 'cancelada';

export const ETIQUETA_ESTADO_POLIZA: Record<EstadoPoliza, string> = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
};

export interface Poliza {
  id: string;
  vehiculoId: string;
  propietarioUid: string;
  orgId: string;
  producto: string;
  numero: string;
  placa: string;
  vigenciaInicio: string;
  vigenciaFin: string;
  primaCop: number | null;
  estado: EstadoPoliza;
  creadaEn: number;
  actualizadaEn: number;
  /** F7: renovaciones se registran en modo simulado. Opcional en pólizas antiguas. */
  simulado?: true;
}

/* -----------------------------------------------
   OFERTAS DE RENOVACIÓN
----------------------------------------------- */

export type EstadoOferta = 'enviada' | 'aceptada' | 'rechazada' | 'expirada';

export const ETIQUETA_ESTADO_OFERTA: Record<EstadoOferta, string> = {
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  expirada: 'Expirada',
};

export interface Oferta {
  id: string;
  polizaId: string;
  vehiculoId: string;
  propietarioUid: string;
  orgId: string;
  titulo: string;
  descripcion: string | null;
  primaCop: number | null;
  vigenciaFin: string | null;
  estado: EstadoOferta;
  creadaEn: number;
  respondidaEn: string | null;
}

/* -----------------------------------------------
   COTIZACIONES (PROPIETARIO -> ASEGURADORA)
----------------------------------------------- */

export type EstadoCotizacion = 'nueva' | 'contactada' | 'cotizada' | 'cerrada';

export const ETIQUETA_ESTADO_COTIZACION: Record<EstadoCotizacion, string> = {
  nueva: 'Nueva',
  contactada: 'Contactada',
  cotizada: 'Cotizada',
  cerrada: 'Cerrada',
};

export interface Cotizacion {
  id: string;
  uid: string;
  email: string;
  vehiculoId: string;
  vehiculoNombre: string;
  placa: string;
  tipoVehiculo: TipoVehiculo;
  /** Clave normalizada de la aseguradora destino. */
  aseguradoraClave: string;
  /** Nombre visible de la aseguradora destino. */
  aseguradora: string;
  telefono: string;
  nota: string;
  estado: EstadoCotizacion;
  /** Prima cotizada en COP: la completa la aseguradora. */
  primaCop: number | null;
  fecha: string; // "AAAA-MM-DD"
  creadaEn: number;
  actualizadaEn: number;
  atendidaPor?: string | null;
  atendidaFecha?: string | null;
}

export type NuevaCotizacion = Omit<
  Cotizacion,
  | 'id'
  | 'estado'
  | 'primaCop'
  | 'fecha'
  | 'creadaEn'
  | 'actualizadaEn'
  | 'atendidaPor'
  | 'atendidaFecha'
>;

/**
 * Id determinista de una cotización: una por vehículo y
 * aseguradora. Reenviar la misma solicitud no duplica el
 * documento.
 */
export function idCotizacion(
  uid: string,
  vehiculoId: string,
  clave: string
): string {
  return `${uid}_${vehiculoId}_${clave}`;
}

/* -----------------------------------------------
   PLANES Y SUSCRIPCIONES
----------------------------------------------- */
/*
Estados vigentes del producto: PENDIENTE, ACTIVA, VENCIDA,
INACTIVA. Los valores antiguos se conservan para no migrar
ni perder documentos ya existentes en Firestore.
*/
export type EstadoSuscripcion =
  | 'pendiente'
  | 'active'
  | 'expired'
  | 'inactive'
  | 'trial'
  | 'past_due'
  | 'suspended'
  | 'cancelled';

export const ETIQUETA_ESTADO_SUSCRIPCION: Record<EstadoSuscripcion, string> = {
  pendiente: 'PENDIENTE',
  active: 'ACTIVA',
  expired: 'VENCIDA',
  inactive: 'INACTIVA',
  trial: 'Prueba',
  past_due: 'En mora',
  suspended: 'Suspendida',
  cancelled: 'Cancelada',
};

/** Colores de estado (claves de `Paleta`, válidos en claro y oscuro). */
export const CLAVE_COLOR_ESTADO_SUSCRIPCION: Record<EstadoSuscripcion, string> = {
  pendiente: 'advertencia',
  active: 'exito',
  expired: 'peligro',
  inactive: 'textoSuave',
  trial: 'advertencia',
  past_due: 'advertencia',
  suspended: 'textoSuave',
  cancelled: 'textoSuave',
};

/**
 * Un documento con estado ACTIVA pero vencido se muestra y se
 * trata como VENCIDA: evita que una suscripción vencida siga
 * viéndose activa.
 */
export function estadoEfectivoSuscripcion(
  suscripcion: Pick<Suscripcion, 'estado' | 'vencimiento'>,
  hoy = new Date()
): EstadoSuscripcion {
  if (suscripcion.estado === 'inactive' || suscripcion.estado === 'pendiente') {
    return suscripcion.estado;
  }

  if (!suscripcion.vencimiento) return suscripcion.estado;

  const fin = new Date(`${suscripcion.vencimiento}T23:59:59`);
  if (!Number.isNaN(fin.getTime()) && fin.getTime() < hoy.getTime()) {
    return 'expired';
  }

  return suscripcion.estado;
}

export interface Plan {
  id: string;
  nombre: string;
  precioCop: number;
  moneda: 'COP';
  periodicidad: 'monthly';
  limiteEmpleados: number | null;
  limiteVehiculos: number | null;
  funciones: string[];
  activo: boolean;
  creadoEn: number;
}

export interface Suscripcion {
  id: string;
  orgId: string;
  planId: string | null;
  estado: EstadoSuscripcion;
  inicio: string | null;
  vencimiento: string | null;
  precioCop: number | null;
  actualizadaEn: number;
  /** F7: renovaciones de 30 días se registran en modo simulado. */
  simulado?: true;
  /* Trazabilidad de las acciones del súper administrador. */
  activadaPor?: string | null;
  activadaEn?: number | null;
  desactivadaPor?: string | null;
  desactivadaEn?: number | null;
  motivoDesactivacion?: string | null;
  renovadaEn?: number | null;
}

export interface Pago {
  id: string;
  orgId: string;
  suscripcionId: string;
  periodo: string;
  montoCop: number;
  estado: 'pendiente' | 'pagado';
  metodo: 'transferencia' | 'efectivo' | 'otro';
  referencia: string | null;
  registradoPor: string;
  registradoEn: number;
  pagadoEn: string | null;
  /** F7: todos los pagos de la app son simulados. */
  simulado?: true;
}

/* -----------------------------------------------
   NOTIFICACIONES (WHATSAPP)
----------------------------------------------- */

export type CanalNotificacion = 'whatsapp' | 'local' | 'email';
export type EstadoNotificacion = 'pendiente' | 'manual' | 'enviado' | 'fallido' | 'omitido';

export const ETIQUETA_CANAL: Record<CanalNotificacion, string> = {
  whatsapp: 'WhatsApp',
  email: 'Correo',
  local: 'Local',
};

export interface RegistroNotificacion {
  id: string;
  canal: CanalNotificacion;
  /** `skipped_missing_credentials` cuando faltan las credenciales. */
  motivo: string | null;
  orgId: string | null;
  propietarioUid: string | null;
  vehiculoId: string | null;
  destino: string | null;
  plantilla: string;
  variables: Record<string, string>;
  estado: EstadoNotificacion;
  creadoEn: number;
  enviadoEn: string | null;
}

/** Clave de idempotencia: evita duplicados del mismo aviso. */
export function idNotificacion(
  canal: CanalNotificacion,
  referencia: string,
  plantilla: string,
  fecha: string
): string {
  return `${canal}_${referencia}_${plantilla}_${fecha}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/* -----------------------------------------------
   AUDITORÍA
----------------------------------------------- */

export interface RegistroAuditoria {
  id: string;
  actorUid: string;
  actorCorreo: string | null;
  actorRol: Rol | null;
  orgId: string | null;
  accion: string;
  entidad: string;
  entidadId: string;
  detalle: Record<string, string | number | boolean | null>;
  creadoEn: number;
}

/* -----------------------------------------------
   FASE 7 · MEMBRESÍA Y PAGOS SIMULADOS

   Colecciones nuevas (todas aditivas):

     solicitudesSuscripcion/{id}  -> cambio de plan pedido por la aseguradora
     pagosSeguros/{id}            -> pago de seguro registrado por la aseguradora
     referenciaPrimas/{id}        -> tabla de referencia SOAT 2026
     configuracionCostos/{id}     -> precios sugeridos globales

   Ninguno de estos documentos representa un cobro real: los
   pagos y los avisos pasan por los proveedores simulados de
   `services/proveedores.ts` y llevan `simulado: true`.
----------------------------------------------- */

/** Etiqueta visible en TODA la UI de pagos/mensajes simulados. */
export const ETIQUETA_SIMULADO = 'Simulado';

export type EstadoSolicitudSuscripcion = 'pendiente' | 'aprobada' | 'rechazada';

export const ETIQUETA_ESTADO_SOLICITUD_SUSCRIPCION: Record<
  EstadoSolicitudSuscripcion,
  string
> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

export interface SolicitudSuscripcion {
  id: string;
  orgId: string;
  planId: string;
  planNombre: string;
  precioCop: number;
  motivo: string | null;
  estado: EstadoSolicitudSuscripcion;
  solicitadoPor: string;
  solicitadoEn: number;
  respondidaPor: string | null;
  respondidaEn: number | null;
  simulado: true;
}

export type EstadoPagoSeguro = 'pendiente' | 'confirmado' | 'rechazado';

export const ETIQUETA_ESTADO_PAGO_SEGURO: Record<EstadoPagoSeguro, string> = {
  pendiente: 'Pendiente de confirmación',
  confirmado: 'Confirmado',
  rechazado: 'Rechazado',
};

export interface PagoSeguro {
  id: string;
  orgId: string;
  vehiculoId: string;
  propietarioUid: string;
  polizaId: string | null;
  producto: string;
  periodo: string;
  montoCop: number;
  /** Referencia devuelta por el proveedor simulado. */
  referencia: string | null;
  estado: EstadoPagoSeguro;
  simulado: true;
  registradoPor: string;
  registradoEn: number;
  respondidaEn: number | null;
  /* Campos nuevos (opcionales: no se migran datos existentes). */
  clienteNombre?: string | null;
  orgNombre?: string | null;
  concepto?: string | null;
  metodoPago?: MetodoPagoSimulado | null;
  fechaOperacion?: string | null;
  respondidaPor?: string | null;
}

export type MetodoPagoSimulado = 'transferencia' | 'efectivo' | 'tarjeta' | 'otro';

export const ETIQUETA_METODO_PAGO: Record<MetodoPagoSimulado, string> = {
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

export interface ReferenciaPrima {
  id: string;
  producto: string;
  anio: number;
  tipoVehiculo: TipoVehiculo;
  rango: string;
  cilindradaMin: number | null;
  cilindradaMax: number | null;
  /** null = valor pendiente por definir (mostrar "TODO"). */
  valorCop: number | null;
  nota: string | null;
  actualizadaEn: number;
}

export interface ConfiguracionCosto {
  /** `${clave}_${tipo.toLowerCase()}` (ej. `soat_moto`). */
  id: string;
  clave: string;
  tipoVehiculo: TipoVehiculo;
  valorCop: number;
  nota: string | null;
  actualizadaEn: number;
}

/* -------------------------------------------------------
   SUSCRIPCIÓN ÚNICA · SÚPER EMPRESARIAL
   Colecciones nuevas, aditivas:

     configuracionSuscripcion/{planId}           -> precio vigente
     configuracionSuscripcion/{planId}/historial -> cambios de precio
     comprasSuscripcion/{compraId}               -> compras pendientes
     notificacionesAdmin/{compraId}              -> avisos al super_admin
     historialSuscripciones/{id}                 -> operaciones
------------------------------------------------------- */

export interface ConfiguracionSuscripcion {
  id: string;
  planId: string;
  nombre: string;
  precioCop: number;
  moneda: 'COP';
  periodicidad: 'monthly';
  descripcion: string;
  beneficios: string[];
  actualizadaEn: number;
  actualizadaPor: string;
  actualizadoPorCorreo: string | null;
}

export interface HistorialPrecioSuscripcion {
  id: string;
  planId: string;
  precioCop: number;
  precioAnteriorCop: number;
  cambiadoPor: string;
  cambiadoCorreo: string | null;
  creadoEn: number;
}

export type EstadoCompraSuscripcion = 'pendiente' | 'aprobada' | 'rechazada';

export const ETIQUETA_ESTADO_COMPRA: Record<EstadoCompraSuscripcion, string> = {
  pendiente: 'PENDIENTE DE APROBACIÓN',
  aprobada: 'APROBADA',
  rechazada: 'RECHAZADA',
};

export interface CompraSuscripcion {
  id: string;
  orgId: string;
  orgNombre: string;
  planId: string;
  planNombre: string;
  /** Copia del precio vigente al momento de la compra (histórico). */
  precioCop: number;
  periodicidad: 'monthly';
  beneficios: string[];
  estado: EstadoCompraSuscripcion;
  compradorUid: string;
  compradorCorreo: string | null;
  fechaCompra: string;
  registradoEn: number;
  aprobadaPor: string | null;
  aprobadaEn: number | null;
  simulado: true;
}

export interface NotificacionAdmin {
  id: string;
  compraId: string;
  orgId: string;
  orgNombre: string;
  planId: string;
  planNombre: string;
  precioCop: number;
  fechaCompra: string;
  estadoCompra: EstadoCompraSuscripcion;
  leida: boolean;
  leidaPor: string | null;
  leidaEn: number | null;
  creadoEn: number;
  simulado: true;
}

export type TipoHistorialSuscripcion =
  | 'compra'
  | 'asignacion'
  | 'aprobacion'
  | 'activacion'
  | 'renovacion'
  | 'desactivacion'
  | 'cambio_precio';

export const ETIQUETA_TIPO_HISTORIAL: Record<TipoHistorialSuscripcion, string> = {
  compra: 'Compra',
  asignacion: 'Asignación de plan',
  aprobacion: 'Aprobación',
  activacion: 'Activación',
  renovacion: 'Renovación',
  desactivacion: 'Desactivación',
  cambio_precio: 'Cambio de precio',
};

export interface HistorialSuscripcion {
  id: string;
  orgId: string;
  orgNombre: string | null;
  tipo: TipoHistorialSuscripcion;
  estado: EstadoSuscripcion | EstadoCompraSuscripcion | null;
  precioCop: number | null;
  fecha: string;
  responsableUid: string;
  responsableCorreo: string | null;
  motivo: string | null;
  creadoEn: number;
  simulado: true;
}

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
   PLANES Y SUSCRIPCIONES
----------------------------------------------- */

export type EstadoSuscripcion =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'cancelled'
  | 'expired';

export const ETIQUETA_ESTADO_SUSCRIPCION: Record<EstadoSuscripcion, string> = {
  trial: 'Prueba',
  active: 'Activa',
  past_due: 'En mora',
  suspended: 'Suspendida',
  cancelled: 'Cancelada',
  expired: 'Vencida',
};

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

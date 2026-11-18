/*
=======================================================
NITRO SYNC - GESTIÓN ADMINISTRATIVA DE SUSCRIPCIONES
=======================================================

  subscriptions/{orgId}  -> estado vigente de la aseguradora

Solo el SÚPER ADMINISTRADOR puede asignar, activar, renovar
o desactivar. Cada operación:

  1. Actualiza `subscriptions/{orgId}`.
  2. Escribe `historialSuscripciones/{id}` con fecha, valor
     y responsable.
  3. Deja rastro en `auditLogs` (best-effort).

La renovación parte de la vigencia ACTUAL para no perder
días contratados; si no hay vigencia, parte de hoy.
=======================================================
*/

import { writeBatch } from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import { PLAN_SUPER_EMPRESARIAL } from '@/data/planSuscripcion';
import { hoyISO, fechaMasDias } from '@/utils/fechas';

import { suscripcionRef } from '@/services/facturacion';
import { leerConfiguracionSuscripcion } from '@/services/configuracionSuscripcion';
import { registrarHistorialSuscripcion } from '@/services/historialSuscripciones';
import { registrarAuditoria } from '@/services/auditoria';

import type { Suscripcion } from '@/types/negocio';

const DIAS_VIGENCIA = 30;

export interface Administrador {
  uid: string;
  correo: string | null;
}

export interface DatosOperacion {
  orgId: string;
  orgNombre: string;
  administrador: Administrador;
  suscripcion: Suscripcion;
}

function audit(
  administrador: Administrador,
  orgId: string,
  accion: string,
  entidadId: string,
  detalle: Record<string, string | number | boolean | null>
): Promise<void> {
  return registrarAuditoria({
    actorUid: administrador.uid,
    actorCorreo: administrador.correo,
    actorRol: 'super_admin',
    orgId,
    accion,
    entidad: 'subscriptions',
    entidadId,
    detalle: { ...detalle, simulado: true },
  });
}

/**
 * Asigna el plan SÚPER EMPRESARIAL con estado INACTIVA.
 * Se usa para dar de alta a todas las aseguradoras sin
 * habilitarlas; el admin las activa después desde el panel.
 */
export async function asignarPlanSuperEmpresarial(
  orgId: string,
  orgNombre: string,
  administrador: Administrador
): Promise<Suscripcion> {
  const configuracion = await leerConfiguracionSuscripcion();
  const ahora = Date.now();
  const suscripcion: Suscripcion = {
    id: orgId,
    orgId,
    planId: PLAN_SUPER_EMPRESARIAL.id,
    estado: 'inactive',
    inicio: null,
    vencimiento: null,
    precioCop: configuracion.precioCop,
    actualizadaEn: ahora,
    simulado: true,
    desactivadaPor: administrador.uid,
    desactivadaEn: ahora,
    motivoDesactivacion: 'Asignación inicial del plan (pendiente de activación)',
  };

  await writeBatch(db)
    .set(
      suscripcionRef(orgId),
      { ...suscripcion, actualizadaEn: ahora },
      { merge: true }
    )
    .commit();

  await registrarHistorialSuscripcion({
    orgId,
    orgNombre,
    tipo: 'asignacion',
    estado: 'inactive',
    precioCop: suscripcion.precioCop,
    responsableUid: administrador.uid,
    responsableCorreo: administrador.correo,
    motivo: 'Plan Súper Empresarial asignado',
  });

  await audit(administrador, orgId, 'suscripcion.asignar', orgId, {
    planId: suscripcion.planId,
    precioCop: suscripcion.precioCop,
  });

  return suscripcion;
}

/** Activa manualmente el plan a 30 días desde hoy. */
export async function activarSuscripcion(
  datos: DatosOperacion
): Promise<{ vencimiento: string; precioCop: number }> {
  const configuracion = await leerConfiguracionSuscripcion();
  const ahora = Date.now();
  const vencimiento = fechaMasDias(hoyISO(), DIAS_VIGENCIA);

  await writeBatch(db)
    .set(
      suscripcionRef(datos.orgId),
      {
        orgId: datos.orgId,
        planId: PLAN_SUPER_EMPRESARIAL.id,
        precioCop: configuracion.precioCop,
        estado: 'active',
        inicio: hoyISO(),
        vencimiento,
        activadaPor: datos.administrador.uid,
        activadaEn: ahora,
        desactivadaPor: null,
        desactivadaEn: null,
        motivoDesactivacion: null,
        actualizadaEn: ahora,
        simulado: true,
      },
      { merge: true }
    )
    .commit();

  await registrarHistorialSuscripcion({
    orgId: datos.orgId,
    orgNombre: datos.orgNombre,
    tipo: 'activacion',
    estado: 'active',
    precioCop: configuracion.precioCop,
    responsableUid: datos.administrador.uid,
    responsableCorreo: datos.administrador.correo,
    motivo: null,
  });

  await audit(datos.administrador, datos.orgId, 'suscripcion.activar', datos.orgId, {
    precioCop: configuracion.precioCop,
    vencimiento,
  });

  return { vencimiento, precioCop: configuracion.precioCop };
}

/**
 * Renueva 30 días desde el vencimiento vigente (o desde hoy
 * si ya se venció / no hay fecha), con el precio vigente
 * salvo un precio acordado previamente.
 */
export async function renovarSuscripcion(
  datos: DatosOperacion,
  precioAcordadoCop?: number | null
): Promise<{ vencimiento: string; precioCop: number }> {
  const configuracion = await leerConfiguracionSuscripcion();
  const precioCop =
    precioAcordadoCop && precioAcordadoCop > 0
      ? precioAcordadoCop
      : configuracion.precioCop;

  const hoy = hoyISO();
  const vencimientoActual = datos.suscripcion.vencimiento;
  const base =
    vencimientoActual && vencimientoActual >= hoy ? vencimientoActual : hoy;
  const nuevoVencimiento = fechaMasDias(base, DIAS_VIGENCIA);
  const ahora = Date.now();

  await writeBatch(db)
    .set(
      suscripcionRef(datos.orgId),
      {
        orgId: datos.orgId,
        planId: PLAN_SUPER_EMPRESARIAL.id,
        precioCop,
        estado: 'active',
        inicio: datos.suscripcion.inicio ?? hoy,
        vencimiento: nuevoVencimiento,
        renovadaEn: ahora,
        desactivadaPor: null,
        desactivadaEn: null,
        motivoDesactivacion: null,
        actualizadaEn: ahora,
        simulado: true,
      },
      { merge: true }
    )
    .commit();

  await registrarHistorialSuscripcion({
    orgId: datos.orgId,
    orgNombre: datos.orgNombre,
    tipo: 'renovacion',
    estado: 'active',
    precioCop,
    responsableUid: datos.administrador.uid,
    responsableCorreo: datos.administrador.correo,
    motivo: `Renovación desde ${base}`,
  });

  await audit(datos.administrador, datos.orgId, 'suscripcion.renovar', datos.orgId, {
    precioCop,
    vencimiento: nuevoVencimiento,
    base,
  });

  return { vencimiento: nuevoVencimiento, precioCop };
}

/** Desactiva con confirmación y motivo obligatorio. */
export async function desactivarSuscripcion(
  datos: DatosOperacion,
  motivo: string
): Promise<void> {
  const texto = motivo.trim();
  if (texto.length < 4) {
    throw new Error('Debes indicar el motivo de la desactivación.');
  }

  const ahora = Date.now();

  await writeBatch(db)
    .set(
      suscripcionRef(datos.orgId),
      {
        orgId: datos.orgId,
        estado: 'inactive',
        desactivadaPor: datos.administrador.uid,
        desactivadaEn: ahora,
        motivoDesactivacion: texto,
        actualizadaEn: ahora,
        simulado: true,
      },
      { merge: true }
    )
    .commit();

  await registrarHistorialSuscripcion({
    orgId: datos.orgId,
    orgNombre: datos.orgNombre,
    tipo: 'desactivacion',
    estado: 'inactive',
    precioCop: datos.suscripcion.precioCop,
    responsableUid: datos.administrador.uid,
    responsableCorreo: datos.administrador.correo,
    motivo: texto,
  });

  await audit(datos.administrador, datos.orgId, 'suscripcion.desactivar', datos.orgId, {
    motivo: texto,
  });
}

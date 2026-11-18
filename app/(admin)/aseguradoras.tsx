/*
=======================================================
NITRO SYNC - PANEL DE PLATAFORMA · ASEGURADORAS
=======================================================

Administra TODAS las organizaciones (aseguradoras) y su
suscripción al ÚNICO plan SÚPER EMPRESARIAL:

  - Activar / aprobar: activa 30 días (o asigna el plan antes).
  - Renovar: 30 días desde el vencimiento vigente.
  - Desactivar: requiere confirmación y motivo obligatorio.
  - Asignar plan: deja la suscripción en estado INACTIVO.
  - Historial por aseguradora y filtros en cliente.

Una suscripción vencida NUNCA se muestra como activa: el
estado se calcula con `estadoEfectivoSuscripcion`.
No existen planes múltiples ni cambio de plan.
=======================================================
*/

import { useEffect, useMemo, useState } from 'react';

import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import BotonNitro from '@/components/ui/boton-nitro';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import { useAlerta, useConfirm } from '@/components/ui/confirm-dialog';

import { claveAseguradora } from '@/data/aseguradoras';
import { PLAN_SUPER_EMPRESARIAL } from '@/data/planSuscripcion';

import { repararAseguradoraClaves } from '@/services/admin';
import {
  actualizarOrganizacion,
  suscribirOrganizaciones,
} from '@/services/organizaciones';
import { suscribirConfiguracionSuscripcion } from '@/services/configuracionSuscripcion';
import {
  formatearCop,
  suscribirSuscripciones,
} from '@/services/facturacion';
import { suscribirHistorialOrg } from '@/services/historialSuscripciones';
import {
  activarSuscripcion,
  asignarPlanSuperEmpresarial,
  desactivarSuscripcion,
  renovarSuscripcion,
  type DatosOperacion,
} from '@/services/gestionSuscripciones';
import { registrarAuditoria } from '@/services/auditoria';

import {
  CLAVE_COLOR_ESTADO_SUSCRIPCION,
  ETIQUETA_ESTADO_ORG,
  ETIQUETA_ESTADO_SUSCRIPCION,
  ETIQUETA_SIMULADO,
  ETIQUETA_TIPO_HISTORIAL,
  estadoEfectivoSuscripcion,
  type EstadoOrganizacion,
  type EstadoSuscripcion,
  type HistorialSuscripcion,
  type Organizacion,
  type Suscripcion,
} from '@/types/negocio';

type FiltroEstado = EstadoSuscripcion | 'todos';

const OPCIONES_ESTADO: { id: FiltroEstado; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todas' },
  { id: 'pendiente', etiqueta: ETIQUETA_ESTADO_SUSCRIPCION.pendiente },
  { id: 'active', etiqueta: ETIQUETA_ESTADO_SUSCRIPCION.active },
  { id: 'expired', etiqueta: ETIQUETA_ESTADO_SUSCRIPCION.expired },
  { id: 'inactive', etiqueta: ETIQUETA_ESTADO_SUSCRIPCION.inactive },
];

function claveColorOrg(estado: EstadoOrganizacion): keyof TipoPaleta {
  if (estado === 'active') return 'exito';
  if (estado === 'suspended') return 'peligro';

  return 'advertencia';
}

/** Las organizaciones sin suscripción se consideran INACTIVAS. */
function estadoSuscripcionOrg(
  suscripcion: Suscripcion | null
): EstadoSuscripcion {
  if (!suscripcion) return 'inactive';

  return estadoEfectivoSuscripcion(suscripcion);
}

function fechaLegible(fecha: string | null): string {
  return fecha?.slice(0, 10) || '—';
}

export default function AseguradorasAdmin() {
  const { user } = useAuth();
  const alerta = useAlerta();
  const confirmar = useConfirm();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [precioVigenteCop, setPrecioVigenteCop] = useState<number>(
    PLAN_SUPER_EMPRESARIAL.precioInicialCop
  );

  /* Filtros en cliente: ningún índice compuesto nuevo. */
  const [textoNombre, setTextoNombre] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [ocupado, setOcupado] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [historialOrgId, setHistorialOrgId] = useState<string | null>(null);
  const [historialOrg, setHistorialOrg] = useState<HistorialSuscripcion[]>([]);
  const [motivoOrgId, setMotivoOrgId] = useState<string | null>(null);
  const [motivoTexto, setMotivoTexto] = useState('');

  useEffect(() => {
    const pararOrgs = suscribirOrganizaciones(setOrganizaciones);
    const pararSuscripciones = suscribirSuscripciones(setSuscripciones);
    const pararConfiguracion = suscribirConfiguracionSuscripcion((configuracion) =>
      setPrecioVigenteCop(configuracion.precioCop)
    );

    return () => {
      pararOrgs();
      pararSuscripciones();
      pararConfiguracion();
    };
  }, []);

  /*
  Autorreparación en segundo plano: al abrir el panel se
  completan las claves que falten sin bloquear la pantalla.
  Es idempotente; si falla no molesta al usuario.
  */
  useEffect(() => {
    let activo = true;

    repararAseguradoraClaves()
      .then(({ organizaciones: orgs, vehiculos }) => {
        if (!activo) return;
        if (orgs > 0 || vehiculos > 0) {
          console.log(
            `Autorreparación: ${orgs} organización(es) y ${vehiculos} vehículo(s) puestos al día.`
          );
        }
      })
      .catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : error;
        console.warn('Autorreparación de claves omitida:', mensaje);
      });

    return () => {
      activo = false;
    };
  }, []);

  /* Historial de una sola aseguradora, bajo demanda. */
  useEffect(() => {
    if (!historialOrgId) return;

    return suscribirHistorialOrg(historialOrgId, setHistorialOrg);
  }, [historialOrgId]);

  const lista = useMemo(
    () =>
      organizaciones.filter((org) => {
        const suscripcion =
          suscripciones.find((s) => s.orgId === org.id) ?? null;

        if (
          filtroEstado !== 'todos' &&
          estadoSuscripcionOrg(suscripcion) !== filtroEstado
        ) {
          return false;
        }

        const texto = textoNombre.trim().toLowerCase();
        if (
          texto &&
          !org.nombre.toLowerCase().includes(texto) &&
          !(org.correo ?? '').toLowerCase().includes(texto) &&
          !org.id.toLowerCase().includes(texto)
        ) {
          return false;
        }

        /* El rango se aplica sobre inicio o vencimiento. */
        if (desde || hasta) {
          const fechas = [suscripcion?.inicio, suscripcion?.vencimiento].filter(
            (fecha): fecha is string => Boolean(fecha)
          );
          const coincide = fechas.some(
            (fecha) =>
              (!desde || fecha.slice(0, 10) >= desde) &&
              (!hasta || fecha.slice(0, 10) <= hasta)
          );
          if (!coincide) return false;
        }

        return true;
      }),
    [organizaciones, suscripciones, filtroEstado, textoNombre, desde, hasta]
  );

  const sinSuscripcion = useMemo(
    () => organizaciones.filter((org) => !suscripciones.some((s) => s.orgId === org.id)),
    [organizaciones, suscripciones]
  );

  const administrator = () =>
    user ? { uid: user.uid, correo: user.email } : null;

  const datosDe = (
    org: Organizacion,
    suscripcion: Suscripcion,
    administrador: { uid: string; correo: string | null }
  ): DatosOperacion => ({
    orgId: org.id,
    orgNombre: org.nombre,
    administrador,
    suscripcion,
  });

  const auditar = async (
    accion: string,
    org: Organizacion,
    detalle: Record<string, string | number | boolean | null>,
    entidad = 'organizations',
    entidadId = org.id
  ) => {
    if (!user) return;

    await registrarAuditoria({
      actorUid: user.uid,
      actorCorreo: user.email,
      actorRol: 'super_admin',
      orgId: org.id,
      accion,
      entidad,
      entidadId,
      detalle,
    });
  };

  /* ------------------------------------------------------
     ACCIONES DE LA SUSCRIPCIÓN (PLAN ÚNICO)
  ------------------------------------------------------ */

  const activar = async (org: Organizacion) => {
    const administrador = administrator();
    if (!administrador) return;

    const ok = await confirmar({
      titulo: 'Activar / aprobar plan',
      mensaje: `¿Activar ${PLAN_SUPER_EMPRESARIAL.nombre} para ${org.nombre} durante 30 días? Si aún no tiene suscripción, se le asigna primero el plan. No se realiza ningún cobro (${ETIQUETA_SIMULADO}).`,
      textoConfirmar: 'Activar',
      icono: 'checkmark-circle-outline',
    });

    if (!ok) return;

    try {
      setOcupado(org.id);

      const suscripcion =
        suscripciones.find((s) => s.orgId === org.id) ??
        (await asignarPlanSuperEmpresarial(org.id, org.nombre, administrador));

      const resultado = await activarSuscripcion(
        datosDe(org, suscripcion, administrador)
      );

      await alerta({
        titulo: 'Plan activado',
        mensaje: `${org.nombre} queda activo hasta ${resultado.vencimiento}. No se cobró ningún dinero.`,
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo activar',
        mensaje: 'Revisa tu conexión e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  const asignar = async (org: Organizacion) => {
    const administrador = administrator();
    if (!administrador) return;

    const ok = await confirmar({
      titulo: 'Asignar plan Súper Empresarial',
      mensaje: `¿Asignar ${PLAN_SUPER_EMPRESARIAL.nombre} a ${org.nombre}? Quedará en estado INACTIVO hasta que lo actives expresamente. No se realiza ningún cobro.`,
      textoConfirmar: 'Asignar',
      icono: 'card-outline',
    });

    if (!ok) return;

    try {
      setOcupado(org.id);

      await asignarPlanSuperEmpresarial(org.id, org.nombre, administrador);

      await alerta({
        titulo: 'Plan asignado',
        mensaje: `${org.nombre} tiene ${PLAN_SUPER_EMPRESARIAL.nombre} en estado INACTIVO.`,
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo asignar',
        mensaje: 'Revisa tu conexión e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  const renovar = async (org: Organizacion) => {
    const administrador = administrator();
    if (!administrador) return;

    const suscripcion = suscripciones.find((s) => s.orgId === org.id) ?? null;
    if (!suscripcion) {
      await alerta({
        titulo: 'Sin suscripción',
        mensaje: 'Primero asigna el plan Súper Empresarial a esta aseguradora.',
        tipo: 'advertencia',
      });
      return;
    }

    const ok = await confirmar({
      titulo: 'Renovar 30 días',
      mensaje: `¿Renovar ${PLAN_SUPER_EMPRESARIAL.nombre} a ${org.nombre}? La renovación parte del vencimiento vigente para no perder días contratados. No se hace ningún cobro (${ETIQUETA_SIMULADO}).`,
      textoConfirmar: 'Renovar',
      icono: 'refresh-outline',
    });

    if (!ok) return;

    try {
      setOcupado(org.id);

      const resultado = await renovarSuscripcion(
        datosDe(org, suscripcion, administrador)
      );

      await alerta({
        titulo: 'Suscripción renovada',
        mensaje: `${org.nombre} queda vigente hasta ${resultado.vencimiento}. No se hizo ningún cobro.`,
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo renovar',
        mensaje: 'Revisa tu conexión e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  /* Confirmación + motivo obligatorio en dos pasos. */
  const pedirDesactivacion = async (org: Organizacion) => {
    const ok = await confirmar({
      titulo: 'Desactivar suscripción',
      mensaje: `¿Desactivar ${PLAN_SUPER_EMPRESARIAL.nombre} a ${org.nombre}? A continuación debes escribir el motivo. No se realiza ningún cobro.`,
      textoConfirmar: 'Continuar',
      icono: 'ban-outline',
      peligro: true,
    });

    if (!ok) return;

    setHistorialOrgId(null);
    setMotivoTexto('');
    setMotivoOrgId(org.id);
  };

  const confirmarDesactivacion = async (org: Organizacion) => {
    const administrador = administrator();
    if (!administrador) return;

    if (motivoTexto.trim().length < 4) {
      await alerta({
        titulo: 'Falta el motivo',
        mensaje: 'Escribe un motivo de al menos 4 caracteres para desactivar.',
        tipo: 'advertencia',
      });
      return;
    }

    const suscripcion = suscripciones.find((s) => s.orgId === org.id) ?? null;
    if (!suscripcion) {
      await alerta({
        titulo: 'Sin suscripción',
        mensaje: 'Esta aseguradora no tiene una suscripción que desactivar.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setOcupado(org.id);

      await desactivarSuscripcion(
        datosDe(org, suscripcion, administrador),
        motivoTexto
      );

      setMotivoOrgId(null);
      setMotivoTexto('');

      await alerta({
        titulo: 'Suscripción desactivada',
        mensaje: `${org.nombre} quedó INACTIVA. El motivo quedó en el historial.`,
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo desactivar',
        mensaje: 'Revisa tu conexión e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  /* ------------------------------------------------------
     DATOS DE LA ORGANIZACIÓN (NO DEL PLAN)
  ------------------------------------------------------ */

  const cambiarEstadoOrg = async (
    org: Organizacion,
    estado: EstadoOrganizacion
  ) => {
    const etiqueta = ETIQUETA_ESTADO_ORG[estado];

    const ok = await confirmar({
      titulo: `Marcar como ${etiqueta.toLowerCase()}`,
      mensaje: `¿Cambiar el estado de la organización ${org.nombre} a "${etiqueta}"? Esto afecta el acceso a los datos, no la suscripción.`,
      textoConfirmar: etiqueta,
      icono: 'swap-horizontal-outline',
      peligro: estado === 'suspended',
    });

    if (!ok) return;

    try {
      setOcupado(org.id);
      await actualizarOrganizacion(org.id, { estado });
      await auditar('organizacion.estado', org, { estado });
    } catch {
      await alerta({
        titulo: 'No se pudo actualizar',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  const alternarAcceso = async (org: Organizacion) => {
    const habilitar = !org.accesoHabilitado;

    const ok = await confirmar({
      titulo: habilitar ? 'Habilitar acceso' : 'Bloquear acceso',
      mensaje: habilitar
        ? `¿Devolver el acceso a los datos a ${org.nombre}?`
        : `${org.nombre} dejará de leer vehículos, pólizas y avisos.`,
      textoConfirmar: habilitar ? 'Habilitar' : 'Bloquear',
      icono: habilitar ? 'lock-open-outline' : 'lock-closed-outline',
      peligro: !habilitar,
    });

    if (!ok) return;

    try {
      setOcupado(org.id);
      await actualizarOrganizacion(org.id, { accesoHabilitado: habilitar });
      await auditar('organizacion.acceso', org, { accesoHabilitado: habilitar });
    } catch {
      await alerta({
        titulo: 'No se pudo actualizar',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  const sincronizar = async () => {
    const ok = await confirmar({
      titulo: 'Poner al día las claves',
      mensaje:
        'Se recalcula la clave automática de las organizaciones y de los vehículos a partir de su nombre de aseguradora. Solo cambia ese campo y es seguro repetirlo.',
      textoConfirmar: 'Sincronizar',
      icono: 'sync-outline',
    });

    if (!ok) return;

    try {
      setSincronizando(true);

      const { organizaciones: orgs, vehiculos } = await repararAseguradoraClaves();

      await alerta({
        titulo: 'Sincronización completa',
        mensaje: `${orgs} organización(es) y ${vehiculos} vehículo(s) puestos al día.`,
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo sincronizar',
        mensaje: 'Revisa tu conexión y las reglas de Firestore.',
        tipo: 'error',
      });
    } finally {
      setSincronizando(false);
    }
  };

  const verHistorial = (orgId: string) => {
    setMotivoOrgId(null);
    setHistorialOrg([]);
    setHistorialOrgId((actual) => (actual === orgId ? null : orgId));
  };

  const renderTarjeta = ({ item }: { item: Organizacion }) => {
    const suscripcion = suscripciones.find((s) => s.orgId === item.id) ?? null;
    const efectivo = estadoSuscripcionOrg(suscripcion);
    const colorSuscripcion = paleta[
      CLAVE_COLOR_ESTADO_SUSCRIPCION[efectivo] as keyof TipoPaleta
    ];
    const colorOrg = paleta[claveColorOrg(item.estado)];
    const ocupada = ocupado === item.id;
    const motivoAbierto = motivoOrgId === item.id;
    const historialAbierto = historialOrgId === item.id;

    return (
      <View style={styles.tarjeta}>
        <View style={styles.tarjetaCabecera}>
          <View style={styles.tarjetaTextos}>
            <Text style={styles.nombre} numberOfLines={1}>
              {item.nombre}
            </Text>
            <Text style={styles.correo} numberOfLines={1}>
              {item.correo ?? 'Sin correo'}
            </Text>
          </View>

          <View style={[styles.estado, { borderColor: colorSuscripcion }]}>
            <Text style={[styles.estadoTexto, { color: colorSuscripcion }]}>
              {suscripcion
                ? ETIQUETA_ESTADO_SUSCRIPCION[efectivo]
                : 'SIN SUSCRIPCIÓN'}
            </Text>
          </View>
        </View>

        <View style={styles.datosFila}>
          <Ionicons name="business-outline" size={14} color={colorOrg} />
          <Text style={styles.datosTexto}>
            Organización: {ETIQUETA_ESTADO_ORG[item.estado]}
          </Text>
        </View>

        <View style={styles.datosFila}>
          <Ionicons
            name={item.accesoHabilitado ? 'lock-open-outline' : 'lock-closed-outline'}
            size={14}
            color={item.accesoHabilitado ? paleta.exito : paleta.peligro}
          />
          <Text style={styles.datosTexto}>
            Acceso {item.accesoHabilitado ? 'habilitado' : 'bloqueado'}
          </Text>
        </View>

        <View style={styles.datosFila}>
          <Ionicons name="key-outline" size={14} color={paleta.textoSecundario} />
          <Text style={styles.datosTexto}>
            Clave: {item.aseguradoraClave || claveAseguradora(item.nombre) || '—'}
          </Text>
        </View>

        <View style={styles.suscripcion}>
          <View style={styles.suscripcionCabecera}>
            <Text style={styles.seccionTitulo}>
              Suscripción · {PLAN_SUPER_EMPRESARIAL.nombre}
            </Text>
            <View style={styles.simuladoPill}>
              <Text style={styles.simuladoTexto}>{ETIQUETA_SIMULADO}</Text>
            </View>
          </View>

          <Text style={styles.datosTexto}>
            Plan: {suscripcion ? PLAN_SUPER_EMPRESARIAL.nombre : 'Sin asignar'}
          </Text>
          <Text style={styles.datosTexto}>
            Precio:{' '}
            {formatearCop(suscripcion?.precioCop ?? precioVigenteCop)} / mes
          </Text>
          <Text style={styles.datosTexto}>
            Inicio: {fechaLegible(suscripcion?.inicio ?? null)} · Vence:{' '}
            {fechaLegible(suscripcion?.vencimiento ?? null)}
          </Text>
          <Text style={styles.datosTexto}>
            Estado efectivo: {ETIQUETA_ESTADO_SUSCRIPCION[efectivo]}
          </Text>

          {efectivo === 'expired' ? (
            <Text style={styles.alertaTexto}>
              Vencida: debe renovarse para volver a estar activa.
            </Text>
          ) : null}
        </View>

        <View style={styles.acciones}>
          {!suscripcion || efectivo !== 'active' ? (
            <Pressable
              style={[styles.accion, { borderColor: paleta.exito }]}
              onPress={() => activar(item)}
              disabled={ocupada}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={16}
                color={paleta.exito}
              />
              <Text style={[styles.accionTexto, { color: paleta.exito }]}>
                Activar / aprobar
              </Text>
            </Pressable>
          ) : null}

          {suscripcion ? (
            <Pressable
              style={[styles.accion, { borderColor: paleta.primarioOscuro }]}
              onPress={() => renovar(item)}
              disabled={ocupada}
            >
              <Ionicons name="refresh-outline" size={16} color={paleta.primarioOscuro} />
              <Text style={[styles.accionTexto, { color: paleta.primarioOscuro }]}>
                Renovar 30 días
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.accion, { borderColor: paleta.primario }]}
              onPress={() => asignar(item)}
              disabled={ocupada}
            >
              <Ionicons name="card-outline" size={16} color={paleta.primario} />
              <Text style={[styles.accionTexto, { color: paleta.primario }]}>
                Asignar plan Súper Empresarial
              </Text>
            </Pressable>
          )}

          {suscripcion && efectivo !== 'inactive' ? (
            <Pressable
              style={[styles.accion, { borderColor: paleta.peligro }]}
              onPress={() => pedirDesactivacion(item)}
              disabled={ocupada}
            >
              <Ionicons name="ban-outline" size={16} color={paleta.peligro} />
              <Text style={[styles.accionTexto, { color: paleta.peligro }]}>
                Desactivar
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.accion, { borderColor: paleta.bordeDuro }]}
            onPress={() => verHistorial(item.id)}
          >
            <Ionicons
              name={historialAbierto ? 'chevron-up-outline' : 'time-outline'}
              size={16}
              color={paleta.textoSecundario}
            />
            <Text style={[styles.accionTexto, { color: paleta.textoSecundario }]}>
              {historialAbierto ? 'Ocultar historial' : 'Ver historial'}
            </Text>
          </Pressable>
        </View>

        {motivoAbierto ? (
          <View style={styles.motivo}>
            <Text style={styles.seccionTitulo}>
              Motivo de la desactivación (obligatorio)
            </Text>
            <TextInput
              style={styles.inputMotivo}
              value={motivoTexto}
              onChangeText={setMotivoTexto}
              placeholder="Ej. Solicitud formal de la aseguradora"
              placeholderTextColor={paleta.textoSuave}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.acciones}>
              <Pressable
                style={[styles.accion, { borderColor: paleta.peligro }]}
                onPress={() => confirmarDesactivacion(item)}
                disabled={ocupada}
              >
                <Ionicons name="save-outline" size={16} color={paleta.peligro} />
                <Text style={[styles.accionTexto, { color: paleta.peligro }]}>
                  Confirmar desactivación
                </Text>
              </Pressable>

              <Pressable
                style={[styles.accion, { borderColor: paleta.bordeDuro }]}
                onPress={() => {
                  setMotivoOrgId(null);
                  setMotivoTexto('');
                }}
              >
                <Ionicons name="close-outline" size={16} color={paleta.textoSecundario} />
                <Text style={[styles.accionTexto, { color: paleta.textoSecundario }]}>
                  Cancelar
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {historialAbierto ? (
          <View style={styles.historial}>
            <Text style={styles.seccionTitulo}>Historial de {item.nombre}</Text>

            {historialOrg.length === 0 ? (
              <Text style={styles.datosTexto}>Sin registros para esta aseguradora.</Text>
            ) : (
              historialOrg.map((registro) => (
                <View key={registro.id} style={styles.historialFila}>
                  <View style={styles.historialCabecera}>
                    <Text style={styles.historialTipo}>
                      {ETIQUETA_TIPO_HISTORIAL[registro.tipo] ?? registro.tipo}
                    </Text>
                    <Text style={styles.historialFecha}>
                      {registro.fecha.slice(0, 10)}
                    </Text>
                  </View>
                  <Text style={styles.datosTexto}>
                    Responsable:{' '}
                    {registro.responsableCorreo ?? registro.responsableUid}
                  </Text>
                  {registro.motivo ? (
                    <Text style={styles.datosTexto}>Motivo: {registro.motivo}</Text>
                  ) : null}
                  <Text style={styles.datosTexto}>
                    Precio: {formatearCop(registro.precioCop)}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}

        <View style={styles.separador} />

        <Text style={styles.seccionTitulo}>Organización</Text>
        <View style={styles.acciones}>
          {item.estado !== 'active' ? (
            <Pressable
              style={[styles.accion, { borderColor: paleta.exito }]}
              onPress={() => cambiarEstadoOrg(item, 'active')}
              disabled={ocupada}
            >
              <Ionicons name="checkmark-outline" size={16} color={paleta.exito} />
              <Text style={[styles.accionTexto, { color: paleta.exito }]}>
                Marcar activa
              </Text>
            </Pressable>
          ) : null}

          {item.estado !== 'suspended' ? (
            <Pressable
              style={[styles.accion, { borderColor: paleta.peligro }]}
              onPress={() => cambiarEstadoOrg(item, 'suspended')}
              disabled={ocupada}
            >
              <Ionicons name="ban-outline" size={16} color={paleta.peligro} />
              <Text style={[styles.accionTexto, { color: paleta.peligro }]}>
                Marcar suspendida
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[
              styles.accion,
              {
                borderColor: item.accesoHabilitado
                  ? paleta.advertencia
                  : paleta.exito,
              },
            ]}
            onPress={() => alternarAcceso(item)}
            disabled={ocupada}
          >
            <Ionicons
              name={item.accesoHabilitado ? 'lock-closed-outline' : 'lock-open-outline'}
              size={16}
              color={item.accesoHabilitado ? paleta.advertencia : paleta.exito}
            />
            <Text
              style={[
                styles.accionTexto,
                {
                  color: item.accesoHabilitado
                    ? paleta.advertencia
                    : paleta.exito,
                },
              ]}
            >
              {item.accesoHabilitado ? 'Bloquear acceso' : 'Habilitar acceso'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <EncabezadoPanel
        etiqueta="PANEL DE PLATAFORMA"
        titulo="Aseguradoras"
        subtitulo={`${organizaciones.length} organización(es) · ${sinSuscripcion.length} sin suscripción`}
        icono="business"
      />

      <View style={styles.filtros}>
        <TextInput
          style={styles.buscador}
          value={textoNombre}
          onChangeText={setTextoNombre}
          placeholder="Buscar aseguradora o correo"
          placeholderTextColor={paleta.textoSuave}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chips}>
            {OPCIONES_ESTADO.map((opcion) => (
              <Pressable
                key={opcion.id}
                style={[
                  styles.chip,
                  filtroEstado === opcion.id && styles.chipActivo,
                ]}
                onPress={() => setFiltroEstado(opcion.id)}
              >
                <Text
                  style={[
                    styles.chipTexto,
                    filtroEstado === opcion.id && styles.chipTextoActivo,
                  ]}
                >
                  {opcion.etiqueta}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View style={styles.fechaFila}>
          <View style={styles.fechaCampo}>
            <TextInput
              style={styles.inputFecha}
              value={desde}
              onChangeText={setDesde}
              placeholder="Desde AAAA-MM-DD"
              placeholderTextColor={paleta.textoSuave}
            />
          </View>
          <View style={styles.fechaCampo}>
            <TextInput
              style={styles.inputFecha}
              value={hasta}
              onChangeText={setHasta}
              placeholder="Hasta AAAA-MM-DD"
              placeholderTextColor={paleta.textoSuave}
            />
          </View>
        </View>
      </View>

      <View style={styles.syncFila}>
        <BotonNitro
          titulo="Poner al día las claves"
          icono="sync-outline"
          variante="secundario"
          tamano="pequeno"
          onPress={sincronizar}
          cargando={sincronizando}
          anchoCompleto
        />
      </View>

      {sinSuscripcion.length > 0 ? (
        <View style={styles.aviso}>
          <Ionicons name="information-circle-outline" size={16} color={paleta.advertencia} />
          <Text style={styles.avisoTexto}>
            {sinSuscripcion.length} aseguradora(s) sin suscripción. Asigna{' '}
            {PLAN_SUPER_EMPRESARIAL.nombre}; quedarán INACTIVAS hasta que las actives.
          </Text>
        </View>
      ) : null}

      <FlatList
        data={lista}
        keyExtractor={(item) => item.id}
        renderItem={renderTarjeta}
        contentContainerStyle={styles.lista}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons name="business-outline" size={44} color={paleta.textoSuave} />
            <Text style={styles.vacioTitulo}>Sin aseguradoras</Text>
            <Text style={styles.vacioTexto}>
              No hay organizaciones que coincidan con los filtros.
            </Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    pantalla: { flex: 1, backgroundColor: Paleta.fondo },

    filtros: {
      gap: 8,
      paddingHorizontal: 16,
      marginTop: -24,
    },
    buscador: {
      backgroundColor: Paleta.tarjeta,
      borderWidth: 1.5,
      borderColor: Paleta.borde,
      borderRadius: Radios.suave,
      paddingHorizontal: 14,
      height: 46,
      fontSize: 13,
      color: Paleta.texto,
      ...Sombras.suave,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: Radios.pastilla,
      borderWidth: 1.5,
      borderColor: Paleta.borde,
      backgroundColor: Paleta.tarjeta,
    },
    chipActivo: { backgroundColor: Paleta.tinta, borderColor: Paleta.bordeDuro },
    chipTexto: {
      fontSize: 12,
      fontWeight: '800',
      color: Paleta.textoSecundario,
    },
    chipTextoActivo: { color: Paleta.acento },
    fechaFila: { flexDirection: 'row', gap: 8 },
    fechaCampo: { flex: 1 },
    inputFecha: {
      backgroundColor: Paleta.tarjeta,
      borderWidth: 1,
      borderColor: Paleta.borde,
      borderRadius: Radios.suave,
      paddingHorizontal: 10,
      height: 42,
      fontSize: 12,
      color: Paleta.texto,
    },
    syncFila: { paddingHorizontal: 16, marginTop: 12 },

    aviso: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      marginHorizontal: 16,
      marginTop: 12,
      padding: 12,
      borderRadius: Radios.suave,
      borderWidth: 1,
      borderColor: Paleta.borde,
      backgroundColor: Paleta.tarjeta,
    },
    avisoTexto: {
      flex: 1,
      fontSize: 12,
      color: Paleta.textoSecundario,
      lineHeight: 17,
    },

    lista: { padding: 16, gap: 12, paddingBottom: 44 },
    tarjeta: {
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.tarjeta,
      padding: 16,
      gap: 8,
      ...Sombras.suave,
    },
    tarjetaCabecera: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    tarjetaTextos: { flex: 1 },
    nombre: { fontSize: 15.5, fontWeight: '900', color: Paleta.texto },
    correo: { fontSize: 12, color: Paleta.textoSecundario, marginTop: 2 },
    estado: {
      borderWidth: 1.5,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    estadoTexto: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },

    datosFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    datosTexto: {
      fontSize: 12.5,
      color: Paleta.textoSecundario,
      flexShrink: 1,
      lineHeight: 18,
    },

    suscripcion: {
      gap: 4,
      padding: 10,
      borderRadius: Radios.suave,
      backgroundColor: Paleta.fondo,
      borderWidth: 1,
      borderColor: Paleta.borde,
    },
    suscripcionCabecera: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    seccionTitulo: {
      fontSize: 12.5,
      fontWeight: '900',
      color: Paleta.texto,
      flexShrink: 1,
    },
    simuladoPill: {
      borderRadius: Radios.pastilla,
      backgroundColor: Paleta.primarioClaro,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    simuladoTexto: {
      fontSize: 10,
      fontWeight: '900',
      color: Paleta.primarioOscuro,
    },
    alertaTexto: {
      fontSize: 11.5,
      fontWeight: '800',
      color: Paleta.textoPeligro,
      marginTop: 2,
    },

    acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    accion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1.5,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    accionTexto: { fontSize: 12, fontWeight: '800' },

    motivo: {
      gap: 8,
      padding: 12,
      borderRadius: Radios.suave,
      borderWidth: 1.5,
      borderColor: Paleta.peligro,
      backgroundColor: Paleta.peligroFondo,
    },
    inputMotivo: {
      minHeight: 72,
      backgroundColor: Paleta.tarjeta,
      borderWidth: 1,
      borderColor: Paleta.borde,
      borderRadius: Radios.suave,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: Paleta.texto,
    },

    historial: {
      gap: 6,
      padding: 10,
      borderRadius: Radios.suave,
      backgroundColor: Paleta.fondoAlterno,
      borderWidth: 1,
      borderColor: Paleta.borde,
    },
    historialFila: {
      gap: 2,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: Paleta.borde,
    },
    historialCabecera: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    historialTipo: {
      fontSize: 12,
      fontWeight: '900',
      color: Paleta.texto,
      flexShrink: 1,
    },
    historialFecha: { fontSize: 11, fontWeight: '800', color: Paleta.textoSuave },

    separador: {
      height: 1,
      backgroundColor: Paleta.borde,
      marginVertical: 2,
    },

    vacio: { alignItems: 'center', marginTop: 60, gap: 8, paddingHorizontal: 30 },
    vacioTitulo: { fontSize: 17, fontWeight: '900', color: Paleta.texto },
    vacioTexto: {
      fontSize: 13,
      color: Paleta.textoSecundario,
      textAlign: 'center',
      lineHeight: 19,
    },
  });

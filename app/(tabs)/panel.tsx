import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ImagenVehiculo from '@/components/ui/imagen-vehiculo';
import { useAlerta, useConfirm } from '@/components/ui/confirm-dialog';
import {
  coloresEstado,
  coloresTipo,
  Gradientes,
  Radios,
  Sombras,
  type TipoPaleta,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import { buscarAseguradora } from '@/data/aseguradoras';
import { PLAN_SUPER_EMPRESARIAL } from '@/data/planSuscripcion';
import { suscribirTodosLosVehiculos } from '@/services/admin';
import { suscribirComprasSuscripcion } from '@/services/comprasSuscripcion';
import { formatearCop, suscribirSuscripciones } from '@/services/facturacion';
import { suscribirHistorialSuscripciones } from '@/services/historialSuscripciones';
import {
  activarSuscripcion,
  asignarPlanSuperEmpresarial,
  desactivarSuscripcion,
} from '@/services/gestionSuscripciones';
import {
  marcarNotificacionLeida,
  marcarTodasLeidas,
  suscribirNotificacionesAdmin,
  suscribirNotificacionesNoLeidas,
} from '@/services/notificacionesAdmin';
import { suscribirOrganizaciones } from '@/services/organizaciones';
import {
  FILTRO_POR_RENOVAR,
  FILTRO_SIN_SEGURO,
  FILTRO_TODOS,
  PREFIJO_ASEGURADORA,
  contarPorAseguradora,
  estadoSeguro,
  filtrarVehiculos,
  nombreAseguradora,
  resumirVehiculos,
  textoVencimiento,
  type TipoFiltro,
} from '@/utils/admin';
import { describirErrorFirestore } from '@/utils/errorFirestore';

import {
  CLAVE_COLOR_ESTADO_SUSCRIPCION,
  ETIQUETA_ESTADO_COMPRA,
  ETIQUETA_ESTADO_ORG,
  ETIQUETA_ESTADO_SUSCRIPCION,
  ETIQUETA_SIMULADO,
  ETIQUETA_TIPO_HISTORIAL,
  estadoEfectivoSuscripcion,
  type CompraSuscripcion,
  type HistorialSuscripcion,
  type NotificacionAdmin,
  type Organizacion,
  type Suscripcion,
} from '@/types/negocio';
import type { VehiculoAdmin } from '@/types/models';

const TIPOS: { clave: TipoFiltro; texto: string }[] = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'Carro', texto: 'Carros' },
  { clave: 'Moto', texto: 'Motos' },
];

function Chip({
  texto,
  activo,
  onPress,
}: {
  texto: string;
  activo: boolean;
  onPress: () => void;
}) {
  const styles = useEstilos(crearEstilos);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, activo && styles.chipActivo]}
      accessibilityRole="button"
    >
      <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>
        {texto}
      </Text>
    </Pressable>
  );
}

function Estadistica({
  valor,
  etiqueta,
  icono,
  color,
}: {
  valor: number;
  etiqueta: string;
  icono: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.estadistica}>
      <Ionicons name={icono} size={20} color={color} />
      <Text style={styles.estadisticaValor}>{valor}</Text>
      <Text style={styles.estadisticaEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

/* ---------------------------------------------------------
   NOTIFICACIONES DEL SÚPER ADMINISTRADOR

   Se alimentan en tiempo real de `notificacionesAdmin`.
   Incluye contador de no leídas, historial, marcar como leída
   y acceso directo a la compra en Facturación.
--------------------------------------------------------- */
function NotificacionesCompras() {
  const { user } = useAuth();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [noLeidas, setNoLeidas] = useState<NotificacionAdmin[]>([]);
  const [historial, setHistorial] = useState<NotificacionAdmin[]>([]);
  const [vista, setVista] = useState<'pendientes' | 'historial'>('pendientes');
  const [marcando, setMarcando] = useState(false);

  useEffect(() => {
    const pararNoLeidas = suscribirNotificacionesNoLeidas(setNoLeidas);
    const pararHistorial = suscribirNotificacionesAdmin(setHistorial);

    return () => {
      pararNoLeidas();
      pararHistorial();
    };
  }, []);

  const lista = vista === 'pendientes' ? noLeidas : historial;

  const abrirCompra = async (notificacion: NotificacionAdmin) => {
    if (user && !notificacion.leida) {
      try {
        await marcarNotificacionLeida(notificacion, user.uid);
      } catch {
        /* La notificación sigue disponible en el historial. */
      }
    }

    router.push({
      pathname: '/(admin)/facturacion',
      params: { compraId: notificacion.compraId },
    });
  };

  const marcarTodo = async () => {
    if (!user || noLeidas.length === 0) return;

    try {
      setMarcando(true);
      await marcarTodasLeidas(noLeidas, user.uid);
    } catch {
      /* Se conserva el estado para reintentar. */
    } finally {
      setMarcando(false);
    }
  };

  return (
    <View style={styles.notificaciones}>
      <View style={styles.notificacionesCabecera}>
        <View style={styles.notificacionesTitulo}>
          <Ionicons name="notifications" size={18} color={paleta.primario} />
          <Text style={styles.notificacionesEtiqueta}>
            Notificaciones de compras
          </Text>
          {noLeidas.length > 0 ? (
            <View style={styles.badgeNoLeidas}>
              <Text style={styles.badgeNoLeidasTexto}>{noLeidas.length}</Text>
            </View>
          ) : null}
        </View>

        {noLeidas.length > 0 ? (
          <TouchableOpacity
            onPress={() => void marcarTodo()}
            disabled={marcando}
            accessibilityRole="button"
            accessibilityLabel="Marcar todas como leídas"
          >
            <Text style={styles.marcarTodas}>Marcar todas como leídas</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.notificacionesTabs}>
        <Pressable
          onPress={() => setVista('pendientes')}
          style={[
            styles.notificacionTab,
            vista === 'pendientes' && styles.notificacionTabActiva,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: vista === 'pendientes' }}
        >
          <Text
            style={[
              styles.notificacionTabTexto,
              vista === 'pendientes' && styles.notificacionTabTextoActivo,
            ]}
          >
            No leídas ({noLeidas.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setVista('historial')}
          style={[
            styles.notificacionTab,
            vista === 'historial' && styles.notificacionTabActiva,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: vista === 'historial' }}
        >
          <Text
            style={[
              styles.notificacionTabTexto,
              vista === 'historial' && styles.notificacionTabTextoActivo,
            ]}
          >
            Historial ({historial.length})
          </Text>
        </Pressable>
      </View>

      {lista.length === 0 ? (
        <Text style={styles.notificacionesVacio}>
          {vista === 'pendientes'
            ? 'No hay compras pendientes por revisar.'
            : 'Todavía no hay notificaciones registradas.'}
        </Text>
      ) : (
        lista.map((notificacion) => (
          <View
            key={notificacion.id}
            style={[
              styles.notificacionFila,
              !notificacion.leida && styles.notificacionFilaNueva,
            ]}
          >
            <View style={styles.notificacionCuerpo}>
              <Text style={styles.notificacionOrg} numberOfLines={1}>
                {notificacion.orgNombre || notificacion.orgId}
              </Text>
              <Text style={styles.notificacionDetalle}>
                {notificacion.planNombre} ·{' '}
                {formatearCop(notificacion.precioCop)}/mes
              </Text>
              <Text style={styles.notificacionFecha}>
                {notificacion.fechaCompra || '—'} ·{' '}
                {ETIQUETA_ESTADO_COMPRA[notificacion.estadoCompra]}
              </Text>
            </View>

            <View style={styles.notificacionAcciones}>
              <TouchableOpacity
                onPress={() => void abrirCompra(notificacion)}
                style={styles.notificacionBoton}
                accessibilityRole="button"
                accessibilityLabel={`Ver compra de ${notificacion.orgNombre}`}
              >
                <Ionicons
                  name="open-outline"
                  size={16}
                  color={paleta.primario}
                />
              </TouchableOpacity>

              {!notificacion.leida ? (
                <TouchableOpacity
                  onPress={() => {
                    if (user) {
                      void marcarNotificacionLeida(notificacion, user.uid);
                    }
                  }}
                  style={styles.notificacionBoton}
                  accessibilityRole="button"
                  accessibilityLabel="Marcar como leída"
                >
                  <Ionicons
                    name="checkmark-done-outline"
                    size={16}
                    color={paleta.exito}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

/* ---------------------------------------------------------
   SUSCRIPCIONES DE ASEGURADORAS (SECCIÓN INFERIOR)

   Acceso directo para el súper administrador: activar,
   desactivar (con motivo) y activar/desactivar todas. La
   columna de pago indica qué aseguradora ya registró su
   compra simulada. Las notificaciones siguen arriba.
--------------------------------------------------------- */

type EstadoSuscripcionFila = ReturnType<typeof estadoEfectivoSuscripcion>;

function estadoSuscripcionFila(suscripcion: Suscripcion | null): EstadoSuscripcionFila {
  return suscripcion
    ? estadoEfectivoSuscripcion(suscripcion)
    : 'inactive';
}

function etiquetaPago(compra: CompraSuscripcion | null): { texto: string; color: keyof TipoPaleta } {
  if (!compra) return { texto: 'Sin pago', color: 'textoSuave' };
  if (compra.estado === 'aprobada') return { texto: 'Pagada', color: 'exito' };
  if (compra.estado === 'rechazada') return { texto: 'Rechazada', color: 'peligro' };
  return { texto: 'Pago por revisar', color: 'advertencia' };
}

/** Suscripción inicial para organizaciones que aún no tienen documento. */
function suscripcionInicial(orgId: string): Suscripcion {
  return {
    id: orgId,
    orgId,
    planId: PLAN_SUPER_EMPRESARIAL.id,
    estado: 'inactive',
    inicio: null,
    vencimiento: null,
    precioCop: null,
    actualizadaEn: Date.now(),
  };
}

/* --- Apoyo para la vista de detalle completo --- */

function textoDetalle(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (Array.isArray(valor)) return valor.length ? valor.join(', ') : '—';
  return String(valor);
}

function fechaHoraDetalle(valor: number | null | undefined): string {
  if (!valor) return '—';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? '—'
    : fecha.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function FilaDetalle({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.detalleFila}>
      <Text style={styles.detalleEtiqueta}>{etiqueta}</Text>
      <Text style={styles.detalleValor} numberOfLines={2}>
        {valor}
      </Text>
    </View>
  );
}

function GrupoDetalle({ titulo, children }: { titulo: string; children: ReactNode }) {
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.detalleGrupo}>
      <Text style={styles.detalleGrupoTitulo}>{titulo}</Text>
      {children}
    </View>
  );
}

function AccionesSuscripcion({
  org,
  suscripcion,
  estado,
  procesando,
  onActivar,
  onDesactivar,
}: {
  org: Organizacion;
  suscripcion: Suscripcion | null;
  estado: EstadoSuscripcionFila;
  procesando: boolean;
  onActivar: () => void;
  onDesactivar: () => void;
}) {
  const { paleta } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.suscripcionAcciones}>
      {estado !== 'active' ? (
        <TouchableOpacity
          onPress={onActivar}
          disabled={procesando}
          style={[styles.suscripcionIcono, { borderColor: paleta.exito }]}
          accessibilityRole="button"
          accessibilityLabel={`Activar ${org.nombre}`}
        >
          <Ionicons name="checkmark-outline" size={17} color={paleta.exito} />
        </TouchableOpacity>
      ) : null}

      {suscripcion ? (
        <TouchableOpacity
          onPress={onDesactivar}
          disabled={procesando}
          style={[styles.suscripcionIcono, { borderColor: paleta.peligro }]}
          accessibilityRole="button"
          accessibilityLabel={`Desactivar ${org.nombre}`}
        >
          <Ionicons name="close-outline" size={17} color={paleta.peligro} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function SuscripcionesAdmin({ detallado = false }: { detallado?: boolean } = {}) {
  const { user } = useAuth();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const alerta = useAlerta();
  const confirmar = useConfirm();

  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [compras, setCompras] = useState<CompraSuscripcion[]>([]);
  const [historial, setHistorial] = useState<HistorialSuscripcion[]>([]);
  const [motivoOrgId, setMotivoOrgId] = useState<string | null>(null);
  const [motivoMasivo, setMotivoMasivo] = useState(false);
  const [motivoTexto, setMotivoTexto] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    const pararOrgs = suscribirOrganizaciones(setOrganizaciones);
    const pararSus = suscribirSuscripciones(setSuscripciones);
    const pararCompras = suscribirComprasSuscripcion(setCompras);
    const pararHistorial = suscribirHistorialSuscripciones(setHistorial);

    return () => {
      pararOrgs();
      pararSus();
      pararCompras();
      pararHistorial();
    };
  }, []);

  const filas = useMemo(() => {
    const mapaSus = new Map(suscripciones.map((s) => [s.orgId, s]));
    const mapaCompras = new Map<string, CompraSuscripcion>();

    for (const compra of compras) {
      const actual = mapaCompras.get(compra.orgId);
      if (!actual || compra.registradoEn > actual.registradoEn) {
        mapaCompras.set(compra.orgId, compra);
      }
    }

    return [...organizaciones]
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((org) => ({
        org,
        suscripcion: mapaSus.get(org.id) ?? null,
        compra: mapaCompras.get(org.id) ?? null,
      }));
  }, [organizaciones, suscripciones, compras]);

  const activas = filas.filter(
    (f) => estadoSuscripcionFila(f.suscripcion) === 'active'
  ).length;
  const porActivar = filas.filter(
    (f) => estadoSuscripcionFila(f.suscripcion) !== 'active'
  );

  const administrador = () => {
    if (!user) return null;
    return { uid: user.uid, correo: user.email ?? null };
  };

  const activar = async (org: Organizacion, suscripcion: Suscripcion | null) => {
    const admin = administrador();
    if (!admin) return;

    const ok = await confirmar({
      titulo: 'Activar suscripción',
      mensaje: `¿Activar ${PLAN_SUPER_EMPRESARIAL.nombre} para ${org.nombre}? Quedará vigente 30 días. No se realiza ningún cobro (${ETIQUETA_SIMULADO}).`,
      textoConfirmar: 'Activar',
      icono: 'checkmark-circle-outline',
    });
    if (!ok) return;

    try {
      setOcupado(org.id);
      if (suscripcion) {
        await activarSuscripcion({
          orgId: org.id,
          orgNombre: org.nombre,
          administrador: admin,
          suscripcion,
        });
      } else {
        await asignarPlanSuperEmpresarial(org.id, org.nombre, admin);
        await activarSuscripcion({
          orgId: org.id,
          orgNombre: org.nombre,
          administrador: admin,
          suscripcion: suscripcionInicial(org.id),
        });
      }
      await alerta({
        titulo: 'Suscripción activada',
        mensaje: `${org.nombre} puede operar durante 30 días.`,
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

  const pedirDesactivacion = (orgId: string | 'todas') => {
    setMotivoTexto('');
    setMotivoOrgId(orgId === 'todas' ? null : orgId);
    setMotivoMasivo(orgId === 'todas');
  };

  const desactivar = async (org: Organizacion, suscripcion: Suscripcion) => {
    const admin = administrador();
    if (!admin) return;

    const ok = await confirmar({
      titulo: 'Desactivar suscripción',
      mensaje: `¿Desactivar ${PLAN_SUPER_EMPRESARIAL.nombre} a ${org.nombre}? Después debes indicar el motivo.`,
      textoConfirmar: 'Continuar',
      icono: 'ban-outline',
      peligro: true,
    });
    if (!ok) return;

    pedirDesactivacion(org.id);
  };

  const confirmarDesactivacion = async () => {
    const admin = administrador();
    if (!admin) return;

    const motivo = motivoTexto.trim();
    if (motivo.length < 4) {
      await alerta({
        titulo: 'Falta el motivo',
        mensaje: 'Escribe un motivo de al menos 4 caracteres.',
        tipo: 'advertencia',
      });
      return;
    }

    const objetivos = motivoMasivo
      ? filas.filter((f) => estadoSuscripcionFila(f.suscripcion) === 'active')
      : filas.filter((f) => f.org.id === motivoOrgId);

    if (objetivos.length === 0) {
      await alerta({
        titulo: 'Sin cambios',
        mensaje: 'No hay suscripciones activas que desactivar.',
        tipo: 'advertencia',
      });
      setMotivoOrgId(null);
      setMotivoMasivo(false);
      return;
    }

    try {
      setOcupado('masivo');
      for (const fila of objetivos) {
        if (!fila.suscripcion) continue;
        await desactivarSuscripcion(
          {
            orgId: fila.org.id,
            orgNombre: fila.org.nombre,
            administrador: admin,
            suscripcion: fila.suscripcion,
          },
          motivo
        );
      }
      await alerta({
        titulo: 'Suscripciones desactivadas',
        mensaje: `${objetivos.length} aseguradora(s) quedaron inactivas.`,
        tipo: 'exito',
      });
      setMotivoOrgId(null);
      setMotivoMasivo(false);
      setMotivoTexto('');
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

  const activarTodas = async () => {
    const admin = administrador();
    if (!admin || porActivar.length === 0) return;

    const ok = await confirmar({
      titulo: 'Activar todas',
      mensaje: `¿Activar ${PLAN_SUPER_EMPRESARIAL.nombre} a las ${porActivar.length} aseguradoras pendientes? Cada una queda vigente 30 días. No se realiza ningún cobro (${ETIQUETA_SIMULADO}).`,
      textoConfirmar: 'Activar todas',
      icono: 'checkmark-done-outline',
    });
    if (!ok) return;

    try {
      setOcupado('masivo');
      for (const fila of porActivar) {
        if (fila.suscripcion) {
          await activarSuscripcion({
            orgId: fila.org.id,
            orgNombre: fila.org.nombre,
            administrador: admin,
            suscripcion: fila.suscripcion,
          });
        } else {
          await asignarPlanSuperEmpresarial(fila.org.id, fila.org.nombre, admin);
          await activarSuscripcion({
            orgId: fila.org.id,
            orgNombre: fila.org.nombre,
            administrador: admin,
            suscripcion: suscripcionInicial(fila.org.id),
          });
        }
      }
      await alerta({
        titulo: 'Suscripciones activadas',
        mensaje: `${porActivar.length} aseguradora(s) pueden operar.`,
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo completar',
        mensaje: 'Revisa tu conexión e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  return (
    <View style={styles.suscripciones}>
      <View style={styles.suscripcionesCabecera}>
        <View style={styles.notificacionesTitulo}>
          <Ionicons name="card-outline" size={18} color={paleta.primario} />
          <Text style={styles.notificacionesEtiqueta}>
            Suscripciones de aseguradoras
          </Text>
        </View>
        <Text style={styles.suscripcionesContador}>
          {activas}/{filas.length} activas
        </Text>
      </View>

      <Text style={styles.suscripcionesAyuda}>
        {PLAN_SUPER_EMPRESARIAL.nombre} · {ETIQUETA_SIMULADO}. Información
        completa de cada aseguradora y su historial.
      </Text>

      {filas.length > 0 ? (
        <View style={styles.suscripcionesAcciones}>
          <TouchableOpacity
            onPress={() => void activarTodas()}
            disabled={ocupado !== null || porActivar.length === 0}
            style={[styles.suscripcionesBoton, { borderColor: paleta.exito }]}
            accessibilityRole="button"
            accessibilityLabel="Activar todas las suscripciones pendientes"
          >
            <Ionicons name="checkmark-done-outline" size={15} color={paleta.exito} />
            <Text style={[styles.suscripcionesBotonTexto, { color: paleta.exito }]}>
              Activar todas ({porActivar.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => pedirDesactivacion('todas')}
            disabled={ocupado !== null || activas === 0}
            style={[styles.suscripcionesBoton, { borderColor: paleta.peligro }]}
            accessibilityRole="button"
            accessibilityLabel="Desactivar todas las suscripciones activas"
          >
            <Ionicons name="ban-outline" size={15} color={paleta.peligro} />
            <Text style={[styles.suscripcionesBotonTexto, { color: paleta.peligro }]}>
              Desactivar todas ({activas})
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {motivoOrgId !== null || motivoMasivo ? (
        <View style={styles.motivoCaja}>
          <Text style={styles.motivoEtiqueta}>
            Motivo de la desactivación (obligatorio)
          </Text>
          <TextInput
            style={styles.motivoInput}
            value={motivoTexto}
            onChangeText={setMotivoTexto}
            placeholder="Ej. Solicitud del cliente"
            placeholderTextColor={paleta.textoSuave}
          />
          <View style={styles.motivoAcciones}>
            <TouchableOpacity
              onPress={() => void confirmarDesactivacion()}
              disabled={ocupado !== null}
              style={[styles.motivoBoton, { backgroundColor: paleta.peligro }]}
              accessibilityRole="button"
              accessibilityLabel="Confirmar desactivación"
            >
              <Text style={[styles.motivoBotonTexto, { color: paleta.blanco }]}>
                Confirmar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setMotivoOrgId(null);
                setMotivoMasivo(false);
                setMotivoTexto('');
              }}
              style={[styles.motivoBoton, { backgroundColor: paleta.fondoAlterno }]}
              accessibilityRole="button"
              accessibilityLabel="Cancelar desactivación"
            >
              <Text style={[styles.motivoBotonTexto, { color: paleta.texto }]}>
                Cancelar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {filas.map((fila) => {
        const estado = estadoSuscripcionFila(fila.suscripcion);
        const color = paleta[
          CLAVE_COLOR_ESTADO_SUSCRIPCION[estado] as keyof TipoPaleta
        ];
        const pago = etiquetaPago(fila.compra);
        const procesando = ocupado === fila.org.id || ocupado === 'masivo';
        const sus = fila.suscripcion;
        const compra = fila.compra;
        const historialOrg = historial.filter((registro) => registro.orgId === fila.org.id);

        return (
          <View
            key={fila.org.id}
            style={[styles.suscripcionContenedor, detallado ? styles.detalleTarjeta : null]}
          >
            <View style={styles.suscripcionFila}>
              <View style={styles.suscripcionCuerpo}>
                <Text style={styles.suscripcionNombre} numberOfLines={1}>
                  {fila.org.nombre}
                </Text>
                <Text style={[styles.suscripcionDetalle, { color }]} numberOfLines={1}>
                  {sus ? formatearCop(sus.precioCop ?? 0) : 'Sin plan'}{' '}
                  · {ETIQUETA_ESTADO_SUSCRIPCION[estado]}
                </Text>
                <Text style={[styles.suscripcionPago, { color: paleta[pago.color] }]}>
                  {pago.texto}
                  {sus?.vencimiento ? ` · vence ${sus.vencimiento}` : ''}
                </Text>
              </View>

              <AccionesSuscripcion
                org={fila.org}
                suscripcion={sus}
                estado={estado}
                procesando={procesando}
                onActivar={() => void activar(fila.org, sus)}
                onDesactivar={() => {
                  if (sus) void desactivar(fila.org, sus);
                }}
              />
            </View>

            {detallado ? (
              <View style={styles.detalleCuerpo}>
                <GrupoDetalle titulo="Organización">
                  <FilaDetalle etiqueta="ID" valor={textoDetalle(fila.org.id)} />
                  <FilaDetalle etiqueta="Slug" valor={textoDetalle(fila.org.slug)} />
                  <FilaDetalle etiqueta="Correo" valor={textoDetalle(fila.org.correo)} />
                  <FilaDetalle etiqueta="Teléfono" valor={textoDetalle(fila.org.telefono)} />
                  <FilaDetalle etiqueta="Teléfono de atención" valor={textoDetalle(fila.org.telefonoContacto)} />
                  <FilaDetalle etiqueta="WhatsApp" valor={textoDetalle(fila.org.whatsapp)} />
                  <FilaDetalle etiqueta="Web" valor={textoDetalle(fila.org.web)} />
                  <FilaDetalle etiqueta="Especialidad" valor={textoDetalle(fila.org.especialidad)} />
                  <FilaDetalle etiqueta="Estado" valor={ETIQUETA_ESTADO_ORG[fila.org.estado]} />
                  <FilaDetalle etiqueta="Acceso habilitado" valor={fila.org.accesoHabilitado ? 'Sí' : 'No'} />
                  <FilaDetalle etiqueta="Clave aseguradora" valor={textoDetalle(fila.org.aseguradoraClave)} />
                  <FilaDetalle etiqueta="Creada" valor={textoDetalle(fila.org.creadaEn)} />
                  <FilaDetalle etiqueta="Actualizada" valor={textoDetalle(fila.org.actualizadaEn)} />
                </GrupoDetalle>

                <GrupoDetalle titulo="Suscripción">
                  <FilaDetalle etiqueta="ID documento" valor={textoDetalle(sus?.id)} />
                  <FilaDetalle etiqueta="Plan" valor={textoDetalle(sus?.planId)} />
                  <FilaDetalle
                    etiqueta="Estado guardado"
                    valor={sus ? ETIQUETA_ESTADO_SUSCRIPCION[sus.estado] : '—'}
                  />
                  <FilaDetalle etiqueta="Estado efectivo" valor={ETIQUETA_ESTADO_SUSCRIPCION[estado]} />
                  <FilaDetalle etiqueta="Inicio" valor={textoDetalle(sus?.inicio)} />
                  <FilaDetalle etiqueta="Vencimiento" valor={textoDetalle(sus?.vencimiento)} />
                  <FilaDetalle
                    etiqueta="Precio"
                    valor={sus?.precioCop != null ? formatearCop(sus.precioCop) : '—'}
                  />
                  <FilaDetalle etiqueta="Simulado" valor={sus?.simulado ? 'Sí' : '—'} />
                  <FilaDetalle etiqueta="Actualizada" valor={fechaHoraDetalle(sus?.actualizadaEn)} />
                  <FilaDetalle etiqueta="Activada por" valor={textoDetalle(sus?.activadaPor)} />
                  <FilaDetalle etiqueta="Activada" valor={fechaHoraDetalle(sus?.activadaEn)} />
                  <FilaDetalle etiqueta="Desactivada por" valor={textoDetalle(sus?.desactivadaPor)} />
                  <FilaDetalle etiqueta="Desactivada" valor={fechaHoraDetalle(sus?.desactivadaEn)} />
                  <FilaDetalle etiqueta="Motivo" valor={textoDetalle(sus?.motivoDesactivacion)} />
                  <FilaDetalle etiqueta="Renovada" valor={fechaHoraDetalle(sus?.renovadaEn)} />
                </GrupoDetalle>

                <GrupoDetalle titulo="Última compra registrada">
                  <FilaDetalle etiqueta="ID compra" valor={textoDetalle(compra?.id)} />
                  <FilaDetalle
                    etiqueta="Estado"
                    valor={compra ? ETIQUETA_ESTADO_COMPRA[compra.estado] : '—'}
                  />
                  <FilaDetalle etiqueta="Plan" valor={textoDetalle(compra?.planNombre)} />
                  <FilaDetalle
                    etiqueta="Precio pagado"
                    valor={compra ? formatearCop(compra.precioCop) : '—'}
                  />
                  <FilaDetalle etiqueta="Periodicidad" valor={textoDetalle(compra?.periodicidad)} />
                  <FilaDetalle etiqueta="Fecha" valor={textoDetalle(compra?.fechaCompra)} />
                  <FilaDetalle etiqueta="Registrada" valor={fechaHoraDetalle(compra?.registradoEn)} />
                  <FilaDetalle
                    etiqueta="Comprador"
                    valor={textoDetalle(compra?.compradorCorreo ?? compra?.compradorUid)}
                  />
                  <FilaDetalle etiqueta="Aprobada por" valor={textoDetalle(compra?.aprobadaPor)} />
                  <FilaDetalle etiqueta="Aprobada" valor={fechaHoraDetalle(compra?.aprobadaEn)} />
                  <FilaDetalle etiqueta="Beneficios" valor={textoDetalle(compra?.beneficios)} />
                </GrupoDetalle>

                <GrupoDetalle titulo={`Historial (${historialOrg.length})`}>
                  {historialOrg.length > 0 ? (
                    historialOrg.map((registro) => (
                      <View key={registro.id} style={styles.detalleHistorialFila}>
                        <Text style={styles.detalleHistorialTitulo}>
                          {ETIQUETA_TIPO_HISTORIAL[registro.tipo]}
                          {registro.estado ? ` · ${registro.estado}` : ''}
                        </Text>
                        <Text style={styles.detalleHistorialTexto}>
                          {textoDetalle(registro.fecha)}
                          {registro.precioCop != null
                            ? ` · ${formatearCop(registro.precioCop)}`
                            : ''}
                          {registro.responsableCorreo ? ` · ${registro.responsableCorreo}` : ''}
                          {registro.motivo ? ` · ${registro.motivo}` : ''}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.detalleVacio}>Sin registros todavía.</Text>
                  )}
                </GrupoDetalle>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function FilaVehiculo({ vehiculo }: { vehiculo: VehiculoAdmin }) {
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const aseguradora = nombreAseguradora(vehiculo);
  const marca = buscarAseguradora(aseguradora);
  const estado = estadoSeguro(vehiculo);
  const colorTipo = coloresTipo(paleta)[vehiculo.tipo];
  const colorEstado =
    estado === 'Vigente' || estado === 'Proximo a vencer' || estado === 'Vencido'
      ? coloresEstado(paleta)[estado]
      : null;

  return (
    <TouchableOpacity
      style={styles.fila}
      activeOpacity={0.85}
      onPress={() =>
        router.push({
          pathname: '/admin/vehiculo',
          params: { uid: vehiculo.propietarioUid, id: vehiculo.id },
        })
      }
    >
      <ImagenVehiculo
        uri={vehiculo.imagen}
        tipo={vehiculo.tipo}
        style={styles.filaImagen}
      />

      <View style={styles.filaCuerpo}>
        <View style={styles.filaTitulo}>
          <Text style={styles.filaNombre} numberOfLines={1}>
            {vehiculo.nombre}
          </Text>

          <View
            style={[
              styles.badge,
              { backgroundColor: colorTipo.fondo, borderColor: colorTipo.borde },
            ]}
          >
            <Text style={[styles.badgeTexto, { color: colorTipo.texto }]}>
              {vehiculo.tipo}
            </Text>
          </View>
        </View>

        <Text style={styles.filaDetalle} numberOfLines={1}>
          {vehiculo.year}
          {vehiculo.placa ? ` • ${vehiculo.placa}` : ''}
          {vehiculo.marca ? ` • ${vehiculo.marca}` : ''}
        </Text>

        <View style={styles.filaSeguro}>
          {aseguradora ? (
            <View
              style={[
                styles.aseguradoraPill,
                { backgroundColor: marca?.color ?? paleta.primario },
              ]}
            >
              <Text
                style={[
                  styles.aseguradoraTexto,
                  { color: marca?.colorTexto ?? paleta.blanco },
                ]}
                numberOfLines={1}
              >
                {aseguradora}
              </Text>
            </View>
          ) : (
            <View style={[styles.aseguradoraPill, styles.sinSeguroPill]}>
              <Text
                style={[styles.aseguradoraTexto, { color: paleta.textoPeligro }]}
              >
                Sin seguro
              </Text>
            </View>
          )}

          {colorEstado && (
            <Text style={[styles.vencimiento, { color: colorEstado.texto }]}>
              {textoVencimiento(vehiculo)}
            </Text>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={paleta.textoSuave} />
    </TouchableOpacity>
  );
}

function PanelAdmin() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [vehiculos, setVehiculos] = useState<VehiculoAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState(FILTRO_TODOS);
  const [tipo, setTipo] = useState<TipoFiltro>('todos');
  const [texto, setTexto] = useState('');

  useEffect(() => {
    return suscribirTodosLosVehiculos(
      (lista) => {
        setVehiculos(lista);
        setError(null);
        setCargando(false);
      },
      (err) => {
        setError(describirErrorFirestore(err));
        setCargando(false);
      }
    );
  }, []);

  const base = useMemo(
    () =>
      tipo === 'todos'
        ? vehiculos
        : vehiculos.filter((vehiculo) => vehiculo.tipo === tipo),
    [vehiculos, tipo]
  );

  const resumen = useMemo(() => resumirVehiculos(base), [base]);
  const aseguradoras = useMemo(() => contarPorAseguradora(base), [base]);

  const lista = useMemo(
    () =>
      filtrarVehiculos(base, filtro, texto).sort((a, b) =>
        a.nombre.localeCompare(b.nombre)
      ),
    [base, filtro, texto]
  );

  const encabezado = (
    <View>
      <LinearGradient
        colors={Gradientes.marca}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 20 }]}
      >
        <View style={styles.heroFila}>
          <View style={styles.heroTextos}>
            <Text style={styles.heroEtiqueta}>ADMINISTRADOR</Text>
            <Text style={styles.heroTitulo}>Vehículos afiliados</Text>
            <Text style={styles.heroSubtitulo} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>

          <View style={styles.heroIcono}>
            <Ionicons name="shield-checkmark" size={26} color={paleta.tinta} />
          </View>
        </View>
      </LinearGradient>

      <View style={styles.estadisticas}>
        <Estadistica
          valor={resumen.total}
          etiqueta="Vehículos"
          icono="car-sport"
          color={paleta.primario}
        />
        <Estadistica
          valor={resumen.conSeguro}
          etiqueta="Asegurados"
          icono="shield-checkmark"
          color={paleta.exito}
        />
        <Estadistica
          valor={resumen.sinSeguro}
          etiqueta="Sin seguro"
          icono="shield-outline"
          color={paleta.peligro}
        />
        <Estadistica
          valor={resumen.porRenovar}
          etiqueta="Por renovar"
          icono="time"
          color={paleta.advertencia}
        />
      </View>

      <NotificacionesCompras />

      <View style={styles.buscador}>
        <Ionicons name="search" size={18} color={paleta.textoSuave} />
        <TextInput
          style={styles.buscadorInput}
          placeholder="Buscar por placa, marca o póliza"
          placeholderTextColor={paleta.textoSuave}
          value={texto}
          onChangeText={setTexto}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.segmentos}>
        {TIPOS.map((item) => (
          <Pressable
            key={item.clave}
            onPress={() => setTipo(item.clave)}
            style={[styles.segmento, tipo === item.clave && styles.segmentoActivo]}
          >
            <Text
              style={[
                styles.segmentoTexto,
                tipo === item.clave && styles.segmentoTextoActivo,
              ]}
            >
              {item.texto}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <Chip
          texto={`Todos (${base.length})`}
          activo={filtro === FILTRO_TODOS}
          onPress={() => setFiltro(FILTRO_TODOS)}
        />
        <Chip
          texto={`Sin seguro (${resumen.sinSeguro})`}
          activo={filtro === FILTRO_SIN_SEGURO}
          onPress={() => setFiltro(FILTRO_SIN_SEGURO)}
        />
        <Chip
          texto={`Por renovar (${resumen.porRenovar})`}
          activo={filtro === FILTRO_POR_RENOVAR}
          onPress={() => setFiltro(FILTRO_POR_RENOVAR)}
        />
        {aseguradoras.map((item) => (
          <Chip
            key={item.nombre}
            texto={`${item.nombre} (${item.cantidad})`}
            activo={filtro === `${PREFIJO_ASEGURADORA}${item.nombre}`}
            onPress={() => setFiltro(`${PREFIJO_ASEGURADORA}${item.nombre}`)}
          />
        ))}
      </ScrollView>

      <Text style={styles.contador}>
        {lista.length} {lista.length === 1 ? 'resultado' : 'resultados'}
      </Text>

      {cargando && (
        <ActivityIndicator
          size="large"
          color={paleta.primario}
          style={styles.cargando}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );

  return (
    <FlatList
      style={styles.pantalla}
      data={lista}
      keyExtractor={(item) => `${item.propietarioUid}-${item.id}`}
      renderItem={({ item }) => <FilaVehiculo vehiculo={item} />}
      ListHeaderComponent={encabezado}
      ListEmptyComponent={
        !cargando && !error ? (
          <Text style={styles.vacio}>No hay vehículos con este filtro.</Text>
        ) : undefined
      }
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={12}
      windowSize={8}
    />
  );
}

export default function PanelRoute() {
  const { esAdmin } = useAuth();

  if (!esAdmin) {
    return <Redirect href="/" />;
  }

  return <PanelAdmin />;
}

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: Paleta.fondo },
  contenido: { paddingBottom: 30 },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 56,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  heroFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroTextos: { flex: 1 },
  heroEtiqueta: {
    color: Paleta.acento,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  heroTitulo: { color: Paleta.blanco, fontSize: 26, fontWeight: '900', marginTop: 4 },
  heroSubtitulo: { color: Paleta.blanco, fontSize: 13, marginTop: 2 },
  heroIcono: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: Paleta.acento,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estadisticas: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: -34,
  },
  estadistica: {
    flex: 1,
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.suave,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  estadisticaValor: { fontSize: 20, fontWeight: '900', color: Paleta.texto },
  estadisticaEtiqueta: {
    fontSize: 10,
    fontWeight: '700',
    color: Paleta.textoSecundario,
  },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Paleta.tarjeta,
    borderWidth: 1,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 14,
    height: 48,
  },
  buscadorInput: { flex: 1, fontSize: 14, color: Paleta.texto, padding: 0 },
  segmentos: {
    flexDirection: 'row',
    backgroundColor: Paleta.fondoAlterno,
    borderRadius: Radios.suave,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
  },
  segmento: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  segmentoActivo: { backgroundColor: Paleta.tinta },
  segmentoTexto: { fontSize: 13, fontWeight: '800', color: Paleta.textoSecundario },
  segmentoTextoActivo: { color: Paleta.acento },
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radios.pastilla,
    backgroundColor: Paleta.tarjeta,
    borderWidth: 1.5,
    borderColor: Paleta.borde,
  },
  chipActivo: { backgroundColor: Paleta.primario, borderColor: Paleta.bordeDuro },
  chipTexto: { fontSize: 12, fontWeight: '800', color: Paleta.textoSecundario },
  chipTextoActivo: { color: Paleta.blanco },

  /* Notificaciones de compras del súper administrador */
  notificaciones: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 16,
    gap: 10,
    ...Sombras.suave,
  },
  notificacionesCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notificacionesTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notificacionesEtiqueta: {
    fontSize: 14,
    fontWeight: '900',
    color: Paleta.texto,
    flexShrink: 1,
  },
  badgeNoLeidas: {
    minWidth: 22,
    borderRadius: Radios.pastilla,
    backgroundColor: Paleta.peligro,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  badgeNoLeidasTexto: { fontSize: 11, fontWeight: '900', color: Paleta.blanco },
  marcarTodas: { fontSize: 11, fontWeight: '800', color: Paleta.primario },
  notificacionesTabs: {
    flexDirection: 'row',
    backgroundColor: Paleta.fondoAlterno,
    borderRadius: Radios.suave,
    padding: 3,
    gap: 4,
  },
  notificacionTab: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  notificacionTabActiva: { backgroundColor: Paleta.tinta },
  notificacionTabTexto: { fontSize: 12, fontWeight: '800', color: Paleta.textoSecundario },
  notificacionTabTextoActivo: { color: Paleta.acento },
  notificacionesVacio: { fontSize: 12, color: Paleta.textoSuave, paddingVertical: 6 },
  notificacionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Paleta.borde,
    paddingTop: 8,
  },
  notificacionFilaNueva: { borderLeftWidth: 3, borderLeftColor: Paleta.primario, paddingLeft: 8 },
  notificacionCuerpo: { flex: 1, gap: 2 },
  notificacionOrg: { fontSize: 13.5, fontWeight: '900', color: Paleta.texto },
  notificacionDetalle: { fontSize: 12, color: Paleta.textoSecundario },
  notificacionFecha: { fontSize: 11, color: Paleta.textoSuave },
  notificacionAcciones: { flexDirection: 'row', gap: 4 },
  notificacionBoton: {
    width: 34,
    height: 34,
    borderRadius: Radios.suave,
    borderWidth: 1,
    borderColor: Paleta.borde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contador: {
    marginHorizontal: 20,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: Paleta.textoSuave,
  },
  cargando: { marginVertical: 24 },
  error: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: Radios.suave,
    backgroundColor: Paleta.peligroFondo,
    color: Paleta.textoPeligro,
    fontSize: 13,
  },
  vacio: {
    textAlign: 'center',
    color: Paleta.textoSecundario,
    marginTop: 30,
    fontSize: 14,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    ...Sombras.suave,
  },
  filaImagen: { width: 68, height: 68, borderRadius: 14 },
  filaCuerpo: { flex: 1, gap: 4 },
  filaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filaNombre: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: Paleta.texto },
  badge: {
    borderWidth: 1,
    borderRadius: Radios.pastilla,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeTexto: { fontSize: 10, fontWeight: '800' },
  filaDetalle: { fontSize: 12, color: Paleta.textoSecundario },
  filaSeguro: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  aseguradoraPill: {
    borderRadius: Radios.pastilla,
    paddingHorizontal: 10,
    paddingVertical: 3,
    maxWidth: 150,
  },
  sinSeguroPill: { backgroundColor: Paleta.peligroFondo },
  aseguradoraTexto: { fontSize: 11, fontWeight: '800' },
  vencimiento: { fontSize: 11, fontWeight: '700' },

  /* Suscripciones de aseguradoras (sección inferior) */
  suscripciones: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 20,
    gap: 10,
    ...Sombras.suave,
  },
  suscripcionesCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  suscripcionesContador: {
    fontSize: 11,
    fontWeight: '900',
    color: Paleta.primario,
  },
  suscripcionesAyuda: {
    fontSize: 11,
    color: Paleta.textoSuave,
    lineHeight: 16,
  },
  suscripcionesAcciones: { flexDirection: 'row', gap: 8 },
  suscripcionesBoton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: Radios.suave,
    paddingVertical: 8,
  },
  suscripcionesBotonTexto: { fontSize: 11, fontWeight: '800' },
  motivoCaja: {
    backgroundColor: Paleta.fondoAlterno,
    borderRadius: Radios.suave,
    padding: 10,
    gap: 8,
  },
  motivoEtiqueta: { fontSize: 12, fontWeight: '800', color: Paleta.texto },
  motivoInput: {
    backgroundColor: Paleta.tarjeta,
    borderWidth: 1,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    paddingHorizontal: 10,
    minHeight: 40,
    fontSize: 13,
    color: Paleta.texto,
  },
  motivoAcciones: { flexDirection: 'row', gap: 8 },
  motivoBoton: {
    flex: 1,
    borderRadius: Radios.suave,
    paddingVertical: 9,
    alignItems: 'center',
  },
  motivoBotonTexto: { fontSize: 12, fontWeight: '800' },
  suscripcionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Paleta.borde,
    paddingTop: 10,
  },
  suscripcionCuerpo: { flex: 1, gap: 2 },
  suscripcionNombre: { fontSize: 13.5, fontWeight: '900', color: Paleta.texto },
  suscripcionDetalle: { fontSize: 11.5, color: Paleta.textoSecundario },
  suscripcionPago: { fontSize: 11, fontWeight: '700' },
  suscripcionAcciones: { flexDirection: 'row', gap: 6 },
  suscripcionIcono: {
    width: 34,
    height: 34,
    borderRadius: Radios.suave,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Detalle completo (pestaña Suscripciones) */
  suscripcionContenedor: { gap: 8 },
  detalleTarjeta: {
    backgroundColor: Paleta.fondoAlterno,
    borderRadius: Radios.tarjeta,
    borderWidth: 1,
    borderColor: Paleta.borde,
    padding: 12,
    gap: 10,
  },
  detalleCuerpo: { gap: 10 },
  detalleGrupo: { gap: 4 },
  detalleGrupoTitulo: {
    fontSize: 12,
    fontWeight: '900',
    color: Paleta.primario,
    marginTop: 4,
  },
  detalleFila: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  detalleEtiqueta: {
    width: 132,
    fontSize: 11,
    fontWeight: '800',
    color: Paleta.textoSuave,
  },
  detalleValor: { flex: 1, fontSize: 11.5, color: Paleta.texto },
  detalleHistorialFila: {
    borderTopWidth: 1,
    borderTopColor: Paleta.borde,
    paddingTop: 6,
    gap: 2,
  },
  detalleHistorialTitulo: { fontSize: 11.5, fontWeight: '900', color: Paleta.texto },
  detalleHistorialTexto: { fontSize: 11, color: Paleta.textoSecundario },
  detalleVacio: { fontSize: 11, color: Paleta.textoSuave },
});

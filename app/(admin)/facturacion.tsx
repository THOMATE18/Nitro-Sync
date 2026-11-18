/*
=======================================================
NITRO SYNC - PANEL DE PLATAFORMA · FACTURACIÓN
=======================================================

Panel del súper administrador alrededor del ÚNICO plan
SÚPER EMPRESARIAL:

  COMPRAS        -> compras simuladas pendientes de respuesta.
  CONFIGURACIÓN  -> precio central y su historial de cambios.
  HISTORIAL      -> todas las operaciones de suscripción.
  PAGOS          -> bloque heredado de pagos registrados a mano.

No existen planes múltiples ni solicitudes de cambio de plan.
Aprobar una compra activa 30 días y NO realiza ningún cobro.
=======================================================
*/

import { useEffect, useMemo, useState } from 'react';

import {
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
import { useLocalSearchParams } from 'expo-router';

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta, useConfirm } from '@/components/ui/confirm-dialog';

import {
  ID_CONFIGURACION_SUSCRIPCION,
  PLAN_SUPER_EMPRESARIAL,
} from '@/data/planSuscripcion';

import {
  configuracionPorDefecto,
  guardarPrecioSuscripcion,
  suscribirConfiguracionSuscripcion,
  suscribirHistorialPreciosSuscripcion,
} from '@/services/configuracionSuscripcion';
import {
  responderCompraSuscripcion,
  suscribirComprasSuscripcion,
} from '@/services/comprasSuscripcion';
import {
  filtrarHistorialSuscripciones,
  suscribirHistorialSuscripciones,
} from '@/services/historialSuscripciones';
import { suscribirOrganizaciones } from '@/services/organizaciones';
import {
  formatearCop,
  marcarPagoPagado,
  suscribirTodosPagos,
} from '@/services/facturacion';
import { registrarAuditoria } from '@/services/auditoria';

import {
  CLAVE_COLOR_ESTADO_SUSCRIPCION,
  ETIQUETA_ESTADO_COMPRA,
  ETIQUETA_ESTADO_SUSCRIPCION,
  ETIQUETA_SIMULADO,
  ETIQUETA_TIPO_HISTORIAL,
  type CompraSuscripcion,
  type EstadoCompraSuscripcion,
  type EstadoSuscripcion,
  type HistorialPrecioSuscripcion,
  type HistorialSuscripcion,
  type Organizacion,
  type Pago,
  type TipoHistorialSuscripcion,
} from '@/types/negocio';

type Seccion = 'compras' | 'configuracion' | 'historial' | 'pagos';

const SECCIONES: { id: Seccion; etiqueta: string; icono: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'compras', etiqueta: 'Compras', icono: 'cart-outline' },
  { id: 'configuracion', etiqueta: 'Configuración', icono: 'settings-outline' },
  { id: 'historial', etiqueta: 'Historial', icono: 'time-outline' },
  { id: 'pagos', etiqueta: 'Pagos', icono: 'cash-outline' },
];

const TIPOS_HISTORIAL = Object.keys(ETIQUETA_TIPO_HISTORIAL) as TipoHistorialSuscripcion[];

/* El historial mezcla estados de suscripción y de compra. */
const ESTADOS_HISTORIAL: string[] = [
  ...Object.keys(ETIQUETA_ESTADO_SUSCRIPCION),
  'aprobada',
  'rechazada',
];

function fechaHora(valor: number): string {
  if (!valor) return '—';

  return new Date(valor).toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function etiquetaEstado(valor: string | null): string {
  if (!valor) return '—';

  return (
    ETIQUETA_ESTADO_SUSCRIPCION[valor as EstadoSuscripcion] ?? valor.toUpperCase()
  );
}

/** Clave de la paleta vigente: funciona igual en claro y en oscuro. */
function claveColorEstado(valor: string | null): keyof TipoPaleta {
  if (valor === 'aprobada') return 'exito';
  if (valor === 'rechazada') return 'peligro';

  return (CLAVE_COLOR_ESTADO_SUSCRIPCION[valor as EstadoSuscripcion] ??
    'textoSuave') as keyof TipoPaleta;
}

function claveColorCompra(estado: EstadoCompraSuscripcion): keyof TipoPaleta {
  if (estado === 'aprobada') return 'exito';
  if (estado === 'rechazada') return 'peligro';

  return 'advertencia';
}

export default function FacturacionAdmin() {
  const { user } = useAuth();
  const alerta = useAlerta();
  const confirmar = useConfirm();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const { compraId } = useLocalSearchParams<{ compraId?: string }>();

  const [seccion, setSeccion] = useState<Seccion>('compras');

  const [compras, setCompras] = useState<CompraSuscripcion[]>([]);
  const [configuracion, setConfiguracion] = useState(configuracionPorDefecto());
  const [historialPrecios, setHistorialPrecios] = useState<HistorialPrecioSuscripcion[]>([]);
  const [historial, setHistorial] = useState<HistorialSuscripcion[]>([]);
  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);

  const [precioTexto, setPrecioTexto] = useState(
    String(PLAN_SUPER_EMPRESARIAL.precioInicialCop)
  );
  const [guardando, setGuardando] = useState(false);

  /* Filtros del historial (siempre en cliente: sin índices nuevos). */
  const [textoHistorial, setTextoHistorial] = useState('');
  const [estadoHistorial, setEstadoHistorial] = useState<string | null>(null);
  const [tipoHistorial, setTipoHistorial] = useState<TipoHistorialSuscripcion | null>(null);
  const [desdeHistorial, setDesdeHistorial] = useState('');
  const [hastaHistorial, setHastaHistorial] = useState('');

  useEffect(() => {
    const pararCompras = suscribirComprasSuscripcion(setCompras);
    /* El campo de precio sigue al precio central cuando otro admin lo cambia. */
    const pararConfiguracion = suscribirConfiguracionSuscripcion((config) => {
      setConfiguracion(config);
      setPrecioTexto(String(config.precioCop));
    });
    const pararPrecios = suscribirHistorialPreciosSuscripcion(setHistorialPrecios);
    const pararHistorial = suscribirHistorialSuscripciones(setHistorial);
    const pararOrganizaciones = suscribirOrganizaciones(setOrganizaciones);
    const pararPagos = suscribirTodosPagos(setPagos);

    return () => {
      pararCompras();
      pararConfiguracion();
      pararPrecios();
      pararHistorial();
      pararOrganizaciones();
      pararPagos();
    };
  }, []);

  const comprasPendientes = useMemo(
    () => compras.filter((compra) => compra.estado === 'pendiente'),
    [compras]
  );

  const nombreOrg = (orgId: string) =>
    organizaciones.find((org) => org.id === orgId)?.nombre ?? orgId;

  const responder = async (compra: CompraSuscripcion, aprobar: boolean) => {
    if (!user) return;

    const ok = await confirmar({
      titulo: aprobar ? 'Aprobar compra' : 'Rechazar compra',
      mensaje: aprobar
        ? `¿Aprobar la compra de ${compra.orgNombre} por ${formatearCop(compra.precioCop)}? El plan ${PLAN_SUPER_EMPRESARIAL.nombre} quedará activo 30 días. No se realiza ningún cobro (${ETIQUETA_SIMULADO}).`
        : `¿Rechazar la compra de ${compra.orgNombre}? La aseguradora verá el resultado en su panel.`,
      textoConfirmar: aprobar ? 'Aprobar' : 'Rechazar',
      icono: aprobar ? 'checkmark-circle-outline' : 'close-circle-outline',
      peligro: !aprobar,
    });

    if (!ok) return;

    try {
      setGuardando(true);

      const resultado = await responderCompraSuscripcion(compra, aprobar, {
        uid: user.uid,
        correo: user.email,
      });

      await alerta({
        titulo: aprobar ? 'Compra aprobada' : 'Compra rechazada',
        mensaje: aprobar
          ? `Suscripción activa hasta ${resultado.vencimiento ?? '—'}. No se cobró ningún dinero.`
          : 'La compra quedó registrada como rechazada.',
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo responder',
        mensaje: 'Revisa tu conexión e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  const guardarPrecio = async () => {
    if (!user) return;

    const precioCop = Number(precioTexto.replace(/[^\d]/g, ''));

    if (!Number.isFinite(precioCop) || precioCop <= 0) {
      await alerta({
        titulo: 'Precio no válido',
        mensaje: 'Escribe un valor mensual mayor a cero en pesos colombianos.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      await guardarPrecioSuscripcion(precioCop, {
        uid: user.uid,
        correo: user.email,
      });

      await registrarAuditoria({
        actorUid: user.uid,
        actorCorreo: user.email,
        actorRol: 'super_admin',
        accion: 'configuracionSuscripcion.precio.guardar',
        entidad: 'configuracionSuscripcion',
        entidadId: ID_CONFIGURACION_SUSCRIPCION,
        detalle: { precioCop, planId: PLAN_SUPER_EMPRESARIAL.id, simulado: true },
      });

      await alerta({
        titulo: 'Precio central actualizado',
        mensaje: `${formatearCop(precioCop)} por mes. Las compras nuevas usarán este precio; las aprobadas conservan el precio congelado.`,
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo guardar',
        mensaje: 'Revisa tu conexión e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  const cobrar = async (pago: Pago) => {
    if (!user) return;

    const ok = await confirmar({
      titulo: 'Marcar pago como pagado',
      mensaje: `¿Confirmar el pago de ${formatearCop(pago.montoCop)} (${pago.periodo}) de ${nombreOrg(pago.orgId)}? Es un registro manual simulado.`,
      textoConfirmar: 'Confirmar pago',
      icono: 'cash-outline',
    });

    if (!ok) return;

    try {
      await marcarPagoPagado(pago.id);

      await registrarAuditoria({
        actorUid: user.uid,
        actorCorreo: user.email,
        actorRol: 'super_admin',
        orgId: pago.orgId,
        accion: 'pago.pagado',
        entidad: 'payments',
        entidadId: pago.id,
        detalle: { montoCop: pago.montoCop, simulado: true },
      });
    } catch {
      await alerta({
        titulo: 'No se pudo marcar',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    }
  };

  const historialFiltrado = useMemo(() => {
    const base = filtrarHistorialSuscripciones(historial, {
      estado: estadoHistorial,
      tipo: tipoHistorial,
      desde: desdeHistorial || null,
      hasta: hastaHistorial || null,
    });

    const texto = textoHistorial.trim().toLowerCase();
    if (!texto) return base;

    return base.filter((registro) => {
      const nombre = (registro.orgNombre ?? '').toLowerCase();
      const id = registro.orgId.toLowerCase();

      return nombre.includes(texto) || id.includes(texto);
    });
  }, [historial, textoHistorial, estadoHistorial, tipoHistorial, desdeHistorial, hastaHistorial]);

  const renderCompras = () => (
    <>
      <View style={styles.resumen}>
        <Ionicons name="cart-outline" size={16} color={paleta.primario} />
        <Text style={styles.resumenTexto}>
          {PLAN_SUPER_EMPRESARIAL.nombre} · {comprasPendientes.length} compra(s) pendiente(s)
        </Text>
      </View>

      {compraId ? (
        <View style={styles.resumen}>
          <Ionicons name="notifications" size={16} color={paleta.primario} />
          <Text style={styles.resumenTexto}>
            Compra señalada desde una notificación: {compraId}
          </Text>
        </View>
      ) : null}

      <View style={styles.lista}>
        {compras.length === 0 ? (
          <Text style={styles.vacio}>Todavía no hay compras registradas.</Text>
        ) : (
          compras.map((compra) => {
            const color = paleta[claveColorCompra(compra.estado)];
            const pendiente = compra.estado === 'pendiente';

            return (
              <View
                key={compra.id}
                style={[
                  styles.tarjeta,
                  compra.id === compraId && styles.tarjetaSenalada,
                ]}
              >
                <View style={styles.tarjetaCabecera}>
                  <Text style={styles.tarjetaTitulo} numberOfLines={2}>
                    {compra.orgNombre || nombreOrg(compra.orgId)}
                  </Text>
                  <View style={[styles.estado, { borderColor: color }]}>
                    <Text style={[styles.estadoTexto, { color }]}>
                      {ETIQUETA_ESTADO_COMPRA[compra.estado]}
                    </Text>
                  </View>
                </View>

                <Text style={styles.tarjetaLinea}>ID de compra: {compra.id}</Text>
                <Text style={styles.tarjetaLinea}>
                  Plan: {compra.planNombre || PLAN_SUPER_EMPRESARIAL.nombre}
                </Text>
                <Text style={styles.tarjetaPrima}>
                  Precio congelado: {formatearCop(compra.precioCop)} / mes
                </Text>
                <Text style={styles.tarjetaLinea}>Fecha: {compra.fechaCompra}</Text>
                <Text style={styles.tarjetaLinea}>
                  Registrada: {fechaHora(compra.registradoEn)}
                </Text>
                <Text style={styles.tarjetaLinea}>
                  Comprador: {compra.compradorCorreo ?? 'Sin correo'}
                </Text>

                {pendiente ? (
                  <View style={styles.accionesFila}>
                    <Pressable
                      style={[styles.accion, { borderColor: paleta.exito }]}
                      onPress={() => responder(compra, true)}
                      disabled={guardando}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={16}
                        color={paleta.exito}
                      />
                      <Text style={[styles.accionTexto, { color: paleta.exito }]}>
                        Aprobar
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[styles.accion, { borderColor: paleta.peligro }]}
                      onPress={() => responder(compra, false)}
                      disabled={guardando}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={16}
                        color={paleta.peligro}
                      />
                      <Text style={[styles.accionTexto, { color: paleta.peligro }]}>
                        Rechazar
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.ayuda}>
                    Respondida por {compra.aprobadaPor || '—'} el{' '}
                    {fechaHora(compra.aprobadaEn ?? 0)}. No se hizo ningún cobro.
                  </Text>
                )}
              </View>
            );
          })
        )}
      </View>
    </>
  );

  const renderConfiguracion = () => (
    <>
      <View style={styles.formulario}>
        <Text style={styles.formTitulo}>CONFIGURACIÓN CENTRAL · PLAN ÚNICO</Text>
        <Text style={styles.ayuda}>
          Este es el único plan de la plataforma. El precio se aplica a TODAS las
          aseguradoras y es mensual; cambiarlo no altera las compras ya aprobadas.
        </Text>

        <Text style={styles.etiqueta}>Plan</Text>
        <Text style={styles.destacado}>{PLAN_SUPER_EMPRESARIAL.nombre}</Text>

        <Text style={styles.etiqueta}>Descripción</Text>
        <Text style={styles.texto}>{configuracion.descripcion}</Text>

        <Text style={styles.etiqueta}>Beneficios</Text>
        {configuracion.beneficios.map((beneficio) => (
          <View key={beneficio} style={styles.beneficioFila}>
            <Ionicons name="checkmark-circle" size={15} color={paleta.exito} />
            <Text style={styles.texto}>{beneficio}</Text>
          </View>
        ))}

        <View style={styles.precioActual}>
          <Ionicons name="pricetag-outline" size={18} color={paleta.primario} />
          <Text style={styles.precioActualTexto}>
            Precio vigente: {formatearCop(configuracion.precioCop)} / mes
          </Text>
        </View>

        <Text style={styles.etiqueta}>Nuevo precio mensual (COP)</Text>
        <TextInput
          style={styles.input}
          value={precioTexto}
          onChangeText={setPrecioTexto}
          placeholder={String(PLAN_SUPER_EMPRESARIAL.precioInicialCop)}
          placeholderTextColor={paleta.textoSuave}
          keyboardType="numeric"
          returnKeyType="done"
        />

        <BotonNitro
          titulo="Guardar precio"
          icono="save-outline"
          onPress={guardarPrecio}
          cargando={guardando}
          style={styles.botonForm}
        />

        {configuracion.actualizadaEn > 0 ? (
          <Text style={styles.ayuda}>
            Último cambio: {fechaHora(configuracion.actualizadaEn)} ·{' '}
            {configuracion.actualizadoPorCorreo ?? configuracion.actualizadaPor}
          </Text>
        ) : null}
      </View>

      <View style={styles.formulario}>
        <Text style={styles.formTitulo}>Historial de cambios de precio</Text>
        {historialPrecios.length === 0 ? (
          <Text style={styles.vacio}>Todavía no hay cambios de precio.</Text>
        ) : (
          historialPrecios.map((cambio) => (
            <View key={cambio.id} style={styles.cambioFila}>
              <View style={styles.cambioCabecera}>
                <Text style={styles.cambioAnterior}>
                  {formatearCop(cambio.precioAnteriorCop)}
                </Text>
                <Ionicons name="arrow-forward" size={15} color={paleta.textoSuave} />
                <Text style={styles.cambioNuevo}>
                  {formatearCop(cambio.precioCop)}
                </Text>
              </View>
              <Text style={styles.tarjetaLinea}>Mensual · CONFIGURACIÓN CENTRAL</Text>
              <Text style={styles.tarjetaLinea}>
                Responsable: {cambio.cambiadoCorreo ?? cambio.cambiadoPor}
              </Text>
              <Text style={styles.tarjetaLinea}>Fecha: {fechaHora(cambio.creadoEn)}</Text>
            </View>
          ))
        )}
      </View>
    </>
  );

  const renderHistorial = () => (
    <>
      <View style={styles.formulario}>
        <Text style={styles.formTitulo}>Historial de suscripciones</Text>
        <Text style={styles.ayuda}>
          Todas las operaciones son simuladas ({ETIQUETA_SIMULADO}). Los filtros se
          aplican sobre los datos en tiempo real, sin consultas nuevas.
        </Text>

        <Text style={styles.etiqueta}>Aseguradora (nombre o id)</Text>
        <TextInput
          style={styles.input}
          value={textoHistorial}
          onChangeText={setTextoHistorial}
          placeholder="Ej. Seguros del Río"
          placeholderTextColor={paleta.textoSuave}
        />

        <Text style={styles.etiqueta}>Estado</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chips}>
            <Pressable
              style={[styles.chip, !estadoHistorial && styles.chipActivo]}
              onPress={() => setEstadoHistorial(null)}
            >
              <Text
                style={[styles.chipTexto, !estadoHistorial && styles.chipTextoActivo]}
              >
                Todos
              </Text>
            </Pressable>
            {ESTADOS_HISTORIAL.map((estado) => (
              <Pressable
                key={estado}
                style={[styles.chip, estadoHistorial === estado && styles.chipActivo]}
                onPress={() => setEstadoHistorial(estado)}
              >
                <Text
                  style={[
                    styles.chipTexto,
                    estadoHistorial === estado && styles.chipTextoActivo,
                  ]}
                >
                  {etiquetaEstado(estado)}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <Text style={styles.etiqueta}>Tipo de operación</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chips}>
            <Pressable
              style={[styles.chip, !tipoHistorial && styles.chipActivo]}
              onPress={() => setTipoHistorial(null)}
            >
              <Text style={[styles.chipTexto, !tipoHistorial && styles.chipTextoActivo]}>
                Todos
              </Text>
            </Pressable>
            {TIPOS_HISTORIAL.map((tipo) => (
              <Pressable
                key={tipo}
                style={[styles.chip, tipoHistorial === tipo && styles.chipActivo]}
                onPress={() => setTipoHistorial(tipo)}
              >
                <Text
                  style={[styles.chipTexto, tipoHistorial === tipo && styles.chipTextoActivo]}
                >
                  {ETIQUETA_TIPO_HISTORIAL[tipo]}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <Text style={styles.etiqueta}>Rango de fechas (AAAA-MM-DD)</Text>
        <View style={styles.fechaFila}>
          <View style={styles.fechaCampo}>
            <TextInput
              style={styles.inputPequeno}
              value={desdeHistorial}
              onChangeText={setDesdeHistorial}
              placeholder="Desde"
              placeholderTextColor={paleta.textoSuave}
            />
          </View>
          <View style={styles.fechaCampo}>
            <TextInput
              style={styles.inputPequeno}
              value={hastaHistorial}
              onChangeText={setHastaHistorial}
              placeholder="Hasta"
              placeholderTextColor={paleta.textoSuave}
            />
          </View>
        </View>
      </View>

      <View style={styles.lista}>
        {historialFiltrado.length === 0 ? (
          <Text style={styles.vacio}>No hay registros con estos filtros.</Text>
        ) : (
          historialFiltrado.map((registro) => {
            const color = paleta[claveColorEstado(registro.estado)];

            return (
              <View key={registro.id} style={styles.tarjeta}>
                <View style={styles.tarjetaCabecera}>
                  <Text style={styles.tarjetaTitulo} numberOfLines={2}>
                    {registro.orgNombre || registro.orgId}
                  </Text>
                  <View style={[styles.estado, { borderColor: color }]}>
                    <Text style={[styles.estadoTexto, { color }]}>
                      {etiquetaEstado(registro.estado)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.tarjetaLinea}>
                  Tipo:{' '}
                  {ETIQUETA_TIPO_HISTORIAL[registro.tipo] ?? registro.tipo}
                </Text>
                <Text style={styles.tarjetaLinea}>
                  Precio: {formatearCop(registro.precioCop)}
                </Text>
                <Text style={styles.tarjetaLinea}>
                  Responsable:{' '}
                  {registro.responsableCorreo ?? registro.responsableUid}
                </Text>
                <Text style={styles.tarjetaLinea}>
                  Fecha: {registro.fecha.slice(0, 10)}
                </Text>
                {registro.motivo ? (
                  <Text style={styles.ayuda}>Motivo: {registro.motivo}</Text>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </>
  );

  const renderPagos = () => (
    <>
      <View style={styles.formulario}>
        <Text style={styles.formTitulo}>Pagos registrados a mano</Text>
        <Text style={styles.ayuda}>
          Bloque heredado: solo consulta y marca como pagados los pagos manuales
          antiguos. Las compras del plan único se gestionan en la pestaña Compras y
          no generan cobros reales ({ETIQUETA_SIMULADO}).
        </Text>
      </View>

      <View style={styles.lista}>
        {pagos.length === 0 ? (
          <Text style={styles.vacio}>No hay pagos manuales registrados.</Text>
        ) : (
          pagos.map((pago) => {
            const pagado = pago.estado === 'pagado';
            const color = pagado ? paleta.exito : paleta.advertencia;

            return (
              <View key={pago.id} style={styles.tarjeta}>
                <View style={styles.tarjetaCabecera}>
                  <Text style={styles.tarjetaTitulo}>
                    {nombreOrg(pago.orgId)}
                  </Text>
                  <View style={[styles.estado, { borderColor: color }]}>
                    <Text style={[styles.estadoTexto, { color }]}>
                      {pagado ? 'Pagado' : 'Pendiente'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.tarjetaLinea}>Periodo: {pago.periodo}</Text>
                <Text style={styles.tarjetaPrima}>{formatearCop(pago.montoCop)}</Text>
                <Text style={styles.tarjetaLinea}>
                  Registrado por: {pago.registradoPor}
                </Text>

                {pagado ? null : (
                  <Pressable
                    style={[styles.accion, { borderColor: paleta.exito }]}
                    onPress={() => cobrar(pago)}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={16}
                      color={paleta.exito}
                    />
                    <Text style={[styles.accionTexto, { color: paleta.exito }]}>
                      Marcar pagado
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <EncabezadoPanel
          etiqueta="PANEL DE PLATAFORMA"
          titulo="Facturación"
          subtitulo={`${PLAN_SUPER_EMPRESARIAL.nombre} · ${comprasPendientes.length} compra(s) pendiente(s)`}
          icono="cash"
        />

        <View style={styles.badgeSimulado}>
          <Ionicons name="information-circle-outline" size={16} color={paleta.primario} />
          <Text style={styles.badgeTexto}>
            {ETIQUETA_SIMULADO}: no se realizan cobros ni envíos automáticos.
          </Text>
        </View>

        <View style={styles.segmentos}>
          {SECCIONES.map((s) => (
            <Pressable
              key={s.id}
              style={[styles.segmento, seccion === s.id && styles.segmentoActivo]}
              onPress={() => setSeccion(s.id)}
            >
              <Ionicons
                name={s.icono}
                size={15}
                color={seccion === s.id ? paleta.acento : paleta.textoSecundario}
              />
              <Text
                style={[
                  styles.segmentoTexto,
                  seccion === s.id && styles.segmentoTextoActivo,
                ]}
              >
                {s.etiqueta}
              </Text>
            </Pressable>
          ))}
        </View>

        {seccion === 'compras' ? renderCompras() : null}
        {seccion === 'configuracion' ? renderConfiguracion() : null}
        {seccion === 'historial' ? renderHistorial() : null}
        {seccion === 'pagos' ? renderPagos() : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    pantalla: { flex: 1, backgroundColor: Paleta.fondo },
    contenido: { paddingBottom: 44 },
    badgeSimulado: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      backgroundColor: Paleta.primarioClaro,
      borderRadius: Radios.suave,
      padding: 12,
      marginHorizontal: 16,
      marginTop: 14,
    },
    badgeTexto: { flex: 1, fontSize: 12, color: Paleta.texto, lineHeight: 17 },

    segmentos: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      marginTop: 10,
    },
    segmento: {
      flexGrow: 1,
      minWidth: '22%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.suave,
      borderWidth: 2,
      borderColor: Paleta.bordeDuro,
      paddingVertical: 10,
      paddingHorizontal: 6,
    },
    segmentoActivo: { backgroundColor: Paleta.tinta },
    segmentoTexto: { fontSize: 12, fontWeight: '900', color: Paleta.texto },
    segmentoTextoActivo: { color: Paleta.acento },

    resumen: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 16,
    },
    resumenTexto: { flex: 1, fontSize: 12.5, fontWeight: '800', color: Paleta.texto },

    formulario: {
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.tarjeta,
      padding: 18,
      marginHorizontal: 16,
      marginTop: 16,
      gap: 4,
      ...Sombras.suave,
    },
    formTitulo: {
      fontSize: 16,
      fontWeight: '900',
      color: Paleta.texto,
      marginBottom: 6,
    },
    etiqueta: {
      fontSize: 12,
      fontWeight: '800',
      color: Paleta.textoSecundario,
      marginTop: 10,
      marginBottom: 4,
    },
    texto: { fontSize: 13, color: Paleta.textoSecundario, lineHeight: 19 },
    ayuda: { fontSize: 12, color: Paleta.textoSuave, lineHeight: 17, marginTop: 6 },
    destacado: { fontSize: 16, fontWeight: '900', color: Paleta.primario },
    beneficioFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 4 },
    precioActual: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Paleta.primarioClaro,
      borderRadius: Radios.suave,
      padding: 12,
      marginTop: 14,
    },
    precioActualTexto: {
      flex: 1,
      fontSize: 14,
      fontWeight: '900',
      color: Paleta.primarioOscuro,
    },
    input: {
      backgroundColor: Paleta.fondo,
      borderWidth: 1,
      borderColor: Paleta.borde,
      borderRadius: Radios.suave,
      paddingHorizontal: 14,
      height: 48,
      fontSize: 14,
      color: Paleta.texto,
    },
    inputPequeno: {
      flex: 1,
      backgroundColor: Paleta.fondo,
      borderWidth: 1,
      borderColor: Paleta.borde,
      borderRadius: Radios.suave,
      paddingHorizontal: 10,
      height: 44,
      fontSize: 13,
      color: Paleta.texto,
    },
    botonForm: { marginTop: 16 },
    cambioFila: {
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: Paleta.borde,
      gap: 2,
    },
    cambioCabecera: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cambioAnterior: {
      fontSize: 12.5,
      fontWeight: '800',
      color: Paleta.textoSuave,
      textDecorationLine: 'line-through',
    },
    cambioNuevo: { fontSize: 14, fontWeight: '900', color: Paleta.exito },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radios.pastilla,
      borderWidth: 1.5,
      borderColor: Paleta.borde,
      backgroundColor: Paleta.fondo,
    },
    chipActivo: { backgroundColor: Paleta.tinta, borderColor: Paleta.bordeDuro },
    chipTexto: { fontSize: 12, fontWeight: '800', color: Paleta.textoSecundario },
    chipTextoActivo: { fontSize: 12, fontWeight: '800', color: Paleta.acento },
    fechaFila: { flexDirection: 'row', gap: 10 },
    fechaCampo: { flex: 1 },

    lista: { padding: 16, gap: 12 },
    vacio: {
      fontSize: 13,
      color: Paleta.textoSecundario,
      textAlign: 'center',
      marginTop: 24,
    },
    tarjeta: {
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.tarjeta,
      padding: 16,
      gap: 4,
      ...Sombras.suave,
    },
    tarjetaSenalada: {
      borderWidth: 2,
      borderColor: Paleta.primario,
    },
    tarjetaCabecera: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    tarjetaTitulo: {
      fontSize: 14.5,
      fontWeight: '900',
      color: Paleta.texto,
      flexShrink: 1,
    },
    tarjetaLinea: { fontSize: 12.5, color: Paleta.textoSecundario, lineHeight: 18 },
    tarjetaPrima: {
      fontSize: 14,
      fontWeight: '900',
      color: Paleta.texto,
      marginTop: 4,
    },
    estado: {
      borderWidth: 1.5,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    estadoTexto: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
    accionesFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    accion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1.5,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 12,
      paddingVertical: 6,
      alignSelf: 'flex-start',
      marginTop: 8,
    },
    accionTexto: { fontSize: 12, fontWeight: '800' },
  });

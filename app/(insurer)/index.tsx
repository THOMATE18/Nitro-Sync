/*
=======================================================
NITRO SYNC - PANEL ASEGURADORA · INICIO
=======================================================

Resumen de la organización:

  - nombre, estado y datos de contacto.
  - vehículos con su seguro (por `aseguradoraClave`).
  - estado de la suscripción mensual.
  - cierre de sesión.

Los contadores se calculan SOLO sobre los vehículos de la
aseguradora.
=======================================================
*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import BotonNitro from '@/components/ui/boton-nitro';
import Buscador from '@/components/ui/buscador';
import ChipsFiltro from '@/components/aseguradora/chips-filtro';
import TarjetaVehiculoAseguradora from '@/components/aseguradora/tarjeta-vehiculo';
import ModalRenovar from '@/components/aseguradora/modal-renovar';
import { useAlerta, useConfirm } from '@/components/ui/confirm-dialog';
import { buscarAseguradora, claveAseguradora } from '@/data/aseguradoras';
import { ETIQUETA_ESTADO_ORG, ETIQUETA_ESTADO_SUSCRIPCION } from '@/types/negocio';
import { registrarAuditoria } from '@/services/auditoria';
import {
  sincronizarTelefonoAseguradora,
  suscribirVehiculosAseguradora,
} from '@/services/vehiculosAseguradora';
import { actualizarOrganizacion } from '@/services/organizaciones';
import { suscribirPolizasOrg, suscribirOfertasOrg } from '@/services/polizas';
import { suscribirCotizacionesAseguradora } from '@/services/cotizaciones';
import { formatearCop, suscribirSuscripcionOrg } from '@/services/facturacion';
import {
  FILTROS_VEHICULOS_ASEGURADORA,
  contarVehiculosAseguradora,
  filtrarVehiculosAseguradora,
  resumirVehiculosAseguradora,
  type FiltroVehiculosAseguradora,
} from '@/utils/aseguradora';
import {
  esTelefonoValido,
  soloDigitos,
} from '@/utils/contacto';
import {
  clasificarErrorFirestore,
  type ErrorFirestoreClasificado,
} from '@/utils/errorFirestore';
import type { Cotizacion, Oferta, Poliza, Suscripcion } from '@/types/negocio';
import type { VehiculoAdmin } from '@/types/models';

const MAX_PREVIA = 3;

function Metrica({
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
    <View style={styles.metrica}>
      <Ionicons name={icono} size={20} color={color} />
      <Text style={styles.metricaValor}>{valor}</Text>
      <Text style={styles.metricaEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

export default function InicioAseguradora() {
  const { user, orgId, organizacion, logout } = useAuth();
  const confirmar = useConfirm();
  const alerta = useAlerta();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  /*
  Clave automática de la aseguradora: sale del documento de la
  organización y, si por lo que sea viniera vacía, se deriva del
  nombre. Nunca depende de una asignación manual.
  */
  const clave =
    organizacion?.aseguradoraClave || claveAseguradora(organizacion?.nombre ?? '');

  const [vehiculos, setVehiculos] = useState<VehiculoAdmin[]>([]);
  const [polizas, setPolizas] = useState<Poliza[]>([]);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);

  /* Filtros de la lista de vehículos (se combinan con la búsqueda). */
  const [filtro, setFiltro] = useState<FiltroVehiculosAseguradora>('todos');
  const [busqueda, setBusqueda] = useState('');

  /* Teléfono de contacto editable de la organización. */
  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [guardandoTelefono, setGuardandoTelefono] = useState(false);
  const telefonoCargado = useRef(false);

  /* Vehículo cuya renovación está abierta en el modal. */
  const [paraRenovar, setParaRenovar] = useState<VehiculoAdmin | null>(null);

  /*
  Estado de carga explícito: la consulta SIEMPRE termina, así
  que la pantalla nunca se queda "cargando" para siempre. Hay
  cuatro estados visibles: cargando, lista vacía, error de
  permisos y error de red (más un error genérico).
  */
  const [estadoCarga, setEstadoCarga] = useState<'cargando' | 'listo' | 'error'>(
    'cargando'
  );
  const [errorCarga, setErrorCarga] =
    useState<ErrorFirestoreClasificado | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!clave) return;

    return suscribirVehiculosAseguradora(
      clave,
      (lista) => {
        setVehiculos(lista);
        setEstadoCarga('listo');
        setErrorCarga(null);
      },
      (error) => {
        /* El error real de Firestore queda en consola para depurar. */
        console.error(
          '[aseguradora] Error al leer los vehículos por aseguradoraClave:',
          error
        );
        setEstadoCarga('error');
        setErrorCarga(clasificarErrorFirestore(error));
      }
    );
  }, [clave, intento]);

  const reintentar = useCallback(() => {
    setEstadoCarga('cargando');
    setErrorCarga(null);
    setIntento((valor) => valor + 1);
  }, []);

  useEffect(() => {
    if (!orgId) return;

    const pararPolizas = suscribirPolizasOrg(orgId, setPolizas);
    const pararOfertas = suscribirOfertasOrg(orgId, setOfertas);
    const pararSuscripcion = suscribirSuscripcionOrg(orgId, setSuscripcion);

    return () => {
      pararPolizas();
      pararOfertas();
      pararSuscripcion();
    };
  }, [orgId]);

  useEffect(() => {
    if (!clave) return;

    return suscribirCotizacionesAseguradora(clave, setCotizaciones, (error) => {
      /* El error real de Firestore queda en consola para depurar. */
      console.error(
        '[aseguradora] Error al leer las cotizaciones por aseguradoraClave:',
        error
      );
    });
  }, [clave]);

  /*
  Precarga del teléfono de contacto: si la organización todavía
  no tiene uno propio se sugiere el del directorio
  (`data/aseguradoras.ts`). No se guarda solo: la aseguradora
  lo confirma con el botón.
  */
  useEffect(() => {
    if (telefonoCargado.current || !organizacion) return;

    const directorio = buscarAseguradora(organizacion.nombre);

    telefonoCargado.current = true;
    setTelefonoContacto(
      organizacion.telefonoContacto ||
        directorio?.whatsapp ||
        directorio?.telefono ||
        ''
    );
  }, [organizacion]);

  const resumen = useMemo(
    () => resumirVehiculosAseguradora(vehiculos),
    [vehiculos]
  );

  const vigentes = useMemo(
    () => polizas.filter((p) => p.estado === 'vigente').length,
    [polizas]
  );

  const ofertasPendientes = useMemo(
    () => ofertas.filter((o) => o.estado === 'enviada').length,
    [ofertas]
  );

  const contadores = useMemo(
    () => contarVehiculosAseguradora(vehiculos),
    [vehiculos]
  );

  const previaFiltrada = useMemo(
    () => filtrarVehiculosAseguradora(vehiculos, filtro, busqueda),
    [vehiculos, filtro, busqueda]
  );

  const cotizacionesNuevas = useMemo(
    () => cotizaciones.filter((c) => c.estado === 'nueva').length,
    [cotizaciones]
  );

  const previa = previaFiltrada.slice(0, MAX_PREVIA);

  /*
  Estados de pantalla (Fase 4):
    - cargandoOrg  : la organización aún no llega del listener.
    - sinOrganizacion / sinClave : la cuenta no puede operar.
    - errorCarga   : fallo real de la consulta (permisos / red / otro).
  */
  const cargandoOrg = !!orgId && !organizacion;
  const sinOrganizacion = !orgId;
  const sinClave = !!organizacion && !clave;

  const errorMostrar: ErrorFirestoreClasificado | null = sinOrganizacion
    ? {
        tipo: 'permisos',
        titulo: 'Cuenta sin organización',
        mensaje:
          'Tu cuenta no tiene una aseguradora asignada. Vuelve a iniciar sesión; si continúa, contacta al soporte de Nitro Sync.',
      }
    : sinClave
      ? {
          tipo: 'permisos',
          titulo: 'Aseguradora sin identificar',
          mensaje:
            'No pudimos identificar tu aseguradora. Verifica que el nombre de la organización esté completo o contacta al soporte de Nitro Sync.',
        }
      : errorCarga;

  const mostrarError = sinOrganizacion || sinClave || estadoCarga === 'error';

  const mostrarCargando =
    !mostrarError && (cargandoOrg || (estadoCarga === 'cargando' && vehiculos.length === 0));

  const auditar = (accion: string, vehiculo: VehiculoAdmin) => {
    if (!user) return;

    void registrarAuditoria({
      actorUid: user.uid,
      actorCorreo: user.email,
      actorRol: 'insurer_admin',
      orgId,
      accion,
      entidad: 'vehiculos',
      entidadId: vehiculo.id,
      detalle: { placa: vehiculo.placa ?? '', propietarioUid: vehiculo.propietarioUid },
    });
  };

  const cerrarSesion = async () => {
    const ok = await confirmar({
      titulo: 'Cerrar sesión',
      mensaje: '¿Seguro que deseas cerrar la sesión de la aseguradora?',
      textoConfirmar: 'Cerrar sesión',
      icono: 'log-out-outline',
      peligro: true,
    });

    if (ok) await logout();
  };

  /*
  Guarda el teléfono de contacto de la organización y lo copia a
  `telefonoAseguradora` de todos sus vehículos (por lotes). Todo
  queda en auditoría. Es idempotente: repetir no cambia nada si
  ya está al día.
  */
  const guardarTelefono = async () => {
    if (!orgId || !user || !clave) return;

    if (!esTelefonoValido(telefonoContacto)) {
      await alerta({
        titulo: 'Teléfono inválido',
        mensaje:
          'Escribe un teléfono de atención de 7 a 13 dígitos (fijo o celular).',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardandoTelefono(true);

      const telefono = soloDigitos(telefonoContacto);

      await actualizarOrganizacion(orgId, { telefonoContacto: telefono });

      const actualizados = await sincronizarTelefonoAseguradora(
        clave,
        telefono
      );

      await registrarAuditoria({
        actorUid: user.uid,
        actorCorreo: user.email,
        actorRol: 'insurer_admin',
        orgId,
        accion: 'organizacion.telefono',
        entidad: 'organizations',
        entidadId: orgId,
        detalle: { telefono, vehiculos: actualizados },
      });

      await alerta({
        titulo: 'Teléfono actualizado',
        mensaje:
          actualizados > 0
            ? `Se copió a ${actualizados} vehículo(s) de tu aseguradora.`
            : 'Tus vehículos ya tenían ese teléfono.',
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo guardar',
        mensaje: 'Revisa tu conexión e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setGuardandoTelefono(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido}>
      <EncabezadoPanel
        etiqueta="PANEL DE ASEGURADORA"
        titulo={organizacion?.nombre ?? 'Mi aseguradora'}
        subtitulo={user?.email ?? null}
        icono="business"
      />

      <View style={styles.metricas}>
        <Metrica
          valor={resumen.total}
          etiqueta="Vehículos"
          icono="car-sport"
          color={paleta.primario}
        />
        <Metrica
          valor={resumen.vigentes}
          etiqueta="Vigentes"
          icono="shield-checkmark"
          color={paleta.exito}
        />
        <Metrica
          valor={resumen.porRenovar}
          etiqueta="Por renovar"
          icono="time"
          color={paleta.advertencia}
        />
      </View>

      {mostrarCargando ? (
        <View style={styles.estadoCentro}>
          <ActivityIndicator size="large" color={paleta.primario} />
          <Text style={styles.estadoCargaTexto}>Cargando vehículos…</Text>
        </View>
      ) : null}

      {/* Vehículos con tu seguro */}
      <View style={styles.tarjeta}>
        <View style={styles.tarjetaCabecera}>
          <Text style={styles.tarjetaTitulo}>Vehículos con tu seguro</Text>
          <Text style={styles.contador}>{resumen.total}</Text>
        </View>

        <Buscador
          valor={busqueda}
          onCambiar={setBusqueda}
          placeholder="Buscar por placa, marca o póliza"
        />

        <ChipsFiltro
          opciones={FILTROS_VEHICULOS_ASEGURADORA.map((f) => ({
            ...f,
            contador: contadores[f.id],
          }))}
          activo={filtro}
          onCambiar={setFiltro}
        />

        {mostrarError ? (
          <View style={styles.estadoCentro}>
            <Ionicons
              name={
                errorMostrar?.tipo === 'red'
                  ? 'cloud-offline-outline'
                  : errorMostrar?.tipo === 'permisos'
                    ? 'lock-closed-outline'
                    : 'alert-circle-outline'
              }
              size={40}
              color={paleta.peligro}
            />
            <Text style={styles.vacioTitulo}>{errorMostrar?.titulo}</Text>
            <Text style={styles.vacioTexto}>{errorMostrar?.mensaje}</Text>

            {!sinOrganizacion && !sinClave ? (
              <Pressable style={styles.reintentar} onPress={reintentar}>
                <Ionicons name="refresh" size={16} color={paleta.acento} />
                <Text style={styles.reintentarTexto}>Reintentar</Text>
              </Pressable>
            ) : null}
          </View>
        ) : previa.length === 0 ? (
          <View style={styles.estadoCentro}>
            <Ionicons
              name={vehiculos.length === 0 ? 'car-outline' : 'funnel-outline'}
              size={40}
              color={paleta.textoSuave}
            />
            <Text style={styles.vacioTitulo}>
              {vehiculos.length === 0
                ? 'Aún no hay vehículos con tu seguro'
                : 'Sin resultados'}
            </Text>
            <Text style={styles.vacioTexto}>
              {vehiculos.length === 0
                ? 'Cuando un propietario registre un seguro con tu aseguradora, su vehículo aparecerá aquí.'
                : 'Prueba con otro filtro o cambia la búsqueda.'}
            </Text>
          </View>
        ) : (
          <View style={styles.previa}>
            {previa.map((vehiculo) => (
              <TarjetaVehiculoAseguradora
                key={vehiculo.id}
                vehiculo={vehiculo}
                onContactar={(v) => auditar('vehiculo.contactar', v)}
                onLlamar={(v) => auditar('vehiculo.llamar', v)}
                onAbrir={(v) => auditar('vehiculo.abrir', v)}
                onRenovar={(v) => setParaRenovar(v)}
              />
            ))}

            {previaFiltrada.length > MAX_PREVIA ? (
              <Pressable
                style={styles.verTodos}
                onPress={() => router.push('/(insurer)/vinculos')}
              >
                <Text style={styles.verTodosTexto}>
                  Ver los {previaFiltrada.length} vehículos
                </Text>
                <Ionicons name="arrow-forward" size={16} color={paleta.acento} />
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      {/* Estado de la organización */}
      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>Estado de la organización</Text>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Estado</Text>
          <Text style={styles.filaValor}>
            {ETIQUETA_ESTADO_ORG[organizacion?.estado ?? 'pending']}
          </Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Acceso</Text>
          <Text
            style={[
              styles.filaValor,
              {
                color:
                  organizacion?.accesoHabilitado === false
                    ? paleta.peligro
                    : paleta.exito,
              },
            ]}
          >
            {organizacion?.accesoHabilitado === false ? 'Bloqueado' : 'Habilitado'}
          </Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Especialidad</Text>
          <Text style={styles.filaValor} numberOfLines={1}>
            {organizacion?.especialidad ?? '—'}
          </Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>WhatsApp</Text>
          <Text style={styles.filaValor}>{organizacion?.whatsapp ?? '—'}</Text>
        </View>
      </View>

      {/* Datos de contacto */}
      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>Teléfono de atención</Text>
        <Text style={styles.nota}>
          Es la línea que verá el propietario en la ficha del seguro de su
          vehículo. Al guardarla se copia a todos tus vehículos vinculados.
        </Text>

        <TextInput
          style={styles.input}
          value={telefonoContacto}
          onChangeText={setTelefonoContacto}
          placeholder="Ej: 601 437 8888"
          placeholderTextColor={paleta.textoSuave}
          keyboardType="phone-pad"
          maxLength={15}
          accessibilityLabel="Teléfono de atención de la aseguradora"
        />

        <BotonNitro
          titulo="Guardar y actualizar vehículos"
          icono="save-outline"
          variante="oscuro"
          onPress={guardarTelefono}
          cargando={guardandoTelefono}
          deshabilitado={!clave}
        />

        {!clave ? (
          <Text style={styles.nota}>
            No pudimos identificar tu aseguradora; contacta al soporte de Nitro
            Sync para completar la clave.
          </Text>
        ) : null}
      </View>

      {/* Pólizas y ofertas */}
      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>Pólizas y ofertas</Text>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Pólizas vigentes</Text>
          <Text style={styles.filaValor}>{vigentes}</Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Ofertas pendientes</Text>
          <Text style={styles.filaValor}>{ofertasPendientes}</Text>
        </View>
      </View>

      {/* Cotizaciones */}
      <View style={styles.tarjeta}>
        <View style={styles.tarjetaCabecera}>
          <Text style={styles.tarjetaTitulo}>Cotizaciones</Text>
          {cotizacionesNuevas > 0 ? (
            <Text style={styles.contador}>{cotizacionesNuevas}</Text>
          ) : null}
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Solicitudes nuevas</Text>
          <Text
            style={[
              styles.filaValor,
              { color: cotizacionesNuevas > 0 ? paleta.advertencia : paleta.texto },
            ]}
          >
            {cotizacionesNuevas}
          </Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Total recibidas</Text>
          <Text style={styles.filaValor}>{cotizaciones.length}</Text>
        </View>

        <Pressable
          style={styles.verTodos}
          onPress={() => router.push('/(insurer)/cotizaciones')}
        >
          <Text style={styles.verTodosTexto}>Ver cotizaciones</Text>
          <Ionicons name="arrow-forward" size={16} color={paleta.acento} />
        </Pressable>
      </View>

      {/* Suscripción */}
      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>Suscripción mensual</Text>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Estado</Text>
          <Text style={styles.filaValor}>
            {suscripcion
              ? ETIQUETA_ESTADO_SUSCRIPCION[suscripcion.estado]
              : 'Sin registrar'}
          </Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Valor</Text>
          <Text style={styles.filaValor}>
            {formatearCop(suscripcion?.precioCop ?? 0)}
          </Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Vence</Text>
          <Text style={styles.filaValor}>
            {suscripcion?.vencimiento ?? '—'}
          </Text>
        </View>

        <Text style={styles.nota}>
          Los pagos se registran manualmente por el administrador de la
          plataforma. No hay cobros automáticos.
        </Text>
      </View>

      <BotonNitro
        titulo="Cerrar sesión"
        variante="secundario"
        icono="log-out-outline"
        onPress={cerrarSesion}
        style={styles.botonSalir}
      />
      </ScrollView>

      <ModalRenovar
        visible={!!paraRenovar}
        vehiculo={paraRenovar}
        onCerrar={() => setParaRenovar(null)}
      />
    </>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    pantalla: { flex: 1, backgroundColor: Paleta.fondo },
    contenido: { paddingBottom: 40 },
    metricas: {
      flexDirection: 'row',
      gap: 8,
      marginHorizontal: 16,
      marginTop: -28,
    },
    metrica: {
      flex: 1,
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.suave,
      borderWidth: 2,
      borderColor: Paleta.bordeDuro,
      paddingVertical: 10,
      alignItems: 'center',
      gap: 2,
    },
    metricaValor: { fontSize: 20, fontWeight: '900', color: Paleta.texto },
    metricaEtiqueta: {
      fontSize: 10,
      fontWeight: '700',
      color: Paleta.textoSecundario,
    },
    estadoCentro: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 22,
      paddingHorizontal: 12,
    },
    estadoCargaTexto: {
      fontSize: 13,
      color: Paleta.textoSecundario,
      fontWeight: '700',
    },
    vacioTitulo: {
      fontSize: 16,
      fontWeight: '900',
      color: Paleta.texto,
      textAlign: 'center',
    },
    vacioTexto: {
      fontSize: 12.5,
      color: Paleta.textoSecundario,
      textAlign: 'center',
      lineHeight: 18,
    },
    reintentar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
      backgroundColor: Paleta.tinta,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    reintentarTexto: {
      color: Paleta.acento,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    tarjeta: {
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.tarjeta,
      padding: 18,
      marginHorizontal: 16,
      marginTop: 16,
      gap: 10,
      ...Sombras.suave,
    },
    tarjetaCabecera: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    tarjetaTitulo: {
      fontSize: 16,
      fontWeight: '900',
      color: Paleta.texto,
      marginBottom: 2,
    },
    contador: {
      fontSize: 13,
      fontWeight: '900',
      color: Paleta.acento,
      backgroundColor: Paleta.tinta,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 10,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    previa: { gap: 14, marginTop: 4 },
    verTodos: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: Paleta.tinta,
      borderRadius: Radios.pastilla,
      paddingVertical: 11,
    },
    verTodosTexto: {
      color: Paleta.acento,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    fila: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    filaEtiqueta: { fontSize: 13, color: Paleta.textoSecundario, fontWeight: '600' },
    filaValor: {
      fontSize: 13,
      color: Paleta.texto,
      fontWeight: '800',
      flexShrink: 1,
      textAlign: 'right',
    },
    nota: {
      fontSize: 12,
      color: Paleta.textoSuave,
      lineHeight: 17,
      marginTop: 4,
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
    botonSalir: { marginHorizontal: 16, marginTop: 20 },
  });

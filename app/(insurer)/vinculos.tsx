/*
=======================================================
NITRO SYNC - PANEL ASEGURADORA · VEHÍCULOS
=======================================================

Lista SOLO los vehículos de la aseguradora activa. La
consulta usa `aseguradoraClave` (collection group):

  where('aseguradoraClave', '==', claveDeMiOrganizacion)

La aseguradora nunca descarga todos los vehículos ni filtra
en el cliente: la consulta y las reglas comparten el filtro.
Al cambiar de aseguradora, el vehículo deja de ser visible.

Cada tarjeta muestra foto, placa, estado del seguro, días
para el vencimiento y el contacto del propietario, con los
botones de WhatsApp y renovación (registrados en auditoría).
=======================================================
*/

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import Buscador from '@/components/ui/buscador';
import ChipsFiltro from '@/components/aseguradora/chips-filtro';
import TarjetaVehiculoAseguradora from '@/components/aseguradora/tarjeta-vehiculo';
import ModalRenovar from '@/components/aseguradora/modal-renovar';
import { claveAseguradora } from '@/data/aseguradoras';
import { registrarAuditoria } from '@/services/auditoria';
import { suscribirVehiculosAseguradora } from '@/services/vehiculosAseguradora';
import {
  FILTROS_VEHICULOS_ASEGURADORA,
  contarVehiculosAseguradora,
  filtrarVehiculosAseguradora,
  resumirVehiculosAseguradora,
  type FiltroVehiculosAseguradora,
} from '@/utils/aseguradora';
import {
  clasificarErrorFirestore,
  type ErrorFirestoreClasificado,
} from '@/utils/errorFirestore';

import type { VehiculoAdmin } from '@/types/models';

export default function VehiculosAseguradora() {
  const { user, orgId, organizacion } = useAuth();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  /*
  Clave automática de la aseguradora: sale del documento de la
  organización y, si viniera vacía, se deriva del nombre.
  */
  const clave =
    organizacion?.aseguradoraClave || claveAseguradora(organizacion?.nombre ?? '');

  const [vehiculos, setVehiculos] = useState<VehiculoAdmin[]>([]);
  const [filtro, setFiltro] = useState<FiltroVehiculosAseguradora>('todos');
  const [busqueda, setBusqueda] = useState('');

  /* Vehículo cuya renovación está abierta en el modal. */
  const [paraRenovar, setParaRenovar] = useState<VehiculoAdmin | null>(null);

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
      (datos) => {
        setVehiculos(datos);
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

  const resumen = useMemo(
    () => resumirVehiculosAseguradora(vehiculos),
    [vehiculos]
  );

  const contadores = useMemo(
    () => contarVehiculosAseguradora(vehiculos),
    [vehiculos]
  );

  const lista = useMemo(
    () => filtrarVehiculosAseguradora(vehiculos, filtro, busqueda),
    [vehiculos, filtro, busqueda]
  );

  const auditar = useCallback(
    (accion: string, vehiculo: VehiculoAdmin) => {
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
    },
    [user, orgId]
  );

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

  const renderTarjeta = ({ item }: { item: VehiculoAdmin }) => (
    <TarjetaVehiculoAseguradora
      vehiculo={item}
      onContactar={(v) => auditar('vehiculo.contactar', v)}
      onLlamar={(v) => auditar('vehiculo.llamar', v)}
      onAbrir={(v) => auditar('vehiculo.abrir', v)}
      onRenovar={(v) => setParaRenovar(v)}
    />
  );

  return (
    <View style={styles.pantalla}>
      <EncabezadoPanel
        etiqueta="PANEL DE ASEGURADORA"
        titulo="Vehículos"
        subtitulo={`${resumen.total} vehículo(s) · ${resumen.porRenovar} por renovar`}
        icono="car-sport"
      />

      <View style={styles.filtros}>
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
      </View>

      <View style={styles.metricas}>
        <View style={styles.metrica}>
          <Text style={styles.metricaValor}>{resumen.total}</Text>
          <Text style={styles.metricaEtiqueta}>Total</Text>
        </View>
        <View style={styles.metrica}>
          <Text style={[styles.metricaValor, { color: paleta.textoExito }]}>
            {resumen.vigentes}
          </Text>
          <Text style={styles.metricaEtiqueta}>Vigentes</Text>
        </View>
        <View style={styles.metrica}>
          <Text style={[styles.metricaValor, { color: paleta.textoAdvertencia }]}>
            {resumen.porRenovar}
          </Text>
          <Text style={styles.metricaEtiqueta}>Por renovar</Text>
        </View>
        <View style={styles.metrica}>
          <Text style={[styles.metricaValor, { color: paleta.textoPeligro }]}>
            {resumen.vencidos}
          </Text>
          <Text style={styles.metricaEtiqueta}>Vencidos</Text>
        </View>
      </View>

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
            size={44}
            color={paleta.peligro}
          />
          <Text style={styles.vacioTitulo}>
            {errorMostrar?.titulo ?? 'No se pudieron cargar los vehículos'}
          </Text>
          <Text style={styles.vacioTexto}>{errorMostrar?.mensaje}</Text>

          {!sinOrganizacion && !sinClave ? (
            <Pressable style={styles.reintentar} onPress={reintentar}>
              <Ionicons name="refresh" size={16} color={paleta.acento} />
              <Text style={styles.reintentarTexto}>Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : mostrarCargando ? (
        <View style={styles.estadoCentro}>
          <ActivityIndicator size="large" color={paleta.primario} />
          <Text style={styles.estadoCargaTexto}>Cargando vehículos…</Text>
        </View>
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(item) => item.id}
          renderItem={renderTarjeta}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={
            <View style={styles.estadoCentro}>
              <Ionicons name="car-outline" size={44} color={paleta.textoSuave} />
              <Text style={styles.vacioTitulo}>
                {filtro === 'todos'
                  ? 'Aún no hay vehículos con tu seguro'
                  : `Sin vehículos en "${
                      FILTROS_VEHICULOS_ASEGURADORA.find((f) => f.id === filtro)
                        ?.etiqueta
                    }"`}
              </Text>
              <Text style={styles.vacioTexto}>
                {filtro === 'todos'
                  ? 'Cuando un propietario registre un seguro con tu aseguradora, su vehículo aparecerá aquí.'
                  : 'Prueba con otro filtro para ver más vehículos.'}
              </Text>
            </View>
          }
        />
      )}

      <ModalRenovar
        visible={!!paraRenovar}
        vehiculo={paraRenovar}
        onCerrar={() => setParaRenovar(null)}
      />
    </View>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    pantalla: { flex: 1, backgroundColor: Paleta.fondo },
    filtros: {
      paddingHorizontal: 16,
      marginTop: -24,
      gap: 10,
    },
    metricas: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      marginTop: 12,
    },
    metrica: {
      flex: 1,
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.suave,
      borderWidth: 2,
      borderColor: Paleta.bordeDuro,
      paddingVertical: 8,
      alignItems: 'center',
      gap: 2,
      ...Sombras.suave,
    },
    metricaValor: { fontSize: 18, fontWeight: '900', color: Paleta.texto },
    metricaEtiqueta: {
      fontSize: 9.5,
      fontWeight: '700',
      color: Paleta.textoSecundario,
    },
    lista: { padding: 16, gap: 14, paddingBottom: 40 },
    vacio: { alignItems: 'center', marginTop: 60, gap: 8, paddingHorizontal: 30 },
    vacioTitulo: { fontSize: 17, fontWeight: '900', color: Paleta.texto },
    vacioTexto: {
      fontSize: 13,
      color: Paleta.textoSecundario,
      textAlign: 'center',
      lineHeight: 19,
    },
    estadoCentro: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 60,
      gap: 10,
      paddingHorizontal: 30,
    },
    estadoCargaTexto: {
      fontSize: 13,
      color: Paleta.textoSecundario,
      fontWeight: '700',
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
  });

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
import { router } from 'expo-router';

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import TarjetaVehiculoAseguradora from '@/components/aseguradora/tarjeta-vehiculo';
import { registrarAuditoria } from '@/services/auditoria';
import { suscribirVehiculosAseguradora } from '@/services/vehiculosAseguradora';
import {
  FILTROS_VEHICULOS_ASEGURADORA,
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

  const clave = organizacion?.aseguradoraClave ?? '';

  const [vehiculos, setVehiculos] = useState<VehiculoAdmin[]>([]);
  const [filtro, setFiltro] = useState<FiltroVehiculosAseguradora>('todos');

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

  const lista = useMemo(
    () => filtrarVehiculosAseguradora(vehiculos, filtro),
    [vehiculos, filtro]
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

  const sinOrganizacion = !orgId;
  const sinClave = !!orgId && !clave;

  const errorMostrar: ErrorFirestoreClasificado | null = sinOrganizacion
    ? {
        tipo: 'permisos',
        titulo: 'Cuenta sin organización',
        mensaje:
          'Tu cuenta no tiene una aseguradora asignada. Pide al administrador que la configure.',
      }
    : sinClave
      ? {
          tipo: 'permisos',
          titulo: 'Aseguradora sin clave',
          mensaje:
            'Tu aseguradora todavía no tiene una clave asignada. Pide al super administrador que la configure.',
        }
      : errorCarga;

  const mostrarError = sinOrganizacion || sinClave || estadoCarga === 'error';

  const renderTarjeta = ({ item }: { item: VehiculoAdmin }) => (
    <TarjetaVehiculoAseguradora
      vehiculo={item}
      onContactar={(v) => auditar('vehiculo.contactar', v)}
      onAbrir={(v) => auditar('vehiculo.abrir', v)}
      onRenovar={(v) => {
        auditar('vehiculo.renovar', v);
        router.push('/(insurer)/polizas');
      }}
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
        {FILTROS_VEHICULOS_ASEGURADORA.map((f) => (
          <Pressable
            key={f.id}
            style={[styles.chip, filtro === f.id && styles.chipActivo]}
            onPress={() => setFiltro(f.id)}
          >
            <Text
              style={[
                styles.chipTexto,
                filtro === f.id && styles.chipTextoActivo,
              ]}
            >
              {f.etiqueta}
            </Text>
          </Pressable>
        ))}
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
      ) : estadoCarga === 'cargando' && vehiculos.length === 0 ? (
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
    </View>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    pantalla: { flex: 1, backgroundColor: Paleta.fondo },
    filtros: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      marginTop: -24,
    },
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

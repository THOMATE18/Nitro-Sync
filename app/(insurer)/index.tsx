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

import { useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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
import BotonNitro from '@/components/ui/boton-nitro';
import TarjetaVehiculoAseguradora from '@/components/aseguradora/tarjeta-vehiculo';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ETIQUETA_ESTADO_ORG, ETIQUETA_ESTADO_SUSCRIPCION } from '@/types/negocio';
import { registrarAuditoria } from '@/services/auditoria';
import { suscribirVehiculosAseguradora } from '@/services/vehiculosAseguradora';
import { suscribirPolizasOrg, suscribirOfertasOrg } from '@/services/polizas';
import { formatearCop, suscribirSuscripcionOrg } from '@/services/facturacion';
import { resumirVehiculosAseguradora } from '@/utils/aseguradora';
import type { Oferta, Poliza, Suscripcion } from '@/types/negocio';
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
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const clave = organizacion?.aseguradoraClave ?? '';

  const [vehiculos, setVehiculos] = useState<VehiculoAdmin[]>([]);
  const [polizas, setPolizas] = useState<Poliza[]>([]);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!clave) return;

    return suscribirVehiculosAseguradora(
      clave,
      (lista) => {
        setVehiculos(lista);
        setCargando(false);
      },
      () => setCargando(false)
    );
  }, [clave]);

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

  const previa = vehiculos.slice(0, MAX_PREVIA);

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

  return (
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

      {cargando ? (
        <ActivityIndicator
          size="large"
          color={paleta.primario}
          style={styles.cargando}
        />
      ) : null}

      {/* Vehículos con tu seguro */}
      <View style={styles.tarjeta}>
        <View style={styles.tarjetaCabecera}>
          <Text style={styles.tarjetaTitulo}>Vehículos con tu seguro</Text>
          <Text style={styles.contador}>{resumen.total}</Text>
        </View>

        {!clave ? (
          <Text style={styles.nota}>
            Tu aseguradora aún no tiene una clave asignada. Pide al super
            administrador que la configure para ver tus vehículos.
          </Text>
        ) : previa.length === 0 ? (
          <Text style={styles.nota}>
            Cuando un propietario registre un seguro con tu aseguradora, su
            vehículo aparecerá aquí.
          </Text>
        ) : (
          <View style={styles.previa}>
            {previa.map((vehiculo) => (
              <TarjetaVehiculoAseguradora
                key={vehiculo.id}
                vehiculo={vehiculo}
                onContactar={(v) => auditar('vehiculo.contactar', v)}
                onAbrir={(v) => auditar('vehiculo.abrir', v)}
                onRenovar={(v) => {
                  auditar('vehiculo.renovar', v);
                  router.push('/(insurer)/polizas');
                }}
              />
            ))}

            {resumen.total > MAX_PREVIA ? (
              <Pressable
                style={styles.verTodos}
                onPress={() => router.push('/(insurer)/vinculos')}
              >
                <Text style={styles.verTodosTexto}>
                  Ver los {resumen.total} vehículos
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
          <Text style={styles.filaEtiqueta}>Clave</Text>
          <Text style={styles.filaValor} numberOfLines={1}>
            {organizacion?.aseguradoraClave ?? 'Sin asignar'}
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
    cargando: { marginTop: 20 },
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
    botonSalir: { marginHorizontal: 16, marginTop: 20 },
  });

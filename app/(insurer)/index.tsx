/*
=======================================================
NITRO SYNC - PANEL ASEGURADORA · INICIO
=======================================================

Resumen de la organización:

  - nombre, estado y datos de contacto.
  - vehículos vinculados y pólizas vigentes.
  - estado de la suscripción mensual.
  - cierre de sesión.
=======================================================
*/

import { useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Paleta, Radios, Sombras } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import BotonNitro from '@/components/ui/boton-nitro';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ETIQUETA_ESTADO_ORG, ETIQUETA_ESTADO_SUSCRIPCION } from '@/types/negocio';
import { suscribirVinculosOrg } from '@/services/vinculos';
import { suscribirPolizasOrg, suscribirOfertasOrg } from '@/services/polizas';
import { formatearCop, suscribirSuscripcionOrg } from '@/services/facturacion';
import type { Oferta, Poliza, Suscripcion, VinculoAseguradora } from '@/types/negocio';

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

  const [vinculos, setVinculos] = useState<VinculoAseguradora[]>([]);
  const [polizas, setPolizas] = useState<Poliza[]>([]);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!orgId) return;

    const pararVinculos = suscribirVinculosOrg(
      orgId,
      (lista) => {
        setVinculos(lista);
        setCargando(false);
      },
      () => setCargando(false)
    );

    const pararPolizas = suscribirPolizasOrg(orgId, setPolizas);
    const pararOfertas = suscribirOfertasOrg(orgId, setOfertas);
    const pararSuscripcion = suscribirSuscripcionOrg(orgId, setSuscripcion);

    return () => {
      pararVinculos();
      pararPolizas();
      pararOfertas();
      pararSuscripcion();
    };
  }, [orgId]);

  const vigentes = useMemo(
    () => polizas.filter((p) => p.estado === 'vigente').length,
    [polizas]
  );

  const ofertasPendientes = useMemo(
    () => ofertas.filter((o) => o.estado === 'enviada').length,
    [ofertas]
  );

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
          valor={vinculos.length}
          etiqueta="Vehículos"
          icono="car-sport"
          color={Paleta.primario}
        />
        <Metrica
          valor={vigentes}
          etiqueta="Vigentes"
          icono="shield-checkmark"
          color={Paleta.exito}
        />
        <Metrica
          valor={ofertasPendientes}
          etiqueta="Ofertas"
          icono="paper-plane"
          color={Paleta.advertencia}
        />
      </View>

      {cargando ? (
        <ActivityIndicator
          size="large"
          color={Paleta.primario}
          style={styles.cargando}
        />
      ) : null}

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
                    ? Paleta.peligro
                    : Paleta.exito,
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

const styles = StyleSheet.create({
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
    borderColor: Paleta.tinta,
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
  tarjetaTitulo: {
    fontSize: 16,
    fontWeight: '900',
    color: Paleta.texto,
    marginBottom: 2,
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

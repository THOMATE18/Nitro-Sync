/*
=======================================================
NITRO SYNC - PANEL DE PLATAFORMA · RESUMEN
=======================================================

Vista general para el super administrador:

  - aseguradoras registradas y cuántas están activas.
  - vehículos vinculados y pólizas emitidas.
  - suscripciones en mora y pagos pendientes.
  - accesos rápidos a los demás módulos.
=======================================================
*/

import { useEffect, useMemo, useState } from 'react';

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Paleta, Radios, Sombras } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { suscribirOrganizaciones } from '@/services/organizaciones';
import { suscribirTodosVinculos } from '@/services/vinculos';
import { suscribirTodasPolizas } from '@/services/polizas';
import {
  formatearCop,
  suscribirSuscripciones,
  suscribirTodosPagos,
} from '@/services/facturacion';
import type {
  Organizacion,
  Pago,
  Poliza,
  Suscripcion,
  VinculoAseguradora,
} from '@/types/negocio';

interface Atajo {
  titulo: string;
  descripcion: string;
  icono: keyof typeof Ionicons.glyphMap;
  ruta: string;
}

const ATAJOS: Atajo[] = [
  {
    titulo: 'Aseguradoras',
    descripcion: 'Habilitar, suspender y revisar organizaciones',
    icono: 'business',
    ruta: '/(admin)/aseguradoras',
  },
  {
    titulo: 'Facturación',
    descripcion: 'Planes, suscripciones y pagos manuales',
    icono: 'cash',
    ruta: '/(admin)/facturacion',
  },
  {
    titulo: 'Vínculos',
    descripcion: 'Vincular vehículos con aseguradoras',
    icono: 'link',
    ruta: '/(admin)/vinculos',
  },
  {
    titulo: 'Auditoría',
    descripcion: 'Registro de acciones sensibles',
    icono: 'shield-checkmark',
    ruta: '/(admin)/auditoria',
  },
];

function Metrica({
  valor,
  etiqueta,
  icono,
  color,
}: {
  valor: string;
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

export default function PanelPlataforma() {
  const { user, logout } = useAuth();
  const confirmar = useConfirm();

  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [vinculos, setVinculos] = useState<VinculoAseguradora[]>([]);
  const [polizas, setPolizas] = useState<Poliza[]>([]);
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);

  useEffect(() => {
    const pararOrganizaciones = suscribirOrganizaciones(setOrganizaciones);
    const pararVinculos = suscribirTodosVinculos(setVinculos);
    const pararPolizas = suscribirTodasPolizas(setPolizas);
    const pararSuscripciones = suscribirSuscripciones(setSuscripciones);
    const pararPagos = suscribirTodosPagos(setPagos);

    return () => {
      pararOrganizaciones();
      pararVinculos();
      pararPolizas();
      pararSuscripciones();
      pararPagos();
    };
  }, []);

  const activas = useMemo(
    () => organizaciones.filter((o) => o.estado === 'active').length,
    [organizaciones]
  );

  const enMora = useMemo(
    () =>
      suscripciones.filter(
        (s) => s.estado === 'past_due' || s.estado === 'suspended'
      ).length,
    [suscripciones]
  );

  const pagosPendientes = useMemo(
    () => pagos.filter((p) => p.estado === 'pendiente'),
    [pagos]
  );

  const totalPendiente = useMemo(
    () => pagosPendientes.reduce((suma, p) => suma + p.montoCop, 0),
    [pagosPendientes]
  );

  const cerrarSesion = async () => {
    const ok = await confirmar({
      titulo: 'Cerrar sesión',
      mensaje: '¿Seguro que deseas cerrar la sesión de administrador?',
      textoConfirmar: 'Cerrar sesión',
      icono: 'log-out-outline',
      peligro: true,
    });

    if (ok) await logout();
  };

  return (
    <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido}>
      <EncabezadoPanel
        etiqueta="PANEL DE PLATAFORMA"
        titulo="Nitro Sync Admin"
        subtitulo={user?.email ?? null}
        icono="speedometer"
      />

      <View style={styles.metricas}>
        <Metrica
          valor={`${activas}/${organizaciones.length}`}
          etiqueta="Activas"
          icono="business"
          color={Paleta.primario}
        />
        <Metrica
          valor={String(vinculos.length)}
          etiqueta="Vínculos"
          icono="link"
          color={Paleta.exito}
        />
        <Metrica
          valor={String(polizas.length)}
          etiqueta="Pólizas"
          icono="document-text"
          color={Paleta.advertencia}
        />
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>Cobros manuales</Text>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Pagos pendientes</Text>
          <Text style={styles.filaValor}>{pagosPendientes.length}</Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Monto por cobrar</Text>
          <Text style={styles.filaValor}>{formatearCop(totalPendiente)}</Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Suscripciones en mora</Text>
          <Text
            style={[
              styles.filaValor,
              { color: enMora > 0 ? Paleta.peligro : Paleta.exito },
            ]}
          >
            {enMora}
          </Text>
        </View>

        <Text style={styles.nota}>
          No hay pasarela de pago: los cobros se registran a mano en el módulo
          de Facturación.
        </Text>
      </View>

      <Text style={styles.seccionTitulo}>Módulos</Text>

      <View style={styles.atajos}>
        {ATAJOS.map((atajo) => (
          <Pressable
            key={atajo.ruta}
            style={styles.atajo}
            onPress={() => router.push(atajo.ruta as never)}
          >
            <View style={styles.atajoIcono}>
              <Ionicons name={atajo.icono} size={20} color={Paleta.tinta} />
            </View>

            <View style={styles.atajoTextos}>
              <Text style={styles.atajoTitulo}>{atajo.titulo}</Text>
              <Text style={styles.atajoDescripcion}>{atajo.descripcion}</Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={20}
              color={Paleta.textoSuave}
            />
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.salir} onPress={cerrarSesion}>
        <Ionicons name="log-out-outline" size={18} color={Paleta.peligro} />
        <Text style={styles.salirTexto}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: Paleta.fondo },
  contenido: { paddingBottom: 44 },
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
  metricaValor: { fontSize: 18, fontWeight: '900', color: Paleta.texto },
  metricaEtiqueta: {
    fontSize: 10,
    fontWeight: '700',
    color: Paleta.textoSecundario,
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
  tarjetaTitulo: {
    fontSize: 16,
    fontWeight: '900',
    color: Paleta.texto,
    marginBottom: 2,
  },
  fila: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  filaEtiqueta: {
    fontSize: 13,
    color: Paleta.textoSecundario,
    fontWeight: '600',
  },
  filaValor: { fontSize: 13, color: Paleta.texto, fontWeight: '800' },
  nota: { fontSize: 12, color: Paleta.textoSuave, lineHeight: 17 },
  seccionTitulo: {
    fontSize: 15,
    fontWeight: '900',
    color: Paleta.texto,
    marginHorizontal: 16,
    marginTop: 24,
  },
  atajos: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  atajo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    padding: 14,
    ...Sombras.suave,
  },
  atajoIcono: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Paleta.acento,
    borderWidth: 2,
    borderColor: Paleta.tinta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  atajoTextos: { flex: 1 },
  atajoTitulo: { fontSize: 14.5, fontWeight: '900', color: Paleta.texto },
  atajoDescripcion: {
    fontSize: 12,
    color: Paleta.textoSecundario,
    marginTop: 2,
  },
  salir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: Radios.suave,
    borderWidth: 1.5,
    borderColor: Paleta.peligro,
  },
  salirTexto: { fontSize: 14, fontWeight: '800', color: Paleta.peligro },
});

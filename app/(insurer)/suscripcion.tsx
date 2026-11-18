/*
=======================================================
NITRO SYNC - PANEL ASEGURADORA · SUSCRIPCIÓN
=======================================================

Muestra, en modo lectura para la aseguradora:

  - plan contratado y su valor mensual en COP.
  - estado de la suscripción y vencimiento.
  - historial de pagos registrados a mano.

Los pagos y cambios de plan los registra el super
administrador de la plataforma: aquí no hay pasarela ni
cobros automáticos.
=======================================================
*/

import { useEffect, useMemo, useState } from 'react';

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import {
  formatearCop,
  suscribirPagosOrg,
  suscribirPlanes,
  suscribirSuscripcionOrg,
} from '@/services/facturacion';
import {
  ETIQUETA_ESTADO_SUSCRIPCION,
  type Pago,
  type Plan,
  type Suscripcion,
} from '@/types/negocio';

export default function SuscripcionAseguradora() {
  const { orgId, organizacion } = useAuth();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [planes, setPlanes] = useState<Plan[]>([]);
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([]);

  useEffect(() => {
    if (!orgId) return;

    const pararPlanes = suscribirPlanes(setPlanes);
    const pararSuscripcion = suscribirSuscripcionOrg(orgId, setSuscripcion);
    const pararPagos = suscribirPagosOrg(orgId, setPagos);

    return () => {
      pararPlanes();
      pararSuscripcion();
      pararPagos();
    };
  }, [orgId]);

  const plan = useMemo(
    () => planes.find((p) => p.id === suscripcion?.planId) ?? null,
    [planes, suscripcion]
  );

  const totalPagado = useMemo(
    () =>
      pagos
        .filter((p) => p.estado === 'pagado')
        .reduce((suma, p) => suma + p.montoCop, 0),
    [pagos]
  );

  return (
    <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido}>
      <EncabezadoPanel
        etiqueta="PANEL DE ASEGURADORA"
        titulo="Suscripción mensual"
        subtitulo={organizacion?.nombre ?? null}
        icono="card"
      />

      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>Plan actual</Text>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Plan</Text>
          <Text style={styles.filaValor}>{plan?.nombre ?? 'Sin asignar'}</Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Valor mensual</Text>
          <Text style={styles.filaValor}>
            {formatearCop(suscripcion?.precioCop ?? plan?.precioCop ?? 0)}
          </Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Estado</Text>
          <Text style={styles.filaValor}>
            {suscripcion
              ? ETIQUETA_ESTADO_SUSCRIPCION[suscripcion.estado]
              : 'Sin registrar'}
          </Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Inicio</Text>
          <Text style={styles.filaValor}>{suscripcion?.inicio ?? '—'}</Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Vencimiento</Text>
          <Text style={styles.filaValor}>{suscripcion?.vencimiento ?? '—'}</Text>
        </View>
      </View>

      {plan && plan.funciones.length > 0 ? (
        <View style={styles.tarjeta}>
          <Text style={styles.tarjetaTitulo}>Incluye</Text>

          {plan.funciones.map((funcion) => (
            <View key={funcion} style={styles.funcionFila}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={paleta.exito}
              />
              <Text style={styles.funcionTexto}>{funcion}</Text>
            </View>
          ))}

          <Text style={styles.nota}>
            {plan.limiteVehiculos
              ? `Hasta ${plan.limiteVehiculos} vehículos vinculados.`
              : 'Vehículos vinculados sin límite definido.'}
          </Text>
        </View>
      ) : null}

      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>
          Pagos registrados ({pagos.length})
        </Text>

        {pagos.length === 0 ? (
          <Text style={styles.nota}>
            Todavía no hay pagos registrados para tu organización.
          </Text>
        ) : (
          pagos.map((pago) => (
            <View key={pago.id} style={styles.pagoFila}>
              <View style={styles.pagoTextos}>
                <Text style={styles.pagoPeriodo}>{pago.periodo}</Text>
                <Text style={styles.pagoMetodo}>
                  {pago.metodo}
                  {pago.referencia ? ` · ${pago.referencia}` : ''}
                </Text>
              </View>

              <View style={styles.pagoDerecha}>
                <Text style={styles.pagoMonto}>{formatearCop(pago.montoCop)}</Text>
                <Text
                  style={[
                    styles.pagoEstado,
                    {
                      color:
                        pago.estado === 'pagado'
                          ? paleta.exito
                          : paleta.advertencia,
                    },
                  ]}
                >
                  {pago.estado === 'pagado' ? 'Pagado' : 'Pendiente'}
                </Text>
              </View>
            </View>
          ))
        )}

        {totalPagado > 0 ? (
          <Text style={styles.total}>Total pagado: {formatearCop(totalPagado)}</Text>
        ) : null}
      </View>

      <View style={styles.aviso}>
        <Ionicons name="information-circle-outline" size={18} color={paleta.primario} />
        <Text style={styles.avisoTexto}>
          Los pagos se registran manualmente por el administrador de la
          plataforma cuando recibe la transferencia. No hay cobros automáticos
          ni pasarela de pago.
        </Text>
      </View>
    </ScrollView>
  );
}

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: Paleta.fondo },
  contenido: { paddingBottom: 44 },
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
  filaValor: {
    fontSize: 13,
    color: Paleta.texto,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'right',
  },
  funcionFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  funcionTexto: { fontSize: 13, color: Paleta.textoSecundario, flexShrink: 1 },
  nota: { fontSize: 12, color: Paleta.textoSuave, lineHeight: 17 },
  pagoFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Paleta.borde,
  },
  pagoTextos: { flex: 1 },
  pagoPeriodo: { fontSize: 13.5, fontWeight: '800', color: Paleta.texto },
  pagoMetodo: { fontSize: 11.5, color: Paleta.textoSuave, marginTop: 1 },
  pagoDerecha: { alignItems: 'flex-end' },
  pagoMonto: { fontSize: 13, fontWeight: '800', color: Paleta.texto },
  pagoEstado: { fontSize: 11, fontWeight: '900', marginTop: 1 },
  total: {
    fontSize: 13,
    fontWeight: '900',
    color: Paleta.texto,
    marginTop: 6,
    textAlign: 'right',
  },
  aviso: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: Paleta.primarioClaro,
    borderRadius: Radios.suave,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 16,
  },
  avisoTexto: { flex: 1, fontSize: 12.5, color: Paleta.texto, lineHeight: 18 },
});

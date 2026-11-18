/*
======================================================
NITRO SYNC - PANEL ASEGURADORA · PLAN Y PAGOS
======================================================

Bloques (todos en modo SIMULADO):

  1. PLAN ÚNICO SÚPER EMPRESARIAL: descripción, beneficios y
     precio vigente (configurado por el súper administrador).
  2. COMPRA SIMULADA: resumen + confirmación -> queda
     PENDIENTE DE APROBACIÓN. Nunca cobra ni activa el plan.
  3. PAGOS SIMULADOS DE CLIENTES: la aseguradora confirma o
     rechaza los pagos que registran los propietarios.

No hay pasarela, cobros automáticos ni APIs externas: todo
pasa por `services/proveedores.ts` y lleva la etiqueta
visible "Simulado".
======================================================
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

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta, useConfirm } from '@/components/ui/confirm-dialog';
import {
  crearCompraSuscripcion,
  idCompraSuscripcion,
  suscribirComprasOrg,
} from '@/services/comprasSuscripcion';
import { configuracionPorDefecto, suscribirConfiguracionSuscripcion } from '@/services/configuracionSuscripcion';
import {
  formatearCop,
  suscribirPagosOrg,
  suscribirSuscripcionOrg,
} from '@/services/facturacion';
import {
  responderPagoSeguro,
  suscribirPagosSegurosOrg,
} from '@/services/pagosSeguros';
import { suscribirVehiculosAseguradora } from '@/services/vehiculosAseguradora';
import { claveAseguradora } from '@/data/aseguradoras';
import {
  ETIQUETA_ESTADO_COMPRA,
  ETIQUETA_ESTADO_PAGO_SEGURO,
  ETIQUETA_ESTADO_SUSCRIPCION,
  ETIQUETA_SIMULADO,
  estadoEfectivoSuscripcion,
  type CompraSuscripcion,
  type ConfiguracionSuscripcion,
  type Pago,
  type PagoSeguro,
  type Suscripcion,
} from '@/types/negocio';
import type { VehiculoAdmin } from '@/types/models';

function colorCompra(Paleta: TipoPaleta, estado: CompraSuscripcion['estado']) {
  if (estado === 'aprobada') return Paleta.exito;
  if (estado === 'rechazada') return Paleta.peligro;
  return Paleta.advertencia;
}

function colorPago(Paleta: TipoPaleta, estado: PagoSeguro['estado']) {
  if (estado === 'confirmado') return Paleta.exito;
  if (estado === 'rechazado') return Paleta.peligro;
  return Paleta.advertencia;
}

export default function SuscripcionAseguradora() {
  const { user, orgId, organizacion } = useAuth();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const alerta = useAlerta();
  const confirmar = useConfirm();

  const [configuracion, setConfiguracion] = useState<ConfiguracionSuscripcion>(
    configuracionPorDefecto()
  );
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);
  const [compras, setCompras] = useState<CompraSuscripcion[]>([]);
  const [pagosSeguros, setPagosSeguros] = useState<PagoSeguro[]>([]);
  const [pagosMembresia, setPagosMembresia] = useState<Pago[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoAdmin[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);

  const clave =
    organizacion?.aseguradoraClave || claveAseguradora(organizacion?.nombre ?? '');

  useEffect(() => {
    const pararConfiguracion = suscribirConfiguracionSuscripcion(setConfiguracion);
    if (!orgId) return () => pararConfiguracion();

    const pararSuscripcion = suscribirSuscripcionOrg(orgId, setSuscripcion);
    const pararCompras = suscribirComprasOrg(orgId, setCompras);
    const pararPagos = suscribirPagosOrg(orgId, setPagosMembresia);
    /* Si la membresía está inactiva, el propio panel puede seguir
       comprando; los pagos simplemente se muestran vacíos. */
    const pararPagosSeguros = suscribirPagosSegurosOrg(
      orgId,
      setPagosSeguros,
      () => setPagosSeguros([])
    );

    return () => {
      pararConfiguracion();
      pararSuscripcion();
      pararCompras();
      pararPagos();
      pararPagosSeguros();
    };
  }, [orgId]);

  useEffect(() => {
    if (!clave) return;
    return suscribirVehiculosAseguradora(clave, setVehiculos);
  }, [clave]);

  const estado = suscripcion
    ? estadoEfectivoSuscripcion(suscripcion)
    : null;

  const placaDe = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const vehiculo of vehiculos) {
      mapa.set(vehiculo.id, vehiculo.placa || vehiculo.id.slice(0, 6));
    }
    return (id: string) => mapa.get(id) ?? id.slice(0, 6);
  }, [vehiculos]);

  const compraDelMes = orgId
    ? compras.find((compra) => compra.id === idCompraSuscripcion(orgId))
    : undefined;

  /* ------------------------------------------------------
     COMPRA SIMULADA DEL PLAN ÚNICO
  ------------------------------------------------------ */

  const comprar = async () => {
    if (!orgId || !user) return;

    const ok = await confirmar({
      titulo: `Comprar ${configuracion.nombre} (${ETIQUETA_SIMULADO})`,
      mensaje:
        `Resumen: plan ${configuracion.nombre}, ${formatearCop(configuracion.precioCop)} ` +
        `mensuales. Verás el detalle y los beneficios en la confirmación. ` +
        `La compra queda PENDIENTE DE APROBACIÓN; el súper administrador decide ` +
        `cuándo se activa. No se realiza ningún cobro real.`,
      textoConfirmar: 'Confirmar compra',
      icono: 'cart-outline',
    });

    if (!ok) return;

    try {
      setGuardando(true);

      await crearCompraSuscripcion({
        orgId,
        orgNombre: organizacion?.nombre ?? 'Mi aseguradora',
        compradorUid: user.uid,
        compradorCorreo: user.email,
      });

      await alerta({
        titulo: `Compra registrada (${ETIQUETA_SIMULADO})`,
        mensaje:
          `${configuracion.nombre} · ${formatearCop(configuracion.precioCop)}/mes. ` +
          `Estado: PENDIENTE DE APROBACIÓN. No se ha cobrado nada y el plan ` +
          `sigue inactivo hasta que el administrador lo apruebe.`,
        tipo: 'exito',
      });
    } catch (error) {
      await alerta({
        titulo: 'No se pudo registrar la compra',
        mensaje:
          error instanceof Error
            ? error.message
            : 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  /* ------------------------------------------------------
     CONFIRMACIÓN DE PAGOS DE CLIENTES
  ------------------------------------------------------ */

  const responderPago = async (
    pago: PagoSeguro,
    respuesta: 'confirmado' | 'rechazado'
  ) => {
    if (!user) return;

    const ok = await confirmar({
      titulo: respuesta === 'confirmado' ? 'Confirmar pago' : 'Rechazar pago',
      mensaje:
        `${formatearCop(pago.montoCop)} · ${pago.periodo} · ${placaDe(pago.vehiculoId)}. ` +
        `Esta decisión es definitiva: el pago quedará inmutable.`,
      textoConfirmar: respuesta === 'confirmado' ? 'Confirmar' : 'Rechazar',
      icono: respuesta === 'confirmado' ? 'checkmark-circle-outline' : 'close-circle-outline',
      peligro: respuesta === 'rechazado',
    });

    if (!ok) return;

    try {
      setProcesando(pago.id);
      await responderPagoSeguro(pago.id, respuesta, user.uid);
      await alerta({
        titulo: respuesta === 'confirmado' ? 'Pago confirmado' : 'Pago rechazado',
        mensaje: 'El propietario verá el resultado en su app.',
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo responder',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setProcesando(null);
    }
  };

  return (
    <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido}>
      <EncabezadoPanel
        etiqueta="PANEL DE ASEGURADORA"
        titulo="Mi plan y pagos"
        subtitulo={organizacion?.nombre ?? null}
        icono="card"
      />

      <View style={styles.badgeSimulado}>
        <Ionicons name="information-circle-outline" size={16} color={paleta.primario} />
        <Text style={styles.badgeTexto}>
          {ETIQUETA_SIMULADO}: no se realizan cobros ni envíos automáticos.
        </Text>
      </View>

      {/* ---------------- PLAN ÚNICO ---------------- */}
      <View style={styles.tarjeta}>
        <View style={styles.tarjetaCabecera}>
          <Text style={styles.tarjetaTitulo}>{configuracion.nombre}</Text>
          <View style={styles.pillPlan}>
            <Text style={styles.pillPlanTexto}>Plan único</Text>
          </View>
        </View>

        <Text style={styles.descripcion}>{configuracion.descripcion}</Text>

        <View style={styles.precioBloque}>
          <Text style={styles.precio}>{formatearCop(configuracion.precioCop)}</Text>
          <Text style={styles.precioDetalle}> / mes · Mensual</Text>
        </View>

        <Text style={styles.subtitulo}>Beneficios incluidos</Text>
        {configuracion.beneficios.map((beneficio) => (
          <View key={beneficio} style={styles.funcionFila}>
            <Ionicons name="checkmark-circle" size={16} color={paleta.exito} />
            <Text style={styles.funcionTexto}>{beneficio}</Text>
          </View>
        ))}
      </View>

      {/* ---------------- SUSCRIPCIÓN VIGENTE ---------------- */}
      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>Estado de tu suscripción</Text>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Estado vigente</Text>
          <Text
            style={[
              styles.filaValor,
              {
                color: estado
                  ? paleta[
                      ({
                        pendiente: 'advertencia',
                        active: 'exito',
                        expired: 'peligro',
                        inactive: 'textoSuave',
                        trial: 'advertencia',
                        past_due: 'advertencia',
                        suspended: 'textoSuave',
                        cancelled: 'textoSuave',
                      } as const)[estado]
                    ]
                  : paleta.textoSuave,
              },
            ]}
          >
            {estado ? ETIQUETA_ESTADO_SUSCRIPCION[estado] : 'SIN SUSCRIPCIÓN'}
          </Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Plan asignado</Text>
          <Text style={styles.filaValor}>
            {suscripcion ? configuracion.nombre : '—'}
          </Text>
        </View>

        <View style={styles.fila}>
          <Text style={styles.filaEtiqueta}>Precio de tu plan</Text>
          <Text style={styles.filaValor}>
            {suscripcion ? formatearCop(suscripcion.precioCop) : '—'}
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

        {estado === 'inactive' || estado === 'expired' || !suscripcion ? (
          <Text style={styles.avisoInactivo}>
            Tu acceso a datos de negocio está limitado hasta que el súper
            administrador apruebe y active el plan.
          </Text>
        ) : null}
      </View>

      {/* ---------------- COMPRA SIMULADA ---------------- */}
      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>Comprar {configuracion.nombre}</Text>
        <Text style={styles.nota}>
          Revisa el resumen y confirma. La compra queda pendiente; nadie cobra
          dinero y la activación la decide el súper administrador.
        </Text>

        <View style={styles.resumen}>
          <View style={styles.fila}>
            <Text style={styles.filaEtiqueta}>Plan</Text>
            <Text style={styles.filaValor}>{configuracion.nombre}</Text>
          </View>
          <View style={styles.fila}>
            <Text style={styles.filaEtiqueta}>Precio</Text>
            <Text style={styles.filaValor}>
              {formatearCop(configuracion.precioCop)}
            </Text>
          </View>
          <View style={styles.fila}>
            <Text style={styles.filaEtiqueta}>Periodicidad</Text>
            <Text style={styles.filaValor}>Mensual</Text>
          </View>
          <View style={styles.fila}>
            <Text style={styles.filaEtiqueta}>Beneficios</Text>
            <Text style={styles.filaValor}>{configuracion.beneficios.length}</Text>
          </View>
        </View>

        <BotonNitro
          titulo={
            compraDelMes
              ? `Ya compraste en ${compraDelMes.fechaCompra.slice(0, 7)}`
              : `Comprar (${ETIQUETA_SIMULADO})`
          }
          icono="cart-outline"
          tamano="pequeno"
          onPress={comprar}
          cargando={guardando}
          deshabilitado={Boolean(compraDelMes)}
          anchoCompleto
        />
      </View>

      {/* ---------------- MIS COMPRAS ---------------- */}
      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>Mis compras ({compras.length})</Text>

        {compras.length === 0 ? (
          <Text style={styles.nota}>Todavía no has registrado ninguna compra.</Text>
        ) : (
          compras.map((compra) => (
            <View key={compra.id} style={styles.compraFila}>
              <View style={styles.filaTextos}>
                <Text style={styles.pagoPeriodo}>
                  {compra.planNombre} · {formatearCop(compra.precioCop)}
                </Text>
                <Text style={styles.nota}>
                  Ref. {compra.id} · {compra.fechaCompra}
                </Text>
              </View>
              <Text
                style={[
                  styles.estadoTexto,
                  { color: colorCompra(paleta, compra.estado) },
                ]}
              >
                {ETIQUETA_ESTADO_COMPRA[compra.estado]}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* ---------------- PAGOS DE CLIENTES ---------------- */}
      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>
          Pagos de tus clientes ({ETIQUETA_SIMULADO})
        </Text>
        <Text style={styles.nota}>
          Los propietarios registran el pago; aquí puedes confirmarlo o rechazarlo.
          Una vez respondido, el registro es inmutable.
        </Text>

        {pagosSeguros.length === 0 ? (
          <Text style={styles.nota}>No hay pagos registrados por clientes.</Text>
        ) : (
          pagosSeguros.map((pago) => (
            <View key={pago.id} style={styles.pagoBloque}>
              <View style={styles.pagoFila}>
                <View style={styles.filaTextos}>
                  <Text style={styles.pagoPeriodo}>
                    {pago.periodo} · {placaDe(pago.vehiculoId)}
                  </Text>
                  <Text style={styles.nota}>
                    {pago.clienteNombre || 'Cliente'} ·{' '}
                    {pago.referencia ?? ETIQUETA_SIMULADO}
                  </Text>
                </View>
                <View style={styles.pagoDerecha}>
                  <Text style={styles.pagoMonto}>{formatearCop(pago.montoCop)}</Text>
                  <Text
                    style={[
                      styles.estadoTexto,
                      { color: colorPago(paleta, pago.estado) },
                    ]}
                  >
                    {ETIQUETA_ESTADO_PAGO_SEGURO[pago.estado]}
                  </Text>
                </View>
              </View>

              {pago.estado === 'pendiente' ? (
                <View style={styles.accionesFila}>
                  <Pressable
                    style={[styles.accion, { borderColor: paleta.exito }]}
                    onPress={() => responderPago(pago, 'confirmado')}
                    disabled={procesando === pago.id}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={16}
                      color={paleta.exito}
                    />
                    <Text style={[styles.accionTexto, { color: paleta.exito }]}>
                      Confirmar
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.accion, { borderColor: paleta.peligro }]}
                    onPress={() => responderPago(pago, 'rechazado')}
                    disabled={procesando === pago.id}
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
              ) : null}
            </View>
          ))
        )}
      </View>

      {/* ---------------- PAGOS MANUALES DE LA MEMBRESÍA (HEREDADO) ---------------- */}
      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>
          Historial de pagos registrados por el administrador
        </Text>

        {pagosMembresia.length === 0 ? (
          <Text style={styles.nota}>Todavía no hay registros.</Text>
        ) : (
          pagosMembresia.map((pago) => (
            <View key={pago.id} style={styles.pagoFila}>
              <View style={styles.filaTextos}>
                <Text style={styles.pagoPeriodo}>{pago.periodo}</Text>
                <Text style={styles.nota}>
                  {pago.metodo}
                  {pago.referencia ? ` · ${pago.referencia}` : ''}
                </Text>
              </View>
              <View style={styles.pagoDerecha}>
                <Text style={styles.pagoMonto}>{formatearCop(pago.montoCop)}</Text>
                <Text
                  style={[
                    styles.estadoTexto,
                    {
                      color:
                        pago.estado === 'pagado' ? paleta.exito : paleta.advertencia,
                    },
                  ]}
                >
                  {pago.estado === 'pagado' ? 'Pagado' : 'Pendiente'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.aviso}>
        <Ionicons name="information-circle-outline" size={18} color={paleta.primario} />
        <Text style={styles.avisoTexto}>
          Los pagos se registran manualmente por el administrador de la plataforma.
          No hay cobros automáticos, pasarela de pago ni envío de mensajes por API.
          Todo aparece etiquetado como {ETIQUETA_SIMULADO}.
        </Text>
      </View>
    </ScrollView>
  );
}

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
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
    gap: 10,
  },
  tarjetaTitulo: {
    fontSize: 16,
    fontWeight: '900',
    color: Paleta.texto,
    flexShrink: 1,
  },
  pillPlan: {
    borderRadius: Radios.pastilla,
    backgroundColor: Paleta.acentoClaro,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillPlanTexto: { fontSize: 10, fontWeight: '900', color: Paleta.textoAcento },
  descripcion: { fontSize: 13, color: Paleta.textoSecundario, lineHeight: 19 },
  precioBloque: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  precio: { fontSize: 24, fontWeight: '900', color: Paleta.primario },
  precioDetalle: { fontSize: 12, color: Paleta.textoSecundario },
  subtitulo: {
    fontSize: 13,
    fontWeight: '900',
    color: Paleta.texto,
    marginTop: 6,
  },
  funcionFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  funcionTexto: { fontSize: 12.5, color: Paleta.textoSecundario, flexShrink: 1 },
  nota: { fontSize: 12, color: Paleta.textoSuave, lineHeight: 17 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  filaTextos: { flex: 1 },
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
  avisoInactivo: {
    backgroundColor: Paleta.advertenciaFondo,
    borderRadius: Radios.suave,
    borderWidth: 1,
    borderColor: Paleta.advertencia,
    padding: 12,
    fontSize: 12,
    color: Paleta.textoAdvertencia,
    lineHeight: 17,
  },
  resumen: {
    gap: 6,
    padding: 12,
    borderRadius: Radios.suave,
    backgroundColor: Paleta.fondo,
    borderWidth: 1,
    borderColor: Paleta.borde,
  },
  compraFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Paleta.borde,
  },
  pagoBloque: { borderTopWidth: 1, borderTopColor: Paleta.borde, paddingTop: 8 },
  pagoFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  pagoPeriodo: { fontSize: 13.5, fontWeight: '800', color: Paleta.texto },
  pagoDerecha: { alignItems: 'flex-end' },
  pagoMonto: { fontSize: 13, fontWeight: '800', color: Paleta.texto },
  estadoTexto: { fontSize: 11, fontWeight: '900', textAlign: 'right' },
  accionesFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
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

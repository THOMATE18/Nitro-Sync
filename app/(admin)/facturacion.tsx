/*
=======================================================
NITRO SYNC - PANEL DE PLATAFORMA · FACTURACIÓN
=======================================================

Tres secciones:

  PLANES        -> catálogo de planes mensuales en COP.
  SUSCRIPCIONES -> plan y estado de cada aseguradora.
  PAGOS         -> cobros registrados a mano.

No hay pasarela de pago: cuando llega una transferencia, el
super administrador registra el pago y lo marca como
pagado. El estado de la suscripción controla el acceso.
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

import { Paleta, Radios, Sombras } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta, useConfirm } from '@/components/ui/confirm-dialog';
import { suscribirOrganizaciones } from '@/services/organizaciones';
import {
  formatearCop,
  guardarPlan,
  guardarSuscripcion,
  marcarPagoPagado,
  registrarPago,
  suscribirPlanes,
  suscribirSuscripciones,
  suscribirTodosPagos,
} from '@/services/facturacion';
import { registrarAuditoria } from '@/services/auditoria';
import {
  ETIQUETA_ESTADO_SUSCRIPCION,
  type EstadoSuscripcion,
  type Organizacion,
  type Pago,
  type Plan,
  type Suscripcion,
} from '@/types/negocio';

type Seccion = 'planes' | 'suscripciones' | 'pagos';

const ESTADOS_SUSCRIPCION: EstadoSuscripcion[] = [
  'trial',
  'active',
  'past_due',
  'suspended',
  'cancelled',
  'expired',
];

export default function FacturacionAdmin() {
  const { user } = useAuth();
  const alerta = useAlerta();
  const confirmar = useConfirm();

  const [seccion, setSeccion] = useState<Seccion>('suscripciones');

  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);

  const [orgId, setOrgId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  /* Formulario de plan. */
  const [planNombre, setPlanNombre] = useState('');
  const [planPrecio, setPlanPrecio] = useState('');
  const [planLimite, setPlanLimite] = useState('');

  /* Formulario de pago. */
  const [periodo, setPeriodo] = useState('');
  const [monto, setMonto] = useState('');

  useEffect(() => {
    const pararOrgs = suscribirOrganizaciones(setOrganizaciones);
    const pararPlanes = suscribirPlanes(setPlanes);
    const pararSuscripciones = suscribirSuscripciones(setSuscripciones);
    const pararPagos = suscribirTodosPagos(setPagos);

    return () => {
      pararOrgs();
      pararPlanes();
      pararSuscripciones();
      pararPagos();
    };
  }, []);

  const org = useMemo(
    () => organizaciones.find((o) => o.id === orgId) ?? null,
    [organizaciones, orgId]
  );

  const suscripcionDe = (id: string) =>
    suscripciones.find((s) => s.orgId === id) ?? null;

  const auditar = async (
    accion: string,
    entidad: string,
    entidadId: string,
    detalle: Record<string, string | number | boolean | null>
  ) => {
    if (!user) return;

    await registrarAuditoria({
      actorUid: user.uid,
      actorCorreo: user.email,
      actorRol: 'super_admin',
      orgId,
      accion,
      entidad,
      entidadId,
      detalle,
    });
  };

  const crearPlan = async () => {
    if (!planNombre.trim() || !planPrecio.trim()) {
      await alerta({
        titulo: 'Datos incompletos',
        mensaje: 'Escribe el nombre del plan y su precio mensual en COP.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      const id = await guardarPlan({
        nombre: planNombre.trim(),
        precioCop: Number(planPrecio.replace(/[^\d]/g, '')),
        limiteVehiculos: planLimite ? Number(planLimite.replace(/[^\d]/g, '')) : null,
        funciones: [],
      });

      await auditar('plan.crear', 'plans', id, {
        nombre: planNombre.trim(),
        precioCop: Number(planPrecio.replace(/[^\d]/g, '')),
      });

      await alerta({
        titulo: 'Plan guardado',
        mensaje: `El plan ${planNombre.trim()} quedó disponible.`,
        tipo: 'exito',
      });

      setPlanNombre('');
      setPlanPrecio('');
      setPlanLimite('');
    } catch {
      await alerta({
        titulo: 'No se pudo guardar',
        mensaje: 'Revisa los datos e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  const cambiarSuscripcion = async (
    estado: EstadoSuscripcion,
    planId: string | null,
    precioCop: number | null
  ) => {
    if (!org) {
      await alerta({
        titulo: 'Falta la aseguradora',
        mensaje: 'Selecciona una aseguradora primero.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      await guardarSuscripcion(org.id, {
        estado,
        planId,
        precioCop,
        inicio: suscripcionDe(org.id)?.inicio ?? new Date().toISOString().slice(0, 10),
      });

      await auditar('suscripcion.actualizar', 'subscriptions', org.id, {
        estado,
        planId: planId ?? 'ninguno',
      });

      await alerta({
        titulo: 'Suscripción actualizada',
        mensaje: `${org.nombre} quedó en estado ${ETIQUETA_ESTADO_SUSCRIPCION[estado]}.`,
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo actualizar',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  const crearPago = async () => {
    if (!org || !user) {
      await alerta({
        titulo: 'Falta la aseguradora',
        mensaje: 'Selecciona una aseguradora primero.',
        tipo: 'advertencia',
      });
      return;
    }

    if (!periodo.trim() || !monto.trim()) {
      await alerta({
        titulo: 'Datos incompletos',
        mensaje: 'Escribe el periodo (ej. 2026-01) y el monto en COP.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      const montoCop = Number(monto.replace(/[^\d]/g, ''));

      const id = await registrarPago({
        orgId: org.id,
        periodo: periodo.trim(),
        montoCop,
        registradoPor: user.uid,
        pagado: false,
      });

      await auditar('pago.registrar', 'payments', id, {
        periodo: periodo.trim(),
        montoCop,
      });

      await alerta({
        titulo: 'Pago registrado',
        mensaje: `Quedó pendiente ${formatearCop(montoCop)} para ${org.nombre}.`,
        tipo: 'exito',
      });

      setPeriodo('');
      setMonto('');
    } catch {
      await alerta({
        titulo: 'No se pudo registrar',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  const cobrar = async (pago: Pago) => {
    const ok = await confirmar({
      titulo: 'Marcar como pagado',
      mensaje: `¿Confirmar el pago de ${formatearCop(pago.montoCop)} (${pago.periodo})?`,
      textoConfirmar: 'Confirmar pago',
      icono: 'cash-outline',
    });

    if (!ok) return;

    try {
      await marcarPagoPagado(pago.id);
      await auditar('pago.pagado', 'payments', pago.id, {
        montoCop: pago.montoCop,
      });
    } catch {
      await alerta({
        titulo: 'No se pudo marcar',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    }
  };

  const renderSelectorOrg = () => (
    <View style={styles.selector}>
      <Text style={styles.etiqueta}>Aseguradora</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {organizaciones.map((o) => (
          <Pressable
            key={o.id}
            style={[styles.chip, orgId === o.id && styles.chipActivo]}
            onPress={() => setOrgId(o.id)}
          >
            <Text
              style={[styles.chipTexto, orgId === o.id && styles.chipTextoActivo]}
              numberOfLines={1}
            >
              {o.nombre}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <EncabezadoPanel
          etiqueta="PANEL DE PLATAFORMA"
          titulo="Facturación"
          subtitulo={`${planes.length} plan(es) · ${pagos.length} pago(s)`}
          icono="cash"
        />

        <View style={styles.segmentos}>
          {(['suscripciones', 'planes', 'pagos'] as Seccion[]).map((s) => (
            <Pressable
              key={s}
              style={[styles.segmento, seccion === s && styles.segmentoActivo]}
              onPress={() => setSeccion(s)}
            >
              <Text
                style={[
                  styles.segmentoTexto,
                  seccion === s && styles.segmentoTextoActivo,
                ]}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {seccion === 'suscripciones' ? (
          <>
            <View style={styles.formulario}>
              <Text style={styles.formTitulo}>Estado de suscripción</Text>
              {renderSelectorOrg()}

              {org ? (
                <>
                  <Text style={styles.resumen}>
                    {org.nombre} ·{' '}
                    {suscripcionDe(org.id)
                      ? ETIQUETA_ESTADO_SUSCRIPCION[suscripcionDe(org.id)!.estado]
                      : 'Sin registrar'}
                  </Text>

                  <Text style={styles.etiqueta}>Plan</Text>
                  <View style={styles.chips}>
                    <Pressable
                      style={[styles.chip, styles.chipOscuro]}
                      onPress={() => cambiarSuscripcion('active', null, 0)}
                    >
                      <Text style={styles.chipTextoActivo}>Sin plan</Text>
                    </Pressable>

                    {planes.map((p) => (
                      <Pressable
                        key={p.id}
                        style={[styles.chip, styles.chipOscuro]}
                        onPress={() =>
                          cambiarSuscripcion('active', p.id, p.precioCop)
                        }
                      >
                        <Text style={styles.chipTextoActivo}>
                          {p.nombre} · {formatearCop(p.precioCop)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.etiqueta}>Estado</Text>
                  <View style={styles.chips}>
                    {ESTADOS_SUSCRIPCION.map((estado) => (
                      <Pressable
                        key={estado}
                        style={[styles.chip, styles.chipEstado]}
                        onPress={() =>
                          cambiarSuscripcion(
                            estado,
                            suscripcionDe(org.id)?.planId ?? null,
                            suscripcionDe(org.id)?.precioCop ?? null
                          )
                        }
                      >
                        <Text style={styles.chipTexto}>
                          {ETIQUETA_ESTADO_SUSCRIPCION[estado]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.ayuda}>
                  Selecciona una aseguradora para ver y cambiar su suscripción.
                </Text>
              )}
            </View>

            <View style={styles.lista}>
              {suscripciones.length === 0 ? (
                <Text style={styles.vacio}>Sin suscripciones registradas.</Text>
              ) : (
                suscripciones.map((s) => (
                  <View key={s.id} style={styles.tarjeta}>
                    <Text style={styles.tarjetaTitulo}>
                      {organizaciones.find((o) => o.id === s.orgId)?.nombre ?? s.orgId}
                    </Text>
                    <Text style={styles.tarjetaLinea}>
                      Estado: {ETIQUETA_ESTADO_SUSCRIPCION[s.estado]}
                    </Text>
                    <Text style={styles.tarjetaLinea}>
                      Valor: {formatearCop(s.precioCop)}
                    </Text>
                    <Text style={styles.tarjetaLinea}>
                      Vence: {s.vencimiento ?? '—'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}

        {seccion === 'planes' ? (
          <>
            <View style={styles.formulario}>
              <Text style={styles.formTitulo}>Nuevo plan</Text>

              <Text style={styles.etiqueta}>Nombre</Text>
              <TextInput
                style={styles.input}
                value={planNombre}
                onChangeText={setPlanNombre}
                placeholder="Plan Profesional"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.etiqueta}>Precio mensual (COP)</Text>
              <TextInput
                style={styles.input}
                value={planPrecio}
                onChangeText={setPlanPrecio}
                placeholder="250000"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
              />

              <Text style={styles.etiqueta}>Límite de vehículos (opcional)</Text>
              <TextInput
                style={styles.input}
                value={planLimite}
                onChangeText={setPlanLimite}
                placeholder="500"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
              />

              <BotonNitro
                titulo="Guardar plan"
                icono="save-outline"
                onPress={crearPlan}
                cargando={guardando}
                style={styles.botonForm}
              />
            </View>

            <View style={styles.lista}>
              {planes.length === 0 ? (
                <Text style={styles.vacio}>Todavía no hay planes creados.</Text>
              ) : (
                planes.map((p) => (
                  <View key={p.id} style={styles.tarjeta}>
                    <Text style={styles.tarjetaTitulo}>{p.nombre}</Text>
                    <Text style={styles.tarjetaPrima}>{formatearCop(p.precioCop)}</Text>
                    <Text style={styles.tarjetaLinea}>
                      {p.limiteVehiculos
                        ? `Hasta ${p.limiteVehiculos} vehículos`
                        : 'Sin límite de vehículos'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}

        {seccion === 'pagos' ? (
          <>
            <View style={styles.formulario}>
              <Text style={styles.formTitulo}>Registrar pago</Text>
              {renderSelectorOrg()}

              <Text style={styles.etiqueta}>Periodo</Text>
              <TextInput
                style={styles.input}
                value={periodo}
                onChangeText={setPeriodo}
                placeholder="2026-01"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.etiqueta}>Monto (COP)</Text>
              <TextInput
                style={styles.input}
                value={monto}
                onChangeText={setMonto}
                placeholder="250000"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
              />

              <BotonNitro
                titulo="Registrar"
                icono="add"
                onPress={crearPago}
                cargando={guardando}
                style={styles.botonForm}
              />
            </View>

            <View style={styles.lista}>
              {pagos.length === 0 ? (
                <Text style={styles.vacio}>Todavía no hay pagos registrados.</Text>
              ) : (
                pagos.map((p) => (
                  <View key={p.id} style={styles.tarjeta}>
                    <View style={styles.tarjetaCabecera}>
                      <Text style={styles.tarjetaTitulo}>
                        {organizaciones.find((o) => o.id === p.orgId)?.nombre ??
                          p.orgId}
                      </Text>
                      <View
                        style={[
                          styles.estado,
                          {
                            borderColor:
                              p.estado === 'pagado'
                                ? Paleta.exito
                                : Paleta.advertencia,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.estadoTexto,
                            {
                              color:
                                p.estado === 'pagado'
                                  ? Paleta.exito
                                  : Paleta.advertencia,
                            },
                          ]}
                        >
                          {p.estado === 'pagado' ? 'Pagado' : 'Pendiente'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.tarjetaLinea}>Periodo: {p.periodo}</Text>
                    <Text style={styles.tarjetaPrima}>{formatearCop(p.montoCop)}</Text>

                    {p.estado === 'pendiente' ? (
                      <Pressable
                        style={[styles.accion, { borderColor: Paleta.exito }]}
                        onPress={() => cobrar(p)}
                      >
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={16}
                          color={Paleta.exito}
                        />
                        <Text style={[styles.accionTexto, { color: Paleta.exito }]}>
                          Marcar pagado
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: Paleta.fondo },
  contenido: { paddingBottom: 44 },
  segmentos: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: -24,
  },
  segmento: {
    flex: 1,
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.suave,
    borderWidth: 2,
    borderColor: Paleta.tinta,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentoActivo: { backgroundColor: Paleta.tinta },
  segmentoTexto: { fontSize: 12.5, fontWeight: '900', color: Paleta.texto },
  segmentoTextoActivo: { color: Paleta.acento },
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
    fontSize: 17,
    fontWeight: '900',
    color: Paleta.texto,
    marginBottom: 6,
  },
  selector: { gap: 6, marginBottom: 6 },
  resumen: {
    fontSize: 13,
    fontWeight: '800',
    color: Paleta.primario,
    marginTop: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radios.pastilla,
    borderWidth: 1.5,
    borderColor: Paleta.borde,
    backgroundColor: Paleta.fondo,
    maxWidth: 240,
  },
  chipActivo: { backgroundColor: Paleta.primario, borderColor: Paleta.primario },
  chipOscuro: { backgroundColor: Paleta.tinta, borderColor: Paleta.tinta },
  chipEstado: { backgroundColor: Paleta.fondo },
  chipTexto: { fontSize: 12, fontWeight: '800', color: Paleta.textoSecundario },
  chipTextoActivo: { fontSize: 12, fontWeight: '800', color: Paleta.acento },
  etiqueta: {
    fontSize: 12,
    fontWeight: '800',
    color: Paleta.textoSecundario,
    marginTop: 10,
    marginBottom: 4,
  },
  ayuda: { fontSize: 12, color: Paleta.textoSuave, marginTop: 6 },
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
  botonForm: { marginTop: 16 },
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
  tarjetaLinea: { fontSize: 12.5, color: Paleta.textoSecundario },
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

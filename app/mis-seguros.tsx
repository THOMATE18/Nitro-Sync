import { useEffect, useMemo, useRef, useState } from 'react';

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

import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta } from '@/components/ui/confirm-dialog';
import ImagenVehiculo from '@/components/ui/imagen-vehiculo';
import {
  coloresEstado,
  Radios,
  sombraDura,
  type TipoPaleta,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import { useVehiculos } from '@/context/VehiculosContext';
import { ASEGURADORAS, buscarAseguradora } from '@/data/aseguradoras';
import { useLineaAtencion } from '@/hooks/use-linea-atencion';
import {
  crearCotizacion,
  suscribirMisCotizaciones,
} from '@/services/cotizaciones';
import { formatearCop } from '@/services/facturacion';
import { guardarTelefono, suscribirPerfil } from '@/services/perfil';
import {
  crearSolicitud,
  suscribirMisSolicitudes,
} from '@/services/solicitudes';
import {
  registrarPagoSeguro,
  suscribirPagosSegurosPropietario,
} from '@/services/pagosSeguros';
import {
  estadoSeguro,
  nombreAseguradora,
  textoVencimiento,
} from '@/utils/admin';
import {
  abrirEnlace,
  enlaceWhatsApp,
  esCelularValido,
  soloDigitos,
} from '@/utils/contacto';

import {
  ETIQUETA_ESTADO_COTIZACION,
  ETIQUETA_ESTADO_PAGO_SEGURO,
  ETIQUETA_METODO_PAGO,
  ETIQUETA_SIMULADO,
  type Cotizacion,
  type MetodoPagoSimulado,
  type PagoSeguro,
} from '@/types/negocio';
import type { Solicitud, Vehiculo } from '@/types/models';

export default function MisSegurosScreen() {
  const { user } = useAuth();
  const { vehiculos, cargando } = useVehiculos();
  const alerta = useAlerta();

  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [pagosSeguros, setPagosSeguros] = useState<PagoSeguro[]>([]);
  const [telefono, setTelefono] = useState('');
  const telefonoCargado = useRef(false);

  const [abierto, setAbierto] = useState<string | null>(null);
  /* Claves de las aseguradoras seleccionadas para cotizar. */
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [guardandoTelefono, setGuardandoTelefono] = useState(false);
  const [pagoAbierto, setPagoAbierto] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    const limpiarPerfil = suscribirPerfil(user.uid, (perfil) => {
      if (!telefonoCargado.current && perfil?.telefono) {
        telefonoCargado.current = true;
        setTelefono(perfil.telefono);
      }
    });

    const limpiarSolicitudes = suscribirMisSolicitudes(user.uid, setSolicitudes);
    const limpiarCotizaciones = suscribirMisCotizaciones(
      user.uid,
      setCotizaciones
    );
    const limpiarPagos = suscribirPagosSegurosPropietario(
      user.uid,
      setPagosSeguros
    );

    return () => {
      limpiarPerfil();
      limpiarSolicitudes();
      limpiarCotizaciones();
      limpiarPagos();
    };
  }, [user]);

  const porVehiculo = useMemo(() => {
    const mapa = new Map<string, Solicitud>();

    solicitudes.forEach((solicitud) => mapa.set(solicitud.vehiculoId, solicitud));

    return mapa;
  }, [solicitudes]);

  /* Cotizaciones agrupadas por vehículo para mostrar su estado. */
  const cotizacionesPorVehiculo = useMemo(() => {
    const mapa = new Map<string, Cotizacion[]>();

    cotizaciones.forEach((cotizacion) => {
      const lista = mapa.get(cotizacion.vehiculoId) ?? [];
      lista.push(cotizacion);
      mapa.set(cotizacion.vehiculoId, lista);
    });

    return mapa;
  }, [cotizaciones]);

  const alternarAseguradora = (clave: string) => {
    setSeleccionadas((actuales) =>
      actuales.includes(clave)
        ? actuales.filter((c) => c !== clave)
        : [...actuales, clave]
    );
  };

  const enviar = async (vehiculo: Vehiculo) => {
    if (!user) {
      return;
    }

    if (!esCelularValido(telefono)) {
      await alerta({
        titulo: 'Revisa tu WhatsApp',
        mensaje:
          'Escribe un celular colombiano de 10 dígitos que empiece por 3, para que el agente te pueda contactar.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setEnviando(true);

      const celular = soloDigitos(telefono);
      const elegidas = ASEGURADORAS.filter((a) =>
        seleccionadas.includes(a.clave)
      );

      await guardarTelefono(user.uid, celular);

      await crearSolicitud({
        uid: user.uid,
        email: user.email ?? '',
        vehiculoId: vehiculo.id,
        vehiculoNombre: vehiculo.nombre,
        placa: vehiculo.placa,
        tipoVehiculo: vehiculo.tipo,
        tipo: nombreAseguradora(vehiculo) ? 'Renovación' : 'Cotización',
        aseguradoraPreferida: elegidas.map((a) => a.nombre).join(', '),
        telefono: celular,
        nota: nota.trim(),
      });

      /*
      Además de la solicitud para el administrador, se crea una
      cotización por cada aseguradora elegida. La aseguradora solo
      verá las suyas (por `aseguradoraClave`).
      */
      await Promise.all(
        elegidas.map((aseguradora) =>
          crearCotizacion({
            uid: user.uid,
            email: user.email ?? '',
            vehiculoId: vehiculo.id,
            vehiculoNombre: vehiculo.nombre,
            placa: vehiculo.placa,
            tipoVehiculo: vehiculo.tipo,
            aseguradoraClave: aseguradora.clave,
            aseguradora: aseguradora.nombre,
            telefono: celular,
            nota: nota.trim(),
          })
        )
      );

      setAbierto(null);
      setNota('');
      setSeleccionadas([]);

      await alerta({
        titulo: 'Solicitud enviada',
        mensaje:
          elegidas.length > 0
            ? `Enviamos tu solicitud a ${elegidas.length} aseguradora(s). Te contactarán por WhatsApp.`
            : 'Un agente de seguros la verá y te contactará por WhatsApp.',
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo enviar',
        mensaje: 'Revisa tu conexión e inténtalo de nuevo.',
        tipo: 'error',
      });
    } finally {
      setEnviando(false);
    }
  };

  /*
  El teléfono del propietario se registra y se puede editar
  desde este perfil. `guardarTelefono` lo propaga a los
  vehículos y a las proyecciones que lee la aseguradora.
  */
  const guardarMiTelefono = async () => {
    if (!user) return;

    if (!esCelularValido(telefono)) {
      await alerta({
        titulo: 'Revisa tu teléfono',
        mensaje:
          'Escribe un celular colombiano de 10 dígitos que empiece por 3.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardandoTelefono(true);
      await guardarTelefono(user.uid, soloDigitos(telefono));
      await alerta({
        titulo: 'Teléfono actualizado',
        mensaje:
          'Tu aseguradora ya puede ver el nuevo número en tus vehículos vinculados.',
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo guardar',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setGuardandoTelefono(false);
    }
  };

  const nombreVehiculoPago = (id: string) => {
    const vehiculo = vehiculos.find((v) => v.id === id);
    return vehiculo
      ? `${vehiculo.nombre}${vehiculo.placa ? ` · ${vehiculo.placa}` : ''}`
      : id.slice(0, 8);
  };

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.tarjeta}>
          <Text style={styles.seccion}>Tu teléfono de contacto</Text>
          <Text style={styles.ayuda}>
            Lo usará tu aseguradora para contactarte. Guárdalo cuando lo cambies:
            se actualiza automáticamente en tus vehículos vinculados.
          </Text>
          <TextInput
            style={styles.input}
            value={telefono}
            onChangeText={setTelefono}
            placeholder="3001234567"
            placeholderTextColor={paleta.textoSuave}
            keyboardType="phone-pad"
            maxLength={13}
          />
          <BotonNitro
            titulo="Guardar teléfono"
            icono="save-outline"
            tamano="pequeno"
            onPress={guardarMiTelefono}
            cargando={guardandoTelefono}
          />
        </View>

        {/* Pagos simulados registrados por el cliente. */}
        <View style={styles.tarjeta}>
          <View style={styles.pagoCabecera}>
            <Text style={styles.seccion}>Pagos de tus seguros</Text>
            <View style={styles.simuladoPill}>
              <Text style={styles.simuladoTexto}>{ETIQUETA_SIMULADO}</Text>
            </View>
          </View>

          <Text style={styles.ayuda}>
            Registra aquí tus pagos simulados. La aseguradora los confirma o
            rechaza desde su panel; una vez respondidos son inmutables. No se ha
            cobrado ningún dinero.
          </Text>

          {pagosSeguros.length === 0 ? (
            <Text style={styles.ayuda}>No hay pagos registrados por ahora.</Text>
          ) : (
            pagosSeguros.map((pago) => (
              <View key={pago.id} style={styles.pagoFila}>
                <View style={styles.pagoTextos}>
                  <Text style={styles.pagoTitulo}>
                    {nombreVehiculoPago(pago.vehiculoId)}
                  </Text>
                  <Text style={styles.detalle}>
                    {pago.periodo} · {pago.producto}
                  </Text>
                  <Text style={styles.detalle}>
                    Ref. {pago.referencia ?? ETIQUETA_SIMULADO}
                  </Text>
                  <Text
                    style={[
                      styles.pagoEstado,
                      {
                        color:
                          pago.estado === 'confirmado'
                            ? paleta.textoExito
                            : pago.estado === 'rechazado'
                              ? paleta.textoPeligro
                              : paleta.textoAdvertencia,
                      },
                    ]}
                  >
                    {ETIQUETA_ESTADO_PAGO_SEGURO[pago.estado]}
                  </Text>
                </View>

                <View style={styles.pagoDerecha}>
                  <Text style={styles.pagoMonto}>
                    {formatearCop(pago.montoCop)}
                  </Text>
                  <Text style={styles.detalle}>
                    {pago.metodoPago
                      ? ETIQUETA_METODO_PAGO[pago.metodoPago]
                      : ETIQUETA_SIMULADO}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {!cargando && vehiculos.length === 0 && (
          <Text style={styles.vacio}>
            Registra un vehículo para ver y gestionar su seguro.
          </Text>
        )}

        {vehiculos.map((vehiculo) => {
          const aseguradora = nombreAseguradora(vehiculo);
          const marca = buscarAseguradora(aseguradora);
          const estado = estadoSeguro(vehiculo);
          const colorEstado =
            estado === 'Vigente' ||
            estado === 'Proximo a vencer' ||
            estado === 'Vencido'
              ? coloresEstado(paleta)[estado]
              : null;
          const solicitud = porVehiculo.get(vehiculo.id);
          const pendiente = solicitud?.estado === 'Pendiente';
          const atendida = solicitud?.estado === 'Atendida';
          const cotizacionesVehiculo =
            cotizacionesPorVehiculo.get(vehiculo.id) ?? [];
          const etiquetaBoton = aseguradora
            ? 'Solicitar renovación'
            : 'Solicitar cotización';

          return (
            <View key={vehiculo.id} style={styles.tarjeta}>
              <View style={styles.fila}>
                <ImagenVehiculo
                  uri={vehiculo.imagen}
                  tipo={vehiculo.tipo}
                  style={styles.imagen}
                />

                <View style={styles.cuerpo}>
                  <Text style={styles.nombre} numberOfLines={1}>
                    {vehiculo.nombre}
                  </Text>
                  <Text style={styles.detalle} numberOfLines={1}>
                    {vehiculo.year}
                    {vehiculo.placa ? ` • ${vehiculo.placa}` : ''}
                  </Text>

                  {aseguradora ? (
                    <View
                      style={[
                        styles.aseguradoraPill,
                        { backgroundColor: marca?.color ?? paleta.primario },
                      ]}
                    >
                      <Text
                        style={[
                          styles.aseguradoraTexto,
                          { color: marca?.colorTexto ?? paleta.blanco },
                        ]}
                      >
                        {aseguradora}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.aseguradoraPill, styles.sinSeguroPill]}>
                      <Text
                        style={[
                          styles.aseguradoraTexto,
                          { color: paleta.textoPeligro },
                        ]}
                      >
                        Sin seguro
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {aseguradora ? (
                <View style={styles.vencimientoFila}>
                  <Text style={styles.detalle}>
                    Póliza {vehiculo.numeroPoliza || '—'}
                  </Text>
                  {colorEstado && (
                    <View
                      style={[
                        styles.estadoPill,
                        {
                          backgroundColor: colorEstado.fondo,
                          borderColor: colorEstado.borde,
                        },
                      ]}
                    >
                      <Text style={[styles.estadoTexto, { color: colorEstado.texto }]}>
                        {textoVencimiento(vehiculo)}
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}

              {aseguradora ? (
                <LineaAtencionAseguradora
                  clave={marca?.clave ?? null}
                  nombre={aseguradora}
                />
              ) : null}

              {aseguradora ? (
                <View style={styles.formulario}>
                  <BotonNitro
                    titulo={
                      pagoAbierto === vehiculo.id
                        ? 'Ocultar formulario de pago'
                        : `Registrar pago (${ETIQUETA_SIMULADO})`
                    }
                    icono="cash-outline"
                    tamano="pequeno"
                    variante="secundario"
                    onPress={() =>
                      setPagoAbierto(
                        pagoAbierto === vehiculo.id ? null : vehiculo.id
                      )
                    }
                  />
                  {pagoAbierto === vehiculo.id ? (
                    <FormularioPagoSeguro
                      vehiculo={vehiculo}
                      onListo={() => setPagoAbierto(null)}
                    />
                  ) : null}
                </View>
              ) : null}

              {pendiente && (
                <View style={styles.aviso}>
                  <Ionicons name="time-outline" size={16} color={paleta.advertencia} />
                  <Text style={styles.avisoTexto}>
                    Solicitud de {solicitud?.tipo.toLowerCase()} enviada. Esperando al agente.
                  </Text>
                </View>
              )}

              {atendida && (
                <View style={[styles.aviso, styles.avisoExito]}>
                  <Ionicons name="checkmark-circle" size={16} color={paleta.exito} />
                  <Text style={[styles.avisoTexto, { color: paleta.textoExito }]}>
                    Tu última solicitud fue atendida.
                  </Text>
                </View>
              )}

              {cotizacionesVehiculo.length > 0 ? (
                <View style={styles.cotizaciones}>
                  <Text style={styles.cotizacionesTitulo}>
                    Cotizaciones enviadas
                  </Text>

                  {cotizacionesVehiculo.map((cotizacion) => (
                    <View key={cotizacion.id} style={styles.cotizacionFila}>
                      <Text style={styles.cotizacionNombre} numberOfLines={1}>
                        {cotizacion.aseguradora}
                      </Text>
                      <View style={styles.cotizacionEstado}>
                        <Text style={styles.cotizacionEstadoTexto}>
                          {ETIQUETA_ESTADO_COTIZACION[cotizacion.estado]}
                        </Text>
                        {cotizacion.primaCop ? (
                          <Text style={styles.cotizacionPrima}>
                            ${cotizacion.primaCop.toLocaleString('es-CO')}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {abierto === vehiculo.id ? (
                <View style={styles.formulario}>
                  <Text style={styles.etiqueta}>
                    Aseguradoras para cotizar (elige una o varias)
                  </Text>
                  <View style={styles.chips}>
                    {ASEGURADORAS.map((aseguradora) => {
                      const activo = seleccionadas.includes(aseguradora.clave);

                      return (
                        <Pressable
                          key={aseguradora.clave}
                          onPress={() => alternarAseguradora(aseguradora.clave)}
                          style={[styles.chip, activo && styles.chipActivo]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: activo }}
                        >
                          <Text
                            style={[
                              styles.chipTexto,
                              activo && styles.chipTextoActivo,
                            ]}
                          >
                            {aseguradora.nombre}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.etiqueta}>Nota para el agente (opcional)</Text>
                  <TextInput
                    style={[styles.input, styles.nota]}
                    value={nota}
                    onChangeText={setNota}
                    placeholder="Ej: quiero todo riesgo"
                    placeholderTextColor="#94A3B8"
                    multiline
                    maxLength={200}
                    textAlignVertical="top"
                  />

                  <BotonNitro
                    titulo="Enviar solicitud"
                    icono="send"
                    tamano="mediano"
                    onPress={() => enviar(vehiculo)}
                    cargando={enviando}
                  />

                  <BotonNitro
                    titulo="Cancelar"
                    variante="fantasma"
                    tamano="pequeno"
                    onPress={() => {
                      setAbierto(null);
                      setSeleccionadas([]);
                    }}
                  />
                </View>
              ) : (
                <BotonNitro
                  titulo={pendiente ? 'Solicitud enviada' : etiquetaBoton}
                  icono={pendiente ? 'checkmark' : 'shield-checkmark'}
                  tamano="mediano"
                  deshabilitado={pendiente}
                  onPress={() => {
                    setAbierto(vehiculo.id);
                    setNota('');
                    setSeleccionadas([]);
                  }}
                />
              )}
            </View>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/*
LÍNEA DE ATENCIÓN OFICIAL (SOLO LECTURA)

El número se lee en tiempo real de `organizations` en
Firestore. El botón de WhatsApp usa EXACTAMENTE el mismo
número que se muestra aquí; no hay números escritos a mano
en la pantalla.
*/
function LineaAtencionAseguradora({
  clave,
  nombre,
}: {
  clave: string | null;
  nombre: string;
}) {
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const { telefono, cargando } = useLineaAtencion(clave);
  const enlace = enlaceWhatsApp(
    telefono,
    `Hola ${nombre}, necesito información sobre mi seguro en Nitro Sync.`
  );

  return (
    <View style={styles.linea}>
      <View style={styles.lineaTextos}>
        <Text style={styles.lineaTitulo}>Línea de atención de {nombre}</Text>
        <Text style={styles.detalle} accessibilityLabel="Teléfono oficial">
          {cargando
            ? 'Consultando número oficial…'
            : telefono
              ? telefono
              : 'La aseguradora aún no ha registrado su línea de atención.'}
        </Text>
      </View>
      {enlace ? (
        <Pressable
          style={[styles.botonWhatsapp, { borderColor: paleta.exito }]}
          onPress={() => void abrirEnlace(enlace)}
          accessibilityRole="button"
          accessibilityLabel={`Abrir WhatsApp con ${nombre}`}
        >
          <Ionicons name="logo-whatsapp" size={18} color={paleta.exito} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* REGISTRO DE PAGO SIMULADO POR EL CLIENTE */
function FormularioPagoSeguro({
  vehiculo,
  onListo,
}: {
  vehiculo: Vehiculo;
  onListo: () => void;
}) {
  const { user } = useAuth();
  const alerta = useAlerta();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const aseguradora = nombreAseguradora(vehiculo);
  const clave = buscarAseguradora(aseguradora)?.clave ?? null;
  const { organizacion } = useLineaAtencion(clave);

  const [periodo, setPeriodo] = useState('');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('Pago de seguro');
  const [metodo, setMetodo] = useState<MetodoPagoSimulado>('transferencia');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);

  const registrar = async () => {
    if (!user || !organizacion) {
      await alerta({
        titulo: 'Aseguradora no disponible',
        mensaje:
          'No pudimos identificar la organización de esta aseguradora. Intenta de nuevo en unos segundos.',
        tipo: 'advertencia',
      });
      return;
    }

    const montoCop = Number(monto.replace(/[^\d]/g, ''));

    if (!periodo.trim() || !Number.isFinite(montoCop) || montoCop <= 0) {
      await alerta({
        titulo: 'Datos incompletos',
        mensaje: 'Escribe el periodo (ej. 2026-11) y un monto mayor a cero.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      await registrarPagoSeguro({
        orgId: organizacion.id,
        orgNombre: organizacion.nombre,
        vehiculoId: vehiculo.id,
        propietarioUid: user.uid,
        clienteNombre: user.email?.split('@')[0] ?? 'Cliente',
        polizaId: null,
        producto: aseguradora || 'Seguro de vehículo',
        concepto: concepto.trim() || 'Pago de seguro',
        periodo: periodo.trim(),
        montoCop,
        metodoPago: metodo,
        fechaOperacion: fecha,
        registradoPor: user.uid,
      });

      await alerta({
        titulo: `Pago registrado (${ETIQUETA_SIMULADO})`,
        mensaje:
          'Queda PENDIENTE de que la aseguradora lo confirme o rechace. No se ha cobrado ningún dinero.',
        tipo: 'exito',
      });

      setPeriodo('');
      setMonto('');
      onListo();
    } catch (error) {
      await alerta({
        titulo: 'No se pudo registrar',
        mensaje:
          error instanceof Error ? error.message : 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View style={styles.formularioPago}>
      <Text style={styles.etiqueta}>Periodo</Text>
      <TextInput
        style={styles.input}
        value={periodo}
        onChangeText={setPeriodo}
        placeholder="2026-11"
        placeholderTextColor={paleta.textoSuave}
      />

      <Text style={styles.etiqueta}>Monto (COP)</Text>
      <TextInput
        style={styles.input}
        value={monto}
        onChangeText={setMonto}
        placeholder="343300"
        placeholderTextColor={paleta.textoSuave}
        keyboardType="numeric"
      />

      <Text style={styles.etiqueta}>Concepto</Text>
      <TextInput
        style={styles.input}
        value={concepto}
        onChangeText={setConcepto}
        placeholder="Pago de seguro"
        placeholderTextColor={paleta.textoSuave}
      />

      <Text style={styles.etiqueta}>Método (simulado)</Text>
      <View style={styles.chips}>
        {(
          ['transferencia', 'efectivo', 'tarjeta', 'otro'] as MetodoPagoSimulado[]
        ).map((opcion) => (
          <Pressable
            key={opcion}
            onPress={() => setMetodo(opcion)}
            style={[styles.chip, metodo === opcion && styles.chipActivo]}
            accessibilityRole="button"
            accessibilityState={{ selected: metodo === opcion }}
          >
            <Text style={[styles.chipTexto, metodo === opcion && styles.chipTextoActivo]}>
              {ETIQUETA_METODO_PAGO[opcion]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.etiqueta}>Fecha de la operación</Text>
      <TextInput
        style={styles.input}
        value={fecha}
        onChangeText={setFecha}
        placeholder="AAAA-MM-DD"
        placeholderTextColor={paleta.textoSuave}
      />

      <BotonNitro
        titulo={`Enviar pago (${ETIQUETA_SIMULADO})`}
        icono="send"
        tamano="pequeno"
        onPress={registrar}
        cargando={guardando}
      />
    </View>
  );
}

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: Paleta.fondo },
  contenido: { padding: 16, gap: 16, paddingBottom: 40 },
  vacio: { textAlign: 'center', color: Paleta.textoSecundario, marginTop: 20 },
  tarjeta: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    padding: 16,
    gap: 10,
    ...sombraDura(4, 4),
  },
  seccion: { fontSize: 16, fontWeight: '900', color: Paleta.texto },
  ayuda: { fontSize: 12, color: Paleta.textoSecundario },
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
  nota: { height: 80, paddingTop: 12 },
  fila: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  imagen: { width: 72, height: 72, borderRadius: 14 },
  cuerpo: { flex: 1, gap: 4 },
  nombre: { fontSize: 16, fontWeight: '800', color: Paleta.texto },
  detalle: { fontSize: 12, color: Paleta.textoSecundario },
  aseguradoraPill: {
    alignSelf: 'flex-start',
    borderRadius: Radios.pastilla,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  sinSeguroPill: { backgroundColor: Paleta.peligroFondo },
  aseguradoraTexto: { fontSize: 12, fontWeight: '800' },
  vencimientoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  estadoPill: {
    borderWidth: 1,
    borderRadius: Radios.pastilla,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  estadoTexto: { fontSize: 11, fontWeight: '800' },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Paleta.advertenciaFondo,
    borderRadius: Radios.suave,
    padding: 10,
  },
  avisoExito: { backgroundColor: Paleta.exitoFondo },
  avisoTexto: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: Paleta.textoAdvertencia,
  },
  formulario: { gap: 10 },
  etiqueta: { fontSize: 13, fontWeight: '700', color: Paleta.textoSecundario },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radios.pastilla,
    backgroundColor: Paleta.fondo,
    borderWidth: 1.5,
    borderColor: Paleta.borde,
  },
  chipActivo: { backgroundColor: Paleta.primario, borderColor: Paleta.bordeDuro },
  chipTexto: { fontSize: 12, fontWeight: '800', color: Paleta.textoSecundario },
  chipTextoActivo: { color: Paleta.blanco },
  cotizaciones: {
    backgroundColor: Paleta.fondo,
    borderRadius: Radios.suave,
    padding: 12,
    gap: 8,
  },
  cotizacionesTitulo: {
    fontSize: 12,
    fontWeight: '900',
    color: Paleta.textoSecundario,
    letterSpacing: 0.3,
  },
  cotizacionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cotizacionNombre: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Paleta.texto,
  },
  cotizacionEstado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cotizacionEstadoTexto: {
    fontSize: 11,
    fontWeight: '800',
    color: Paleta.primario,
  },
  cotizacionPrima: { fontSize: 12, fontWeight: '900', color: Paleta.texto },

  /* F7 · pagos simulados */
  pagoCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  simuladoPill: {
    backgroundColor: Paleta.primarioClaro,
    borderRadius: Radios.pastilla,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  simuladoTexto: {
    fontSize: 10,
    fontWeight: '900',
    color: Paleta.primario,
  },
  pagoFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Paleta.borde,
  },
  pagoTextos: { flex: 1, gap: 2 },
  pagoTitulo: { fontSize: 13.5, fontWeight: '900', color: Paleta.texto },
  pagoEstado: { fontSize: 11, fontWeight: '900', marginTop: 2 },
  pagoDerecha: { alignItems: 'flex-end', gap: 8 },
  pagoMonto: { fontSize: 13, fontWeight: '900', color: Paleta.texto },
  pagoBotones: { flexDirection: 'row', gap: 8 },
  botonPago: {
    width: 32,
    height: 32,
    borderRadius: Radios.suave,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Línea de atención oficial y registro de pagos del cliente */
  linea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Paleta.fondo,
    borderWidth: 1,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    padding: 10,
  },
  lineaTextos: { flex: 1, gap: 2 },
  lineaTitulo: { fontSize: 12, fontWeight: '900', color: Paleta.texto },
  botonWhatsapp: {
    width: 40,
    height: 40,
    borderRadius: Radios.suave,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formularioPago: {
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Paleta.borde,
  },
});

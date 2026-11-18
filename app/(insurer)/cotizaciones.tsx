/*
=======================================================
NITRO SYNC - PANEL ASEGURADORA · COTIZACIONES
=======================================================

Bandeja de cotizaciones que los propietarios envían a ESTA
aseguradora (colección `cotizaciones`, filtrada por
`aseguradoraClave`). La aseguradora solo ve las suyas.

Cada cotización pasa por los estados:

  nueva -> contactada -> cotizada -> cerrada

Acciones:

  - Contactar por WhatsApp / Llamar al propietario.
  - Marcar contactada.
  - Cotizar (registra la prima en COP).
  - Cerrar.

Todo queda en auditoría.
=======================================================
*/

import { useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import BotonNitro from '@/components/ui/boton-nitro';
import Buscador from '@/components/ui/buscador';
import ChipsFiltro from '@/components/aseguradora/chips-filtro';
import { useAlerta } from '@/components/ui/confirm-dialog';
import { claveAseguradora } from '@/data/aseguradoras';
import { registrarAuditoria } from '@/services/auditoria';
import {
  actualizarCotizacion,
  suscribirCotizacionesAseguradora,
} from '@/services/cotizaciones';
import { formatearCop } from '@/services/facturacion';
import { enlaceLlamada, enlaceWhatsApp } from '@/utils/contacto';
import { clasificarErrorFirestore } from '@/utils/errorFirestore';
import {
  ETIQUETA_ESTADO_COTIZACION,
  type Cotizacion,
  type EstadoCotizacion,
} from '@/types/negocio';

type Filtro = 'todas' | EstadoCotizacion;

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'nueva', etiqueta: 'Nuevas' },
  { id: 'contactada', etiqueta: 'Contactadas' },
  { id: 'cotizada', etiqueta: 'Cotizadas' },
  { id: 'cerrada', etiqueta: 'Cerradas' },
];

function colorEstado(Paleta: TipoPaleta, estado: EstadoCotizacion) {
  switch (estado) {
    case 'nueva':
      return Paleta.advertencia;
    case 'contactada':
      return Paleta.primario;
    case 'cotizada':
      return Paleta.exito;
    default:
      return Paleta.textoSuave;
  }
}

export default function CotizacionesAseguradora() {
  const { user, orgId, organizacion } = useAuth();
  const alerta = useAlerta();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const clave =
    organizacion?.aseguradoraClave || claveAseguradora(organizacion?.nombre ?? '');

  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busqueda, setBusqueda] = useState('');

  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cotizando, setCotizando] = useState<string | null>(null);
  const [prima, setPrima] = useState('');

  useEffect(() => {
    if (!clave) {
      return;
    }

    return suscribirCotizacionesAseguradora(
      clave,
      (lista) => {
        setCotizaciones(lista);
        setError(null);
        setCargando(false);
      },
      (err) => {
        /* El error real de Firestore queda en consola para depurar. */
        console.error(
          '[aseguradora] Error al leer las cotizaciones por aseguradoraClave:',
          err
        );
        setError(clasificarErrorFirestore(err).mensaje);
        setCargando(false);
      }
    );
  }, [clave]);

  const contadores = useMemo(() => {
    const base: Record<Filtro, number> = {
      todas: cotizaciones.length,
      nueva: 0,
      contactada: 0,
      cotizada: 0,
      cerrada: 0,
    };

    cotizaciones.forEach((c) => {
      base[c.estado] += 1;
    });

    return base;
  }, [cotizaciones]);

  const lista = useMemo(() => {
    const buscado = busqueda.trim().toLowerCase();

    return cotizaciones.filter((c) => {
      if (filtro !== 'todas' && c.estado !== filtro) return false;

      if (!buscado) return true;

      return [c.vehiculoNombre, c.placa, c.email, c.aseguradora]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(buscado));
    });
  }, [cotizaciones, filtro, busqueda]);

  const auditar = (accion: string, cotizacion: Cotizacion, detalle: Record<string, string | number | null> = {}) => {
    if (!user) return;

    void registrarAuditoria({
      actorUid: user.uid,
      actorCorreo: user.email,
      actorRol: 'insurer_admin',
      orgId,
      accion,
      entidad: 'cotizaciones',
      entidadId: cotizacion.id,
      detalle: { placa: cotizacion.placa, propietarioUid: cotizacion.uid, ...detalle },
    });
  };

  const whatsapp = (cotizacion: Cotizacion) => {
    const mensaje = `Hola, soy tu aseguradora ${
      organizacion?.nombre ?? ''
    } en Nitro Sync. Recibí tu solicitud de cotización para tu ${
      cotizacion.vehiculoNombre
    }${cotizacion.placa ? ` (${cotizacion.placa})` : ''}. ¿Te ayudo?`;

    const enlace = enlaceWhatsApp(cotizacion.telefono, mensaje);

    if (!enlace) return;

    auditar('cotizacion.contactar', cotizacion);
    Linking.openURL(enlace);
  };

  const llamar = (cotizacion: Cotizacion) => {
    const enlace = enlaceLlamada(cotizacion.telefono);

    if (!enlace) return;

    auditar('cotizacion.llamar', cotizacion);
    Linking.openURL(enlace);
  };

  const cambiarEstado = async (
    cotizacion: Cotizacion,
    estado: EstadoCotizacion,
    primaCop: number | null = cotizacion.primaCop
  ) => {
    if (!user) return;

    try {
      setOcupado(cotizacion.id);

      await actualizarCotizacion(cotizacion.id, {
        estado,
        primaCop,
        atendidaPor: user.uid,
      });

      auditar('cotizacion.estado', cotizacion, { estado, primaCop });

      setCotizando(null);
      setPrima('');
    } catch {
      await alerta({
        titulo: 'No se pudo actualizar',
        mensaje: 'Revisa tu conexión e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  const guardarCotizacion = async (cotizacion: Cotizacion) => {
    const valor = Number(prima.replace(/[^\d]/g, ''));

    if (!valor) {
      await alerta({
        titulo: 'Falta la prima',
        mensaje: 'Escribe el valor cotizado en pesos.',
        tipo: 'advertencia',
      });
      return;
    }

    await cambiarEstado(cotizacion, 'cotizada', valor);
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
        <EncabezadoPanel
          etiqueta="PANEL DE ASEGURADORA"
          titulo="Cotizaciones"
          subtitulo={organizacion?.nombre ?? null}
          icono="mail-unread"
        />

        <View style={styles.filtros}>
          <Buscador
            valor={busqueda}
            onCambiar={setBusqueda}
            placeholder="Buscar por placa, vehículo o correo"
          />

          <ChipsFiltro
            opciones={FILTROS.map((f) => ({ ...f, contador: contadores[f.id] }))}
            activo={filtro}
            onCambiar={setFiltro}
          />
        </View>

        {!clave ? (
          <Text style={styles.vacio}>
            No pudimos identificar tu aseguradora. Verifica el nombre de la
            organización o contacta al soporte de Nitro Sync.
          </Text>
        ) : cargando ? (
          <ActivityIndicator
            size="large"
            color={paleta.primario}
            style={styles.cargando}
          />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : lista.length === 0 ? (
          <View style={styles.vacioCentro}>
            <Ionicons name="mail-outline" size={44} color={paleta.textoSuave} />
            <Text style={styles.vacioTitulo}>
              {cotizaciones.length === 0
                ? 'Aún no tienes cotizaciones'
                : 'Sin resultados'}
            </Text>
            <Text style={styles.vacioTexto}>
              {cotizaciones.length === 0
                ? 'Cuando un propietario te pida una cotización, aparecerá aquí.'
                : 'Prueba con otro filtro o cambia la búsqueda.'}
            </Text>
          </View>
        ) : (
          <View style={styles.lista}>
            {lista.map((c) => {
              const color = colorEstado(paleta, c.estado);
              const enProceso = ocupado === c.id;
              const abriendoCotizar = cotizando === c.id;

              return (
                <View key={c.id} style={styles.tarjeta}>
                  <View style={styles.tarjetaCabecera}>
                    <Text style={styles.tarjetaTitulo} numberOfLines={1}>
                      {c.vehiculoNombre || 'Vehículo'}
                    </Text>
                    <View style={[styles.estado, { borderColor: color }]}>
                      <Text style={[styles.estadoTexto, { color }]}>
                        {ETIQUETA_ESTADO_COTIZACION[c.estado]}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.linea}>
                    {c.tipoVehiculo}
                    {c.placa ? ` · ${c.placa}` : ''}
                  </Text>
                  <Text style={styles.linea}>{c.email}</Text>
                  <Text style={styles.linea}>
                    WhatsApp: {c.telefono || 'Sin registrar'}
                  </Text>
                  {c.nota ? <Text style={styles.nota}>“{c.nota}”</Text> : null}
                  <Text style={styles.fecha}>Enviada el {c.fecha}</Text>

                  {c.primaCop ? (
                    <Text style={styles.prima}>
                      Prima cotizada: {formatearCop(c.primaCop)}
                    </Text>
                  ) : null}

                  {abriendoCotizar ? (
                    <View style={styles.formCotizar}>
                      <Text style={styles.etiqueta}>Prima cotizada (COP)</Text>
                      <TextInput
                        style={styles.input}
                        value={prima}
                        onChangeText={setPrima}
                        placeholder="850000"
                        placeholderTextColor={paleta.textoSuave}
                        keyboardType="numeric"
                        autoFocus
                      />

                      <View style={styles.accionesFila}>
                        <BotonNitro
                          titulo="Guardar cotización"
                          icono="save-outline"
                          tamano="pequeno"
                          cargando={enProceso}
                          onPress={() => guardarCotizacion(c)}
                          style={styles.botonMitad}
                        />
                        <BotonNitro
                          titulo="Cancelar"
                          variante="fantasma"
                          tamano="pequeno"
                          onPress={() => {
                            setCotizando(null);
                            setPrima('');
                          }}
                          style={styles.botonMitad}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.accionesFila}>
                      <BotonNitro
                        titulo="WhatsApp"
                        icono="logo-whatsapp"
                        variante="secundario"
                        tamano="pequeno"
                        deshabilitado={!c.telefono}
                        onPress={() => whatsapp(c)}
                        style={styles.botonTercio}
                      />

                      <BotonNitro
                        titulo="Llamar"
                        icono="call"
                        variante="secundario"
                        tamano="pequeno"
                        deshabilitado={!c.telefono}
                        onPress={() => llamar(c)}
                        style={styles.botonTercio}
                      />

                      {c.estado === 'nueva' ? (
                        <BotonNitro
                          titulo="Contactada"
                          icono="checkmark"
                          tamano="pequeno"
                          cargando={enProceso}
                          onPress={() => cambiarEstado(c, 'contactada')}
                          style={styles.botonTercio}
                        />
                      ) : null}

                      {c.estado === 'contactada' ? (
                        <BotonNitro
                          titulo="Cotizar"
                          icono="pricetag"
                          tamano="pequeno"
                          cargando={enProceso}
                          onPress={() => {
                            setCotizando(c.id);
                            setPrima('');
                          }}
                          style={styles.botonTercio}
                        />
                      ) : null}

                      {c.estado === 'cotizada' ? (
                        <BotonNitro
                          titulo="Cerrar"
                          icono="lock-closed-outline"
                          variante="secundario"
                          tamano="pequeno"
                          cargando={enProceso}
                          onPress={() => cambiarEstado(c, 'cerrada')}
                          style={styles.botonTercio}
                        />
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    pantalla: { flex: 1, backgroundColor: Paleta.fondo },
    contenido: { paddingBottom: 44 },
    filtros: {
      paddingHorizontal: 16,
      marginTop: -24,
      gap: 10,
    },
    cargando: { marginTop: 40 },
    error: {
      margin: 16,
      padding: 12,
      borderRadius: Radios.suave,
      backgroundColor: Paleta.peligroFondo,
      color: Paleta.textoPeligro,
      fontSize: 13,
    },
    vacio: {
      textAlign: 'center',
      color: Paleta.textoSecundario,
      marginTop: 30,
      marginHorizontal: 24,
      fontSize: 14,
      lineHeight: 20,
    },
    vacioCentro: {
      alignItems: 'center',
      marginTop: 60,
      gap: 8,
      paddingHorizontal: 30,
    },
    vacioTitulo: { fontSize: 17, fontWeight: '900', color: Paleta.texto },
    vacioTexto: {
      fontSize: 13,
      color: Paleta.textoSecundario,
      textAlign: 'center',
      lineHeight: 19,
    },
    lista: { padding: 16, gap: 12 },
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
      fontSize: 15.5,
      fontWeight: '900',
      color: Paleta.texto,
      flexShrink: 1,
    },
    estado: {
      borderWidth: 1.5,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    estadoTexto: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
    linea: { fontSize: 12.5, color: Paleta.textoSecundario },
    nota: {
      fontSize: 13,
      fontStyle: 'italic',
      color: Paleta.texto,
      marginTop: 2,
    },
    fecha: { fontSize: 11, color: Paleta.textoSuave, marginTop: 2 },
    prima: {
      fontSize: 13,
      fontWeight: '900',
      color: Paleta.texto,
      marginTop: 4,
    },
    accionesFila: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    botonMitad: { flexGrow: 1, flexBasis: 130 },
    botonTercio: { flexGrow: 1, flexBasis: 96 },
    formCotizar: { gap: 6, marginTop: 8 },
    etiqueta: {
      fontSize: 12,
      fontWeight: '800',
      color: Paleta.textoSecundario,
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
  });

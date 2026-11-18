/*
=======================================================
NITRO SYNC - PANEL DE PLATAFORMA · ASEGURADORAS
=======================================================

Administra las organizaciones (aseguradoras):

  - cambiar estado: pendiente / activa / suspendida.
  - habilitar o bloquear el acceso a los datos.
  - ver datos de contacto.

Cambiar el estado o el acceso impacta de inmediato las
reglas de Firestore: una organización suspendida o con el
acceso bloqueado pierde la lectura de los datos de negocio.
=======================================================
*/

import { useEffect, useMemo, useState } from 'react';

import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import BotonNitro from '@/components/ui/boton-nitro';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import { useAlerta, useConfirm } from '@/components/ui/confirm-dialog';
import { claveAseguradora, normalizarClave } from '@/data/aseguradoras';
import { sincronizarAseguradoraClave } from '@/services/admin';
import {
  actualizarOrganizacion,
  suscribirOrganizaciones,
} from '@/services/organizaciones';
import { registrarAuditoria } from '@/services/auditoria';
import {
  ETIQUETA_ESTADO_ORG,
  type EstadoOrganizacion,
  type Organizacion,
} from '@/types/negocio';

type Filtro = 'todas' | EstadoOrganizacion;

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'active', etiqueta: 'Activas' },
  { id: 'pending', etiqueta: 'Pendientes' },
  { id: 'suspended', etiqueta: 'Suspendidas' },
];

function colorEstado(Paleta: TipoPaleta, estado: EstadoOrganizacion) {
  switch (estado) {
    case 'active':
      return Paleta.exito;
    case 'suspended':
      return Paleta.peligro;
    default:
      return Paleta.advertencia;
  }
}

export default function AseguradorasAdmin() {
  const { user } = useAuth();
  const alerta = useAlerta();
  const confirmar = useConfirm();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [ocupado, setOcupado] = useState<string | null>(null);

  /* Editor en línea de la clave de aseguradora. */
  const [claveEditando, setClaveEditando] = useState<string | null>(null);
  const [claveTexto, setClaveTexto] = useState('');

  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    return suscribirOrganizaciones(
      setOrganizaciones,
      () =>
        alerta({
          titulo: 'No se pudieron cargar',
          mensaje: 'Revisa tu conexión e intenta de nuevo.',
          tipo: 'error',
        })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lista = useMemo(
    () =>
      filtro === 'todas'
        ? organizaciones
        : organizaciones.filter((o) => o.estado === filtro),
    [organizaciones, filtro]
  );

  const auditar = async (accion: string, org: Organizacion, detalle: Record<string, string | boolean>) => {
    if (!user) return;

    await registrarAuditoria({
      actorUid: user.uid,
      actorCorreo: user.email,
      actorRol: 'super_admin',
      orgId: org.id,
      accion,
      entidad: 'organizations',
      entidadId: org.id,
      detalle,
    });
  };

  const cambiarEstado = async (org: Organizacion, estado: EstadoOrganizacion) => {
    const etiqueta = ETIQUETA_ESTADO_ORG[estado];

    const ok = await confirmar({
      titulo: `Marcar como ${etiqueta.toLowerCase()}`,
      mensaje: `¿Cambiar el estado de ${org.nombre} a "${etiqueta}"?`,
      textoConfirmar: etiqueta,
      icono: 'swap-horizontal-outline',
      peligro: estado === 'suspended',
    });

    if (!ok) return;

    try {
      setOcupado(org.id);
      await actualizarOrganizacion(org.id, { estado });
      await auditar('organizacion.estado', org, { estado });
    } catch {
      await alerta({
        titulo: 'No se pudo actualizar',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  const alternarAcceso = async (org: Organizacion) => {
    const habilitar = !org.accesoHabilitado;

    const ok = await confirmar({
      titulo: habilitar ? 'Habilitar acceso' : 'Bloquear acceso',
      mensaje: habilitar
        ? `¿Devolver el acceso a los datos a ${org.nombre}?`
        : `${org.nombre} dejará de leer vehículos, pólizas y avisos.`,
      textoConfirmar: habilitar ? 'Habilitar' : 'Bloquear',
      icono: habilitar ? 'lock-open-outline' : 'lock-closed-outline',
      peligro: !habilitar,
    });

    if (!ok) return;

    try {
      setOcupado(org.id);
      await actualizarOrganizacion(org.id, { accesoHabilitado: habilitar });
      await auditar('organizacion.acceso', org, { accesoHabilitado: habilitar });
    } catch {
      await alerta({
        titulo: 'No se pudo actualizar',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  const abrirClave = (org: Organizacion) => {
    setClaveEditando(org.id);
    setClaveTexto(org.aseguradoraClave ?? claveAseguradora(org.nombre));
  };

  const guardarClave = async (org: Organizacion) => {
    const clave = normalizarClave(claveTexto);

    if (!clave) {
      await alerta({
        titulo: 'Clave vacía',
        mensaje: 'Escribe una clave válida (letras, números y guion bajo).',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setOcupado(org.id);
      await actualizarOrganizacion(org.id, { aseguradoraClave: clave });
      await auditar('organizacion.clave', org, { aseguradoraClave: clave });
      setClaveEditando(null);
    } catch {
      await alerta({
        titulo: 'No se pudo actualizar',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  const sincronizar = async () => {
    const ok = await confirmar({
      titulo: 'Sincronizar clave de aseguradora',
      mensaje:
        'Se recalcula la clave de cada vehículo a partir de su aseguradora. Solo cambia ese campo y es seguro repetirlo.',
      textoConfirmar: 'Sincronizar',
      icono: 'sync-outline',
    });

    if (!ok) return;

    try {
      setSincronizando(true);

      const { revisados, actualizados } = await sincronizarAseguradoraClave();

      await alerta({
        titulo: 'Sincronización completa',
        mensaje: `${revisados} vehículo(s) revisado(s), ${actualizados} actualizado(s).`,
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo sincronizar',
        mensaje: 'Revisa tu conexión y las reglas de Firestore.',
        tipo: 'error',
      });
    } finally {
      setSincronizando(false);
    }
  };

  const renderTarjeta = ({ item }: { item: Organizacion }) => (    <View style={styles.tarjeta}>
      <View style={styles.tarjetaCabecera}>
        <View style={styles.tarjetaTextos}>
          <Text style={styles.nombre} numberOfLines={1}>
            {item.nombre}
          </Text>
          <Text style={styles.correo} numberOfLines={1}>
            {item.correo ?? 'Sin correo'}
          </Text>
        </View>

        <View style={[styles.estado, { borderColor: colorEstado(paleta, item.estado) }]}>
          <Text style={[styles.estadoTexto, { color: colorEstado(paleta, item.estado) }]}>
            {ETIQUETA_ESTADO_ORG[item.estado]}
          </Text>
        </View>
      </View>

      <View style={styles.datosFila}>
        <Ionicons
          name={item.accesoHabilitado ? 'lock-open-outline' : 'lock-closed-outline'}
          size={14}
          color={item.accesoHabilitado ? paleta.exito : paleta.peligro}
        />
        <Text style={styles.datosTexto}>
          Acceso {item.accesoHabilitado ? 'habilitado' : 'bloqueado'}
        </Text>
      </View>

      <View style={styles.datosFila}>
        <Ionicons name="key-outline" size={14} color={paleta.textoSecundario} />
        <Text style={styles.datosTexto}>
          Clave: {item.aseguradoraClave || 'sin asignar'}
        </Text>
      </View>

      {claveEditando === item.id ? (
        <View style={styles.editorClave}>
          <TextInput
            style={styles.inputClave}
            value={claveTexto}
            onChangeText={setClaveTexto}
            placeholder="Ej: sura, axa_colpatria"
            placeholderTextColor={paleta.textoSuave}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.acciones}>
            <Pressable
              style={[styles.accion, { borderColor: paleta.exito }]}
              onPress={() => guardarClave(item)}
              disabled={ocupado === item.id}
            >
              <Ionicons name="checkmark" size={16} color={paleta.exito} />
              <Text style={[styles.accionTexto, { color: paleta.exito }]}>
                Guardar
              </Text>
            </Pressable>

            <Pressable
              style={[styles.accion, { borderColor: paleta.borde }]}
              onPress={() => setClaveEditando(null)}
              disabled={ocupado === item.id}
            >
              <Ionicons name="close" size={16} color={paleta.textoSecundario} />
              <Text style={[styles.accionTexto, { color: paleta.textoSecundario }]}>
                Cancelar
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {item.especialidad ? (
        <Text style={styles.datosTexto}>{item.especialidad}</Text>
      ) : null}

      <View style={styles.acciones}>
        <Pressable
          style={[styles.accion, { borderColor: paleta.primario }]}
          onPress={() => abrirClave(item)}
          disabled={ocupado === item.id}
        >
          <Ionicons name="key-outline" size={16} color={paleta.primario} />
          <Text style={[styles.accionTexto, { color: paleta.primario }]}>
            Clave
          </Text>
        </Pressable>
        {item.estado !== 'active' ? (
          <Pressable
            style={[styles.accion, { borderColor: paleta.exito }]}
            onPress={() => cambiarEstado(item, 'active')}
            disabled={ocupado === item.id}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={paleta.exito} />
            <Text style={[styles.accionTexto, { color: paleta.exito }]}>
              Activar
            </Text>
          </Pressable>
        ) : null}

        {item.estado !== 'suspended' ? (
          <Pressable
            style={[styles.accion, { borderColor: paleta.peligro }]}
            onPress={() => cambiarEstado(item, 'suspended')}
            disabled={ocupado === item.id}
          >
            <Ionicons name="ban-outline" size={16} color={paleta.peligro} />
            <Text style={[styles.accionTexto, { color: paleta.peligro }]}>
              Suspender
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[
            styles.accion,
            { borderColor: item.accesoHabilitado ? paleta.advertencia : paleta.exito },
          ]}
          onPress={() => alternarAcceso(item)}
          disabled={ocupado === item.id}
        >
          <Ionicons
            name={item.accesoHabilitado ? 'lock-closed-outline' : 'lock-open-outline'}
            size={16}
            color={item.accesoHabilitado ? paleta.advertencia : paleta.exito}
          />
          <Text
            style={[
              styles.accionTexto,
              { color: item.accesoHabilitado ? paleta.advertencia : paleta.exito },
            ]}
          >
            {item.accesoHabilitado ? 'Bloquear' : 'Habilitar'}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.pantalla}>
      <EncabezadoPanel
        etiqueta="PANEL DE PLATAFORMA"
        titulo="Aseguradoras"
        subtitulo={`${organizaciones.length} organización(es)`}
        icono="business"
      />

      <View style={styles.filtros}>
        {FILTROS.map((f) => (
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

      <View style={styles.syncFila}>
        <BotonNitro
          titulo="Sincronizar aseguradoraClave"
          icono="sync-outline"
          variante="secundario"
          tamano="pequeno"
          onPress={sincronizar}
          cargando={sincronizando}
          anchoCompleto
        />
      </View>

      <FlatList
        data={lista}
        keyExtractor={(item) => item.id}
        renderItem={renderTarjeta}
        contentContainerStyle={styles.lista}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons name="business-outline" size={44} color={paleta.textoSuave} />
            <Text style={styles.vacioTitulo}>Sin aseguradoras</Text>
            <Text style={styles.vacioTexto}>
              No hay organizaciones que coincidan con el filtro.
            </Text>
          </View>
        }
      />
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
    syncFila: { paddingHorizontal: 16, marginTop: 12 },
    lista: { padding: 16, gap: 12, paddingBottom: 40 },
    tarjeta: {
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.tarjeta,
      padding: 16,
      gap: 8,
      ...Sombras.suave,
    },
    tarjetaCabecera: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    tarjetaTextos: { flex: 1 },
    nombre: { fontSize: 15.5, fontWeight: '900', color: Paleta.texto },
    correo: { fontSize: 12, color: Paleta.textoSecundario, marginTop: 2 },
    estado: {
      borderWidth: 1.5,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    estadoTexto: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
    datosFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    datosTexto: { fontSize: 12.5, color: Paleta.textoSecundario, flexShrink: 1 },
    editorClave: { gap: 8, marginTop: 4 },
    inputClave: {
      backgroundColor: Paleta.fondo,
      borderWidth: 1,
      borderColor: Paleta.borde,
      borderRadius: Radios.suave,
      paddingHorizontal: 12,
      height: 44,
      fontSize: 14,
      color: Paleta.texto,
    },
    acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
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
    vacio: { alignItems: 'center', marginTop: 60, gap: 8, paddingHorizontal: 30 },
    vacioTitulo: { fontSize: 17, fontWeight: '900', color: Paleta.texto },
    vacioTexto: {
      fontSize: 13,
      color: Paleta.textoSecundario,
      textAlign: 'center',
      lineHeight: 19,
    },
  });

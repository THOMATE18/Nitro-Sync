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
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Paleta, Radios, Sombras } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import { useAlerta, useConfirm } from '@/components/ui/confirm-dialog';
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

function colorEstado(estado: EstadoOrganizacion) {
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

  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [ocupado, setOcupado] = useState<string | null>(null);

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

  const renderTarjeta = ({ item }: { item: Organizacion }) => (
    <View style={styles.tarjeta}>
      <View style={styles.tarjetaCabecera}>
        <View style={styles.tarjetaTextos}>
          <Text style={styles.nombre} numberOfLines={1}>
            {item.nombre}
          </Text>
          <Text style={styles.correo} numberOfLines={1}>
            {item.correo ?? 'Sin correo'}
          </Text>
        </View>

        <View style={[styles.estado, { borderColor: colorEstado(item.estado) }]}>
          <Text style={[styles.estadoTexto, { color: colorEstado(item.estado) }]}>
            {ETIQUETA_ESTADO_ORG[item.estado]}
          </Text>
        </View>
      </View>

      <View style={styles.datosFila}>
        <Ionicons
          name={item.accesoHabilitado ? 'lock-open-outline' : 'lock-closed-outline'}
          size={14}
          color={item.accesoHabilitado ? Paleta.exito : Paleta.peligro}
        />
        <Text style={styles.datosTexto}>
          Acceso {item.accesoHabilitado ? 'habilitado' : 'bloqueado'}
        </Text>
      </View>

      {item.especialidad ? (
        <Text style={styles.datosTexto}>{item.especialidad}</Text>
      ) : null}

      <View style={styles.acciones}>
        {item.estado !== 'active' ? (
          <Pressable
            style={[styles.accion, { borderColor: Paleta.exito }]}
            onPress={() => cambiarEstado(item, 'active')}
            disabled={ocupado === item.id}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={Paleta.exito} />
            <Text style={[styles.accionTexto, { color: Paleta.exito }]}>
              Activar
            </Text>
          </Pressable>
        ) : null}

        {item.estado !== 'suspended' ? (
          <Pressable
            style={[styles.accion, { borderColor: Paleta.peligro }]}
            onPress={() => cambiarEstado(item, 'suspended')}
            disabled={ocupado === item.id}
          >
            <Ionicons name="ban-outline" size={16} color={Paleta.peligro} />
            <Text style={[styles.accionTexto, { color: Paleta.peligro }]}>
              Suspender
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[
            styles.accion,
            { borderColor: item.accesoHabilitado ? Paleta.advertencia : Paleta.exito },
          ]}
          onPress={() => alternarAcceso(item)}
          disabled={ocupado === item.id}
        >
          <Ionicons
            name={item.accesoHabilitado ? 'lock-closed-outline' : 'lock-open-outline'}
            size={16}
            color={item.accesoHabilitado ? Paleta.advertencia : Paleta.exito}
          />
          <Text
            style={[
              styles.accionTexto,
              { color: item.accesoHabilitado ? Paleta.advertencia : Paleta.exito },
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

      <FlatList
        data={lista}
        keyExtractor={(item) => item.id}
        renderItem={renderTarjeta}
        contentContainerStyle={styles.lista}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons name="business-outline" size={44} color={Paleta.textoSuave} />
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

const styles = StyleSheet.create({
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
  chipActivo: { backgroundColor: Paleta.tinta, borderColor: Paleta.tinta },
  chipTexto: {
    fontSize: 12,
    fontWeight: '800',
    color: Paleta.textoSecundario,
  },
  chipTextoActivo: { color: Paleta.acento },
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

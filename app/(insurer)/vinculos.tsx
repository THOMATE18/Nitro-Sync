/*
=======================================================
NITRO SYNC - PANEL ASEGURADORA · VEHÍCULOS VINCULADOS
=======================================================

Lista la PROYECCIÓN `vehicleInsurerLinks` de la
organización: la aseguradora nunca lee
`usuarios/{uid}/vehiculos`, solo los vehículos que le
fueron vinculados.

Cada tarjeta permite:

  - ver placa, marca/modelo, producto y estado.
  - cambiar el estado del vínculo (activo/revocado).
  - enviar un recordatorio por WhatsApp (wa.me).
  - abrir la llamada al propietario si autorizó sus datos.
=======================================================
*/

import { useEffect, useMemo, useState } from 'react';

import {
  FlatList,
  Linking,
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
  actualizarVinculo,
  suscribirVinculosOrg,
} from '@/services/vinculos';
import {
  abrirWhatsapp,
  prepararAvisoWhatsapp,
  type PlantillaWhatsapp,
} from '@/services/whatsapp';
import { registrarAuditoria } from '@/services/auditoria';
import { ETIQUETA_ESTADO_VINCULO, type VinculoAseguradora } from '@/types/negocio';

type Filtro = 'todos' | 'solicitado' | 'activo' | 'revocado';

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'solicitado', etiqueta: 'Solicitados' },
  { id: 'activo', etiqueta: 'Activos' },
  { id: 'revocado', etiqueta: 'Revocados' },
];

function colorEstado(estado: VinculoAseguradora['estado']) {
  switch (estado) {
    case 'activo':
      return Paleta.exito;
    case 'revocado':
      return Paleta.peligro;
    default:
      return Paleta.advertencia;
  }
}

export default function VinculosAseguradora() {
  const { user, orgId, organizacion } = useAuth();
  const alerta = useAlerta();
  const confirmar = useConfirm();

  const [vinculos, setVinculos] = useState<VinculoAseguradora[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;

    return suscribirVinculosOrg(
      orgId,
      setVinculos,
      () =>
        alerta({
          titulo: 'No se pudieron cargar los vehículos',
          mensaje:
            'Revisa tu conexión o que tu organización tenga el acceso habilitado.',
          tipo: 'error',
        })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const lista = useMemo(
    () =>
      filtro === 'todos'
        ? vinculos
        : vinculos.filter((v) => v.estado === filtro),
    [vinculos, filtro]
  );

  const cambiarEstado = async (
    vinculo: VinculoAseguradora,
    estado: VinculoAseguradora['estado']
  ) => {
    const etiqueta = ETIQUETA_ESTADO_VINCULO[estado];

    const ok = await confirmar({
      titulo: `${etiqueta} vínculo`,
      mensaje: `¿Marcar el vehículo ${vinculo.placa} como "${etiqueta}"?`,
      textoConfirmar: etiqueta,
      icono: 'swap-horizontal-outline',
      peligro: estado === 'revocado',
    });

    if (!ok) return;

    try {
      setOcupado(vinculo.id);
      await actualizarVinculo(vinculo.id, { estado });

      if (user) {
        await registrarAuditoria({
          actorUid: user.uid,
          actorCorreo: user.email,
          actorRol: 'insurer_admin',
          orgId,
          accion: 'vinculo.estado',
          entidad: 'vehicleInsurerLinks',
          entidadId: vinculo.id,
          detalle: { estado, placa: vinculo.placa },
        });
      }
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

  const enviarAviso = async (vinculo: VinculoAseguradora) => {
    if (!vinculo.propietarioTelefono) {
      await alerta({
        titulo: 'Sin teléfono',
        mensaje:
          'El propietario no autorizó compartir su teléfono. No es posible enviar el aviso.',
        tipo: 'advertencia',
      });
      return;
    }

    const plantilla: PlantillaWhatsapp = 'recordatorio_seguro';

    try {
      setOcupado(vinculo.id);

      const resultado = await prepararAvisoWhatsapp({
        orgId,
        propietarioUid: vinculo.propietarioUid,
        vehiculoId: vinculo.vehiculoId,
        destino: vinculo.propietarioTelefono,
        plantilla,
        variables: {
          propietario: vinculo.propietarioNombre ?? 'estimado cliente',
          aseguradora: organizacion?.nombre ?? 'tu aseguradora',
          vehiculo: `${vinculo.marca} ${vinculo.modelo} (${vinculo.placa})`,
          fecha: vinculo.vigencia ?? 'pronto',
        },
        referencia: vinculo.id,
        fecha: new Date().toISOString().slice(0, 10),
        optInComercial: false,
      });

      if (!resultado.enlace) {
        await alerta({
          titulo: 'Aviso no enviado',
          mensaje:
            resultado.motivo === 'sin_telefono'
              ? 'El número del propietario no es válido.'
              : 'No se pudo preparar el aviso.',
          tipo: 'advertencia',
        });
        return;
      }

      const abierto = await abrirWhatsapp(resultado.enlace);

      await alerta({
        titulo: abierto ? 'WhatsApp abierto' : 'Enlace listo',
        mensaje: abierto
          ? 'El mensaje se preparó en tu WhatsApp. Envíalo para completar el aviso.'
          : 'Copia el enlace y ábrelo desde tu dispositivo.',
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo preparar el aviso',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setOcupado(null);
    }
  };

  const llamar = async (telefono: string | null) => {
    if (!telefono) return;
    await Linking.openURL(`tel:${telefono.replace(/[^\d+]/g, '')}`);
  };

  const renderTarjeta = ({ item }: { item: VinculoAseguradora }) => (
    <View style={styles.tarjeta}>
      <View style={styles.tarjetaCabecera}>
        <View style={styles.placaCaja}>
          <Text style={styles.placa}>{item.placa || 'S/P'}</Text>
        </View>

        <View style={styles.tarjetaTextos}>
          <Text style={styles.vehiculo} numberOfLines={1}>
            {item.marca} {item.modelo} {item.year ? `· ${item.year}` : ''}
          </Text>
          <Text style={styles.producto} numberOfLines={1}>
            {item.producto} · {item.tipo}
          </Text>
        </View>

        <View
          style={[styles.estado, { borderColor: colorEstado(item.estado) }]}
        >
          <Text style={[styles.estadoTexto, { color: colorEstado(item.estado) }]}>
            {ETIQUETA_ESTADO_VINCULO[item.estado]}
          </Text>
        </View>
      </View>

      <View style={styles.datosFila}>
        <Ionicons name="person-outline" size={14} color={Paleta.textoSuave} />
        <Text style={styles.datosTexto}>
          {item.datosPropietarioVisibles && item.propietarioNombre
            ? item.propietarioNombre
            : 'Propietario con datos reservados'}
        </Text>
      </View>

      {item.poliza ? (
        <View style={styles.datosFila}>
          <Ionicons
            name="document-text-outline"
            size={14}
            color={Paleta.textoSuave}
          />
          <Text style={styles.datosTexto}>
            Póliza {item.poliza}
            {item.vigencia ? ` · vence ${item.vigencia}` : ''}
          </Text>
        </View>
      ) : null}

      <View style={styles.acciones}>
        {item.estado !== 'activo' ? (
          <Pressable
            style={[styles.accion, { borderColor: Paleta.exito }]}
            onPress={() => cambiarEstado(item, 'activo')}
            disabled={ocupado === item.id}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={Paleta.exito} />
            <Text style={[styles.accionTexto, { color: Paleta.exito }]}>
              Activar
            </Text>
          </Pressable>
        ) : null}

        {item.estado !== 'revocado' ? (
          <Pressable
            style={[styles.accion, { borderColor: Paleta.peligro }]}
            onPress={() => cambiarEstado(item, 'revocado')}
            disabled={ocupado === item.id}
          >
            <Ionicons name="close-circle-outline" size={16} color={Paleta.peligro} />
            <Text style={[styles.accionTexto, { color: Paleta.peligro }]}>
              Revocar
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.accion, { borderColor: Paleta.primario }]}
          onPress={() => enviarAviso(item)}
          disabled={ocupado === item.id}
        >
          <Ionicons name="logo-whatsapp" size={16} color={Paleta.primario} />
          <Text style={[styles.accionTexto, { color: Paleta.primario }]}>
            Aviso
          </Text>
        </Pressable>

        {item.datosPropietarioVisibles && item.propietarioTelefono ? (
          <Pressable
            style={[styles.accion, { borderColor: Paleta.tinta }]}
            onPress={() => llamar(item.propietarioTelefono)}
          >
            <Ionicons name="call-outline" size={16} color={Paleta.tinta} />
            <Text style={[styles.accionTexto, { color: Paleta.tinta }]}>
              Llamar
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.pantalla}>
      <EncabezadoPanel
        etiqueta="PANEL DE ASEGURADORA"
        titulo="Vehículos vinculados"
        subtitulo={`${vinculos.length} vehículo(s) en tu organización`}
        icono="car-sport"
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
            <Ionicons name="car-outline" size={44} color={Paleta.textoSuave} />
            <Text style={styles.vacioTitulo}>Sin vehículos</Text>
            <Text style={styles.vacioTexto}>
              Cuando el administrador de la plataforma vincule vehículos a tu
              organización, aparecerán aquí.
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
    gap: 10,
    ...Sombras.suave,
  },
  tarjetaCabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placaCaja: {
    backgroundColor: Paleta.tinta,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  placa: {
    color: Paleta.acento,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  tarjetaTextos: { flex: 1 },
  vehiculo: { fontSize: 15, fontWeight: '800', color: Paleta.texto },
  producto: { fontSize: 12, color: Paleta.textoSecundario, marginTop: 2 },
  estado: {
    borderWidth: 1.5,
    borderRadius: Radios.pastilla,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  estadoTexto: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  datosFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  datosTexto: { fontSize: 12, color: Paleta.textoSecundario, flexShrink: 1 },
  acciones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
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

/*
=======================================================
NITRO SYNC - PANEL DE PLATAFORMA · AUDITORÍA
=======================================================

Lista los últimos registros de `auditLogs`: quién hizo qué
y sobre qué entidad. Solo el super administrador puede
leerlos; la escritura es best-effort desde la app.
=======================================================
*/

import { useEffect, useState } from 'react';

import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import { suscribirAuditoria } from '@/services/auditoria';
import type { RegistroAuditoria } from '@/types/negocio';

function iconoAccion(accion: string): keyof typeof Ionicons.glyphMap {
  if (accion.startsWith('poliza')) return 'document-text-outline';
  if (accion.startsWith('oferta')) return 'paper-plane-outline';
  if (accion.startsWith('pago')) return 'cash-outline';
  if (accion.startsWith('plan')) return 'pricetag-outline';
  if (accion.startsWith('suscripcion')) return 'card-outline';
  if (accion.startsWith('organizacion')) return 'business-outline';
  if (accion.startsWith('vinculo')) return 'link-outline';
  if (accion.startsWith('aviso')) return 'chatbubbles-outline';
  return 'ellipse-outline';
}

export default function AuditoriaAdmin() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  useEffect(() => {
    return suscribirAuditoria(setRegistros);
  }, []);

  const renderItem = ({ item }: { item: RegistroAuditoria }) => (
    <View style={styles.tarjeta}>
      <View style={styles.tarjetaCabecera}>
        <View style={styles.iconoCaja}>
          <Ionicons name={iconoAccion(item.accion)} size={16} color={paleta.tinta} />
        </View>

        <View style={styles.tarjetaTextos}>
          <Text style={styles.accion}>{item.accion}</Text>
          <Text style={styles.actor} numberOfLines={1}>
            {item.actorCorreo ?? item.actorUid}
            {item.actorRol ? ` · ${item.actorRol}` : ''}
          </Text>
        </View>
      </View>

      <Text style={styles.entidad} numberOfLines={1}>
        {item.entidad} · {item.entidadId}
      </Text>

      {item.orgId ? (
        <Text style={styles.org} numberOfLines={1}>
          Organización: {item.orgId}
        </Text>
      ) : null}

      <Text style={styles.fecha}>
        {new Date(item.creadoEn).toLocaleString('es-CO')}
      </Text>
    </View>
  );

  return (
    <View style={styles.pantalla}>
      <EncabezadoPanel
        etiqueta="PANEL DE PLATAFORMA"
        titulo="Auditoría"
        subtitulo={`${registros.length} registro(s) recientes`}
        icono="shield-checkmark"
      />

      <FlatList
        data={registros}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.lista}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons
              name="shield-checkmark-outline"
              size={44}
              color={paleta.textoSuave}
            />
            <Text style={styles.vacioTitulo}>Sin registros</Text>
            <Text style={styles.vacioTexto}>
              Las acciones sensibles de los paneles aparecerán aquí.
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
    lista: { padding: 16, gap: 12, paddingBottom: 40, marginTop: -16 },
    tarjeta: {
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.tarjeta,
      padding: 16,
      gap: 4,
      ...Sombras.suave,
    },
    tarjetaCabecera: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconoCaja: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: Paleta.acento,
      borderWidth: 2,
      borderColor: Paleta.bordeDuro,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tarjetaTextos: { flex: 1 },
    accion: { fontSize: 14, fontWeight: '900', color: Paleta.texto },
    actor: { fontSize: 12, color: Paleta.textoSecundario, marginTop: 1 },
    entidad: { fontSize: 12, color: Paleta.textoSecundario, marginTop: 4 },
    org: { fontSize: 11.5, color: Paleta.textoSuave },
    fecha: { fontSize: 11, color: Paleta.textoSuave, marginTop: 2 },
    vacio: { alignItems: 'center', marginTop: 60, gap: 8, paddingHorizontal: 30 },
    vacioTitulo: { fontSize: 17, fontWeight: '900', color: Paleta.texto },
    vacioTexto: {
      fontSize: 13,
      color: Paleta.textoSecundario,
      textAlign: 'center',
      lineHeight: 19,
    },
  });

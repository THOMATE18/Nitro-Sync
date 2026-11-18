/*
=======================================================
NITRO SYNC - ENCABEZADO DE PANEL
=======================================================

Banner superior reutilizable para los paneles de
aseguradora y de super administrador. Mantiene el mismo
lenguaje visual de la app (degradado de marca, etiqueta
en lima, icono en caja).
=======================================================
*/

import type { ComponentProps } from 'react';

import { StyleSheet, Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Gradientes, type TipoPaleta } from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';

export interface EncabezadoPanelProps {
  /** Texto pequeño en mayúsculas sobre el título. */
  etiqueta: string;
  titulo: string;
  subtitulo?: string | null;
  icono: ComponentProps<typeof Ionicons>['name'];
  /** Color de la caja del icono (por defecto, lima). */
  colorIcono?: string;
}

export default function EncabezadoPanel({
  etiqueta,
  titulo,
  subtitulo,
  icono,
  colorIcono,
}: EncabezadoPanelProps) {
  const insets = useSafeAreaInsets();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  return (
    <LinearGradient
      colors={Gradientes.marca}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, { paddingTop: insets.top + 20 }]}
    >
      <View style={styles.fila}>
        <View style={styles.textos}>
          <Text style={styles.etiqueta}>{etiqueta}</Text>
          <Text style={styles.titulo}>{titulo}</Text>
          {subtitulo ? (
            <Text style={styles.subtitulo} numberOfLines={1}>
              {subtitulo}
            </Text>
          ) : null}
        </View>

        <View style={[styles.iconoCaja, { backgroundColor: colorIcono ?? paleta.acento }]}>
          <Ionicons name={icono} size={26} color={paleta.tinta} />
        </View>
      </View>
    </LinearGradient>
  );
}

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 44,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1 },
  etiqueta: {
    color: Paleta.acento,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  titulo: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 4 },
  subtitulo: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  iconoCaja: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

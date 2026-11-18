/*
=======================================================
NITRO SYNC - CHIPS DE FILTRO (ASEGURADORA)
=======================================================

Fila de chips reutilizable con contador opcional. Se usa en
Inicio, Vehículos y Pólizas para filtrar sin descargar datos
de más: el filtro se aplica en memoria sobre lo ya cargado.
=======================================================
*/

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radios, type TipoPaleta } from '@/constants/theme';
import { useEstilos } from '@/context/TemaContext';

import type { StyleProp, ViewStyle } from 'react-native';

export interface OpcionChip<T extends string> {
  id: T;
  etiqueta: string;
  contador?: number;
}

interface Props<T extends string> {
  opciones: OpcionChip<T>[];
  activo: T;
  onCambiar: (id: T) => void;
  estilo?: StyleProp<ViewStyle>;
}

export default function ChipsFiltro<T extends string>({
  opciones,
  activo,
  onCambiar,
  estilo,
}: Props<T>) {
  const styles = useEstilos(crearEstilos);

  return (
    <View style={[styles.fila, estilo]}>
      {opciones.map((opcion) => {
        const seleccionado = opcion.id === activo;
        const etiqueta =
          typeof opcion.contador === 'number'
            ? `${opcion.etiqueta} (${opcion.contador})`
            : opcion.etiqueta;

        return (
          <Pressable
            key={opcion.id}
            style={[styles.chip, seleccionado && styles.chipActivo]}
            onPress={() => onCambiar(opcion.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: seleccionado }}
            accessibilityLabel={etiqueta}
          >
            <Text
              style={[styles.chipTexto, seleccionado && styles.chipTextoActivo]}
            >
              {etiqueta}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    fila: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
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
  });

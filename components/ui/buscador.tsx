/*
=======================================================
NITRO SYNC - BUSCADOR
=======================================================

Campo de búsqueda reutilizable con icono y botón de limpiar.
Se usa en el panel de aseguradora para combinar la búsqueda
con los chips de filtro.
=======================================================
*/

import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Radios, type TipoPaleta } from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';

import type { StyleProp, ViewStyle } from 'react-native';

interface Props {
  valor: string;
  onCambiar: (texto: string) => void;
  placeholder?: string;
  estilo?: StyleProp<ViewStyle>;
}

export default function Buscador({
  valor,
  onCambiar,
  placeholder = 'Buscar',
  estilo,
}: Props) {
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  return (
    <View style={[styles.caja, estilo]}>
      <Ionicons name="search" size={18} color={paleta.textoSuave} />

      <TextInput
        style={styles.input}
        value={valor}
        onChangeText={onCambiar}
        placeholder={placeholder}
        placeholderTextColor={paleta.textoSuave}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />

      {valor ? (
        <Pressable
          onPress={() => onCambiar('')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
        >
          <Ionicons name="close-circle" size={18} color={paleta.textoSuave} />
        </Pressable>
      ) : null}
    </View>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    caja: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Paleta.tarjeta,
      borderWidth: 2,
      borderColor: Paleta.bordeDuro,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 14,
      height: 46,
    },
    input: {
      flex: 1,
      fontSize: 14,
      color: Paleta.texto,
      padding: 0,
    },
  });

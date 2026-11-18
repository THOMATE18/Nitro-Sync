import { Pressable, StyleSheet, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { type TipoPaleta } from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';

export interface EstrellasProps {
  valor: number;
  onChange?: (valor: number) => void;
  tamano?: number;
}

export default function Estrellas({
  valor,
  onChange,
  tamano = 28,
}: EstrellasProps) {
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  return (
    <View style={styles.fila}>
      {[1, 2, 3, 4, 5].map((posicion) => {
        const nombre =
          valor >= posicion
            ? 'star'
            : valor >= posicion - 0.5
              ? 'star-half'
              : 'star-outline';

        const icono = (
          <Ionicons
            name={nombre}
            size={tamano}
            color={nombre === 'star-outline' ? paleta.textoSuave : '#F5A623'}
          />
        );

        if (!onChange) {
          return <View key={posicion}>{icono}</View>;
        }

        return (
          <Pressable
            key={posicion}
            onPress={() => onChange(posicion)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${posicion} de 5 estrellas`}
          >
            {icono}
          </Pressable>
        );
      })}
    </View>
  );
}

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  fila: {
    flexDirection: 'row',
    gap: 4,
  },
});

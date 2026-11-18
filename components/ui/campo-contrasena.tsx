/*
=======================================================
NITRO SYNC - CAMPO DE CONTRASEÑA CON OJO
=======================================================

Campo de texto reutilizable para TODAS las contraseñas
de la aplicación (login de usuario, login de
aseguradora, registro, restablecer, cambio obligatorio).

Incluye un botón de ojo que muestra u oculta la
contraseña. Es accesible en web y móvil:

  - accessibilityRole="button"
  - accessibilityLabel dinámico ("Mostrar"/"Ocultar")
  - accessibilityState={{ checked }} para lectores de
    pantalla que anuncian el estado.

Mantiene el mismo estilo que los demás campos de la app
(fondo claro, borde suave, altura 52).
=======================================================
*/

import { useState } from 'react';

import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Radios, type TipoPaleta } from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';

export interface CampoContrasenaProps
  extends Omit<TextInputProps, 'secureTextEntry' | 'style'> {
  /** Contenedor del campo (permite ajustar el margen). */
  contenedorStyle?: StyleProp<ViewStyle>;
  /** true para autofoco al montar (no usado por defecto). */
  autoFocus?: boolean;
}

export default function CampoContrasena({
  contenedorStyle,
  placeholder = 'Tu contraseña',
  ...rest
}: CampoContrasenaProps) {
  const [visible, setVisible] = useState(false);
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  return (
    <View style={[styles.caja, contenedorStyle]}>
      <Ionicons
        name="lock-closed-outline"
        size={18}
        color={paleta.textoSuave}
        style={styles.icono}
      />

      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        secureTextEntry={!visible}
        autoComplete="password"
        {...rest}
      />

      <Pressable
        onPress={() => setVisible((valor) => !valor)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={
          visible ? 'Ocultar contraseña' : 'Mostrar contraseña'
        }
        accessibilityState={{ checked: visible }}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={18}
          color={paleta.textoSuave}
        />
      </Pressable>
    </View>
  );
}

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Paleta.fondo,
    borderWidth: 1,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 52,
  },

  icono: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    fontSize: 15,
    color: Paleta.texto,
    padding: 0,
  },
});

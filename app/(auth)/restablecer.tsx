/*
=======================================================
NITRO SYNC - CREAR NUEVA CONTRASEÑA
=======================================================

Pantalla para crear la contraseña nueva con el token de
un solo uso (`oobCode`) que llega en el correo.

El código puede llegar de dos formas:

  1. Como parámetro en la URL si la plantilla de correo
     de Firebase apunta a la app (Action URL personalizada):
     /restablecer?oobCode=XXXX

  2. Escrito a mano por la persona (por ejemplo si el
     enlace abrió la página de Firebase y quiere usar la
     app).

Firebase valida el código con verifyPasswordResetCode y
lo consume con confirmPasswordReset. El código caduca en
poco tiempo y solo sirve una vez.
=======================================================
*/

import { useState } from 'react';

import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';

import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from 'firebase/auth';

import { auth } from '../../firebaseConfig';

import { Gradientes, Radios, sombraDura, type TipoPaleta } from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BotonNitro from '@/components/ui/boton-nitro';
import CampoContrasena from '@/components/ui/campo-contrasena';
import { useAlerta } from '@/components/ui/confirm-dialog';

export default function RestablecerScreen() {
  const alerta = useAlerta();
  const parametros = useLocalSearchParams<{ oobCode?: string }>();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const insets = useSafeAreaInsets();

  /*
  Si el código llegó en la URL (Action URL personalizada),
  se precarga como valor inicial. Se deriva en el render
  inicial en vez de usar un efecto para no provocar renders
  en cascada.
  */
  const [codigo, setCodigo] = useState(() =>
    typeof parametros.oobCode === 'string' ? parametros.oobCode : ''
  );
  const [contrasena, setContrasena] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [cargando, setCargando] = useState(false);

  const restablecer = async () => {
    if (!codigo.trim() || !contrasena || !confirmar) {
      await alerta({
        titulo: 'Campos incompletos',
        mensaje: 'Completa el código y la nueva contraseña.',
        tipo: 'advertencia',
      });
      return;
    }

    if (contrasena.length < 6) {
      await alerta({
        titulo: 'Contraseña muy corta',
        mensaje: 'La contraseña debe tener al menos 6 caracteres.',
        tipo: 'advertencia',
      });
      return;
    }

    if (contrasena !== confirmar) {
      await alerta({
        titulo: 'Las contraseñas no coinciden',
        mensaje: 'Revisa que ambas contraseñas sean iguales.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setCargando(true);

      /* Valida el código antes de usarlo (mejora el mensaje). */
      await verifyPasswordResetCode(auth, codigo.trim());

      await confirmPasswordReset(auth, codigo.trim(), contrasena);

      await alerta({
        titulo: 'Contraseña actualizada',
        mensaje: 'Ya puedes iniciar sesión con tu nueva contraseña.',
        tipo: 'exito',
      });

      router.replace('/(auth)/login');
    } catch (error: any) {
      let mensaje = 'No pudimos cambiar la contraseña. Inténtalo de nuevo.';

      if (error?.code === 'auth/expired-action-code') {
        mensaje = 'El código ya caducó. Solicita un enlace nuevo.';
      } else if (error?.code === 'auth/invalid-action-code') {
        mensaje = 'El código no es válido o ya fue usado.';
      } else if (error?.code === 'auth/weak-password') {
        mensaje = 'La contraseña es demasiado débil.';
      } else if (error?.code === 'auth/network-request-failed') {
        mensaje = 'Sin conexión a internet. Revisa tu red.';
      }

      await alerta({
        titulo: 'No se pudo restablecer',
        mensaje,
        tipo: 'error',
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 48 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={Gradientes.marca}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.marca}>
            NITRO <Text style={styles.marcaAcento}>SYNC</Text>
          </Text>

          <View style={styles.logoCaja}>
            <Ionicons name="shield-checkmark" size={28} color={paleta.tinta} />
          </View>

          <Text style={styles.titulo}>Nueva contraseña</Text>

          <Text style={styles.subtitulo}>
            Usa el código de un solo uso que llegó a tu correo.
          </Text>
        </LinearGradient>

        <View style={styles.tarjeta}>
          <Text style={styles.etiqueta}>Código del correo</Text>
          <View style={styles.inputCaja}>
            <Ionicons
              name="keypad-outline"
              size={18}
              color={paleta.textoSuave}
              style={styles.inputIcono}
            />
            <TextInput
              style={styles.input}
              placeholder="Pega aquí el código"
              placeholderTextColor={paleta.textoSuave}
              autoCapitalize="none"
              autoCorrect={false}
              value={codigo}
              onChangeText={setCodigo}
            />
          </View>

          <Text style={styles.etiqueta}>Nueva contraseña</Text>
          <CampoContrasena
            placeholder="Mínimo 6 caracteres"
            value={contrasena}
            onChangeText={setContrasena}
          />

          <Text style={styles.etiqueta}>Confirmar contraseña</Text>
          <CampoContrasena
            placeholder="Repite la contraseña"
            value={confirmar}
            onChangeText={setConfirmar}
          />

          <BotonNitro
            titulo="Cambiar contraseña"
            iconoDerecha="checkmark"
            anchoCompleto
            cargando={cargando}
            onPress={restablecer}
            style={styles.botonPrincipal}
          />

          <Pressable
            style={styles.linkButton}
            onPress={() => router.replace('/(auth)/login')}
            accessibilityRole="link"
          >
            <Text style={styles.linkTexto}>Volver al inicio de sesión</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Paleta.fondo },
  scroll: { flexGrow: 1 },
  hero: {
    alignItems: 'center',
    paddingTop: 70,
    paddingHorizontal: 24,
    paddingBottom: 58,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    overflow: 'hidden',
  },
  marca: {
    fontSize: 12,
    fontWeight: '900',
    color: Paleta.blanco,
    letterSpacing: 3.4,
    marginBottom: 14,
  },
  marcaAcento: { color: Paleta.acento },
  logoCaja: {
    width: 64,
    height: 64,
    borderRadius: 21,
    backgroundColor: Paleta.acento,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...sombraDura(4, 4, 'rgba(0,0,0,0.35)'),
  },
  titulo: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  subtitulo: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 320,
    lineHeight: 20,
  },
  tarjeta: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.grande,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    padding: 24,
    marginHorizontal: 18,
    marginTop: -36,
    ...sombraDura(6, 6),
  },
  etiqueta: {
    fontSize: 13,
    fontWeight: '700',
    color: Paleta.textoSecundario,
    marginBottom: 6,
  },
  inputCaja: {
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
  inputIcono: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: Paleta.texto, padding: 0 },
  botonPrincipal: { marginTop: 6 },
  linkButton: { marginTop: 18, alignItems: 'center' },
  linkTexto: { color: Paleta.primario, fontSize: 14, fontWeight: '700' },
});

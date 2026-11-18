/*
=======================================================
NITRO SYNC - INGRESO DE ASEGURADORA
=======================================================

Inicio de sesión exclusivo para las cuentas de
aseguradora (rol insurer_admin / insurer_agent).

Después de autenticar:

  - Si la cuenta no es de aseguradora, se cierra la sesión
    y se avisa.
  - Si la cuenta debe cambiar la contraseña, el guard del
    layout raíz lleva a /cambiar-contrasena.
  - En caso contrario, el guard muestra el panel
    (insurer).
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
import { router } from 'expo-router';

import { signInWithEmailAndPassword, signOut } from 'firebase/auth';

import { auth } from '../../firebaseConfig';

import { resolverSesion } from '@/services/sesion';
import {
  Gradientes,
  Radios,
  sombraDura,
  type TipoPaleta,
} from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BotonNitro from '@/components/ui/boton-nitro';
import CampoContrasena from '@/components/ui/campo-contrasena';
import { useAlerta } from '@/components/ui/confirm-dialog';

export default function LoginAseguradoraScreen() {
  const alerta = useAlerta();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      await alerta({
        titulo: 'Campos incompletos',
        mensaje: 'Ingresa el correo y la contraseña de la aseguradora.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setLoading(true);

      const credencial = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const sesion = await resolverSesion(credencial.user);

      if (sesion.rol !== 'insurer_admin' && sesion.rol !== 'insurer_agent') {
        await signOut(auth);

        await alerta({
          titulo: 'Acceso restringido',
          mensaje:
            'Esta cuenta no pertenece a una aseguradora. Usa el ingreso normal.',
          tipo: 'error',
        });

        return;
      }

      /* El guard del layout raíz decide a dónde entrar. */
      router.replace(sesion.debeCambiarContrasena ? '/cambiar-contrasena' : '/(insurer)');
    } catch (error: any) {
      let mensaje = 'No fue posible iniciar sesión.';

      if (error.code === 'auth/invalid-credential') {
        mensaje = 'El correo o la contraseña son incorrectos.';
      } else if (error.code === 'auth/user-not-found') {
        mensaje = 'No existe una cuenta con este correo.';
      } else if (error.code === 'auth/wrong-password') {
        mensaje = 'La contraseña es incorrecta.';
      } else if (error.code === 'auth/invalid-email') {
        mensaje = 'El correo electrónico no es válido.';
      } else if (error.code === 'auth/too-many-requests') {
        mensaje = 'Demasiados intentos. Espera unos minutos.';
      } else if (error.code === 'auth/network-request-failed') {
        mensaje = 'Sin conexión a internet. Revisa tu red.';
      }

      await alerta({
        titulo: 'Error de inicio de sesión',
        mensaje,
        tipo: 'error',
      });
    } finally {
      setLoading(false);
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
          colors={Gradientes.marcaViva}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.marca}>
            NITRO <Text style={styles.marcaAcento}>SYNC</Text>
          </Text>

          <View style={styles.logoCaja}>
            <Ionicons name="business" size={30} color={paleta.tinta} />
          </View>

          <Text style={styles.titulo}>Portal de aseguradoras</Text>
          <Text style={styles.subtitulo}>
            Gestiona vehículos vinculados, pólizas y avisos de tu organización.
          </Text>
        </LinearGradient>

        <View style={styles.tarjeta}>
          <Text style={styles.tarjetaTitulo}>Ingreso de aseguradora</Text>
          <Text style={styles.tarjetaSubtitulo}>
            Usa el correo corporativo asignado
          </Text>

          <Text style={styles.etiqueta}>Correo electrónico</Text>
          <View style={styles.inputCaja}>
            <Ionicons name="mail-outline" size={18} color={paleta.textoSuave} />
            <TextInput
              style={styles.input}
              placeholder="aseguradora@gmail.com"
              placeholderTextColor={paleta.textoSuave}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.etiqueta}>Contraseña</Text>
          <CampoContrasena
            placeholder="Contraseña temporal"
            value={password}
            onChangeText={setPassword}
          />

          <BotonNitro
            titulo="Ingresar"
            iconoDerecha="arrow-forward"
            onPress={handleLogin}
            cargando={loading}
            style={styles.botonPrincipal}
          />

          <Pressable
            style={styles.linkButton}
            onPress={() => router.replace('/(auth)/login')}
            accessibilityRole="link"
          >
            <Text style={styles.linkTexto}>
              ¿Eres conductor? Ingresa como usuario
            </Text>
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
    paddingTop: 78,
    paddingHorizontal: 24,
    paddingBottom: 62,
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
    width: 66,
    height: 66,
    borderRadius: 22,
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
    marginTop: -40,
    ...sombraDura(6, 6),
  },
  tarjetaTitulo: {
    fontSize: 21,
    fontWeight: '800',
    color: Paleta.texto,
    textAlign: 'center',
  },
  tarjetaSubtitulo: {
    fontSize: 14,
    textAlign: 'center',
    color: Paleta.textoSecundario,
    marginBottom: 20,
    marginTop: 4,
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
    gap: 10,
    backgroundColor: Paleta.fondo,
    borderWidth: 1,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  input: { flex: 1, fontSize: 15, color: Paleta.texto, padding: 0 },
  botonPrincipal: { marginTop: 10 },
  linkButton: { marginTop: 18, alignItems: 'center' },
  linkTexto: { color: Paleta.primario, fontSize: 14, fontWeight: '600' },
});

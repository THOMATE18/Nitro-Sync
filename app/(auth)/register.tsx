/*
=======================================================
NITRO SYNC - REGISTRO DE USUARIO
=======================================================

Esta pantalla permite crear una cuenta nueva en
Firebase Authentication.

Firebase utiliza:
createUserWithEmailAndPassword()

DISEÑO:
Mismo lógica de diseño que el inicio de sesión
(hero con degradado + tarjeta de formulario), para
mantener una experiencia consistente. Las validaciones
y el manejo de errores NO cambiaron.

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

import { createUserWithEmailAndPassword } from 'firebase/auth';

import { auth } from '../../firebaseConfig';

import {
  Gradientes,
  Radios,
  sombraDura,
  type TipoPaleta,
} from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { crearPerfil } from '@/services/perfil';
import { registrarAutorizacionDatos } from '@/services/autorizacionDatos';
import BotonNitro from '@/components/ui/boton-nitro';
import CampoContrasena from '@/components/ui/campo-contrasena';
import { useAlerta } from '@/components/ui/confirm-dialog';

export default function RegisterScreen() {
  const alerta = useAlerta();
  const { refrescarSesion } = useAuth();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [autorizaDatos, setAutorizaDatos] = useState(false);

  const [loading, setLoading] = useState(false);

  /*
  =========================================================
  FUNCIÓN DE REGISTRO
  =========================================================
  */

  const handleRegister = async () => {
    /* Validación de campos vacíos */

    if (!email.trim() || !password || !confirmPassword) {
      await alerta({
        titulo: 'Campos incompletos',
        mensaje: 'Completa todos los campos.',
        tipo: 'advertencia',
      });

      return;
    }

    /* Validación de contraseña */

    if (password.length < 6) {
      await alerta({
        titulo: 'Contraseña muy corta',
        mensaje: 'La contraseña debe tener al menos 6 caracteres.',
        tipo: 'advertencia',
      });

      return;
    }

    /* Confirmación de contraseña */

    if (password !== confirmPassword) {
      await alerta({
        titulo: 'Las contraseñas no coinciden',
        mensaje: 'Revisa que ambas contraseñas sean iguales.',
        tipo: 'advertencia',
      });

      return;
    }

    /* Autorización obligatoria de tratamiento de datos */

    if (!autorizaDatos) {
      await alerta({
        titulo: 'Autorización requerida',
        mensaje:
          'Debes autorizar el tratamiento de tus datos personales para crear la cuenta.',
        tipo: 'advertencia',
      });

      return;
    }

    try {
      setLoading(true);

      /*
      ==================================================
      CREAR USUARIO EN FIREBASE
      ==================================================
      */

      const credencial = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      /*
      Perfil + evidencia de la autorización aceptada en el
      formulario (quién, cuándo y versión del texto).
      */
      await crearPerfil(credencial.user.uid, credencial.user.email ?? email.trim());
      await registrarAutorizacionDatos(
        credencial.user.uid,
        credencial.user.email ?? email.trim()
      );

      /*
      Firebase crea la sesión automáticamente. Se refresca
      la sesión para que el guard no vuelva a pedir la
      autorización recién aceptada.
      */
      await refrescarSesion();
    } catch (error: any) {
      let mensaje = 'No fue posible crear la cuenta.';

      if (error.code === 'auth/email-already-in-use') {
        mensaje = 'Este correo ya está registrado.';
      } else if (error.code === 'auth/invalid-email') {
        mensaje = 'El correo electrónico no es válido.';
      } else if (error.code === 'auth/weak-password') {
        mensaje = 'La contraseña es demasiado débil.';
      } else if (error.code === 'auth/network-request-failed') {
        mensaje = 'Sin conexión a internet. Revisa tu red.';
      }

      await alerta({
        titulo: 'Error de registro',
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
        showsVerticalScrollIndicator={true} persistentScrollbar
      >
        {/* =================================================
            HERO CON DEGRADADO
            ================================================= */}

        <LinearGradient
          colors={Gradientes.marca}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View pointerEvents="none" style={styles.heroBurbuja} />

          <Text style={styles.marca}>
            NITRO <Text style={styles.marcaAcento}>SYNC</Text>
          </Text>

          <View style={styles.logoCaja}>
            <Ionicons name="person-add" size={28} color={paleta.tinta} />
          </View>

          <Text style={styles.titulo}>Crea tu cuenta</Text>

          <Text style={styles.subtitulo}>
            Todo tu garaje bajo control desde el primer día.
          </Text>
        </LinearGradient>

        {/* =================================================
            TARJETA DE FORMULARIO
            ================================================= */}

        <View style={styles.tarjeta}>
          <Text style={styles.tarjetaTitulo}>Regístrate</Text>

          <Text style={styles.tarjetaSubtitulo}>
            Solo te tomará un minuto
          </Text>

          <Text style={styles.etiqueta}>Correo electrónico</Text>

          <View style={styles.inputCaja}>
            <Ionicons
              name="mail-outline"
              size={18}
              color={paleta.textoSuave}
              style={styles.inputIcono}
            />

            <TextInput
              style={styles.input}
              placeholder="tucorreo@ejemplo.com"
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
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChangeText={setPassword}
          />

          <Text style={styles.etiqueta}>Confirmar contraseña</Text>

          <CampoContrasena
            placeholder="Repite tu contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          {/* CASILLA OBLIGATORIA DE TRATAMIENTO DE DATOS */}

          <Pressable
            style={styles.casillaFila}
            onPress={() => setAutorizaDatos((valor) => !valor)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: autorizaDatos }}
            accessibilityLabel="Autorizo el tratamiento de mis datos personales"
          >
            <View
              style={[styles.casilla, autorizaDatos && styles.casillaMarcada]}
            >
              {autorizaDatos ? (
                <Ionicons name="checkmark" size={16} color={paleta.tinta} />
              ) : null}
            </View>

            <Text style={styles.casillaTexto}>
              Autorizo el tratamiento de mis datos personales conforme a la
              política de Nitro Sync (Ley 1581 de 2012).
            </Text>
          </Pressable>

          {/* BOTÓN CREAR CUENTA */}

          <BotonNitro
            titulo="Crear cuenta"
            iconoDerecha="person-add"
            onPress={handleRegister}
            cargando={loading}
            deshabilitado={!autorizaDatos}
            style={styles.botonPrincipal}
          />

          {/* BOTÓN INICIAR SESIÓN */}

          <BotonNitro
            titulo="Ya tengo una cuenta"
            variante="secundario"
            tamano="mediano"
            onPress={() => router.replace('/(auth)/login')}
            style={styles.botonSecundario}
          />

          <Pressable
            style={styles.linkButton}
            onPress={() => router.replace('/(auth)/login')}
            accessibilityRole="link"
          >
            <Text style={styles.linkTexto}>
              ¿Ya tienes cuenta? Inicia sesión
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/*
=======================================================
ESTILOS
=======================================================
*/

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Paleta.fondo,
  },

  scroll: {
    flexGrow: 1,
  },

  /* -----------------------------
     HERO
     ----------------------------- */

  hero: {
    alignItems: 'center',
    paddingTop: 70,
    paddingHorizontal: 24,
    paddingBottom: 58,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    overflow: 'hidden',
  },

  heroBurbuja: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(200,255,61,0.10)',
    top: -115,
    left: -80,
  },

  marca: {
    fontSize: 12,
    fontWeight: '900',
    color: Paleta.blanco,
    letterSpacing: 3.4,
    marginBottom: 14,
  },

  marcaAcento: {
    color: Paleta.acento,
  },

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
    fontSize: 30,
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
    maxWidth: 300,
    lineHeight: 20,
  },

  /* -----------------------------
     TARJETA
     ----------------------------- */

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
    marginBottom: 18,
    marginTop: 4,
  },

  /* -----------------------------
     CAMPOS
     ----------------------------- */

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

  inputIcono: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    fontSize: 15,
    color: Paleta.texto,
    padding: 0,
  },

  /* -----------------------------
     CASILLA DE AUTORIZACIÓN
     ----------------------------- */

  casillaFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 2,
    marginBottom: 4,
  },

  casilla: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    backgroundColor: Paleta.tarjeta,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },

  casillaMarcada: {
    backgroundColor: Paleta.acento,
  },

  casillaTexto: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: Paleta.texto,
    fontWeight: '600',
  },

  /* -----------------------------
     BOTONES
     ----------------------------- */

  botonPrincipal: {
    marginTop: 10,
  },

  botonSecundario: {
    marginTop: 12,
  },

  linkButton: {
    marginTop: 18,
    alignItems: 'center',
  },

  linkTexto: {
    color: Paleta.primario,
    fontSize: 14,
    fontWeight: '600',
  },
});

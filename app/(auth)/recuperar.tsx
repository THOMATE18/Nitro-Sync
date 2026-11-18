/*
=======================================================
NITRO SYNC - RECUPERAR CONTRASEÑA
=======================================================

El usuario escribe su correo y Firebase envía un enlace
con un token de un solo uso y expiración corta para
crear una contraseña nueva.

UNIFICADO PARA TODOS LOS ROLES

`sendPasswordResetEmail` funciona para CUALQUIER cuenta
de Authentication (propietario, administrador o
aseguradora), sin importar la colección de Firestore.
Antes el flujo podía estar limitado a los usuarios; aquí
se aplica a todos por igual.

PRIVACIDAD

La respuesta es SIEMPRE el mismo mensaje genérico, exista
o no el correo, para no revelar qué cuentas existen.
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

import { sendPasswordResetEmail } from 'firebase/auth';

import { auth } from '../../firebaseConfig';

import { Gradientes, Radios, sombraDura, type TipoPaleta } from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta } from '@/components/ui/confirm-dialog';

export default function RecuperarScreen() {
  const alerta = useAlerta();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const enviar = async () => {
    if (!email.trim()) {
      await alerta({
        titulo: 'Falta el correo',
        mensaje: 'Escribe el correo de tu cuenta.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setCargando(true);

      try {
        await sendPasswordResetEmail(auth, email.trim());
      } catch (error: any) {
        /*
        Con la protección contra enumeración de correos
        activada, Firebase NO revela si la cuenta existe.
        Si aun así devuelve "user-not-found", se ignora y
        se responde igual.
        */
        if (error?.code === 'auth/network-request-failed') {
          throw error;
        }
      }

      setEnviado(true);

      await alerta({
        titulo: 'Revisa tu correo',
        mensaje:
          'Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.',
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'Sin conexión',
        mensaje:
          'No pudimos enviar el correo. Revisa tu conexión a internet e inténtalo de nuevo.',
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
            <Ionicons name="key" size={28} color={paleta.tinta} />
          </View>

          <Text style={styles.titulo}>Recuperar contraseña</Text>

          <Text style={styles.subtitulo}>
            Te enviaremos un enlace para crear una contraseña nueva.
          </Text>
        </LinearGradient>

        <View style={styles.tarjeta}>
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
              onSubmitEditing={enviar}
            />
          </View>

          <BotonNitro
            titulo="Enviar enlace"
            iconoDerecha="paper-plane"
            anchoCompleto
            cargando={cargando}
            onPress={enviar}
            style={styles.botonPrincipal}
          />

          {enviado ? (
            <Text style={styles.aviso}>
              Si el correo está registrado, llegará un enlace con un token de
              un solo uso. Revisa spam si no lo ves en unos minutos.
            </Text>
          ) : null}

          <Pressable
            style={styles.linkButton}
            onPress={() => router.push('/(auth)/restablecer')}
            accessibilityRole="link"
          >
            <Text style={styles.linkTexto}>Ya tengo un código</Text>
          </Pressable>

          <BotonNitro
            titulo="Volver al inicio de sesión"
            variante="secundario"
            tamano="mediano"
            anchoCompleto
            onPress={() => router.replace('/(auth)/login')}
            style={styles.botonSecundario}
          />
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
  botonSecundario: { marginTop: 16 },
  aviso: {
    marginTop: 14,
    fontSize: 13,
    color: Paleta.textoSecundario,
    lineHeight: 19,
    textAlign: 'center',
  },
  linkButton: { marginTop: 16, alignItems: 'center' },
  linkTexto: { color: Paleta.primario, fontSize: 14, fontWeight: '700' },
});

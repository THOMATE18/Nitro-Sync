/*
=======================================================
NITRO SYNC - CAMBIO OBLIGATORIO DE CONTRASEÑA
=======================================================

Pantalla que aparece en el PRIMER INGRESO de las cuentas
de aseguradora (y de cualquier cuenta marcada con
`seguridad.mustChangePassword = true`).

El gate se lee SIEMPRE de Firestore (usuarios/{uid}), no
de AsyncStorage ni de localStorage: aunque alguien edite
el almacenamiento local, la app vuelve a consultar el
perfil y bloquea la navegación.

Al guardar:

  1. Se cambia la contraseña en Firebase Authentication.
  2. Se marca `mustChangePassword = false` en el perfil.
  3. Se refresca la sesión y se entra al panel que
     corresponda según el rol.
=======================================================
*/

import { useMemo, useState } from 'react';

import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';

import { auth, db } from '@/firebaseConfig';

import { useAuth } from '@/context/AuthContext';
import {
  Gradientes,
  Radios,
  sombraDura,
  type TipoPaleta,
} from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';
import BotonNitro from '@/components/ui/boton-nitro';
import CampoContrasena from '@/components/ui/campo-contrasena';
import { useAlerta } from '@/components/ui/confirm-dialog';

export default function CambiarContrasenaScreen() {
  const alerta = useAlerta();
  const { user, esAseguradora, refrescarSesion } = useAuth();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);

  /* Requisitos de la contraseña. */
  const requisitos = useMemo(
    () => [
      { texto: 'Al menos 8 caracteres', cumple: nueva.length >= 8 },
      { texto: 'Una mayúscula', cumple: /[A-Z]/.test(nueva) },
      { texto: 'Una minúscula', cumple: /[a-z]/.test(nueva) },
      { texto: 'Un número', cumple: /[0-9]/.test(nueva) },
    ],
    [nueva]
  );

  const valida =
    requisitos.every((r) => r.cumple) && nueva === confirmar && nueva.length > 0;

  const guardar = async () => {
    const actual = auth.currentUser;

    if (!actual) {
      await alerta({
        titulo: 'Sesión no disponible',
        mensaje: 'Vuelve a iniciar sesión para cambiar la contraseña.',
        tipo: 'error',
      });
      return;
    }

    if (!requisitos.every((r) => r.cumple)) {
      await alerta({
        titulo: 'Contraseña débil',
        mensaje: 'La contraseña no cumple todos los requisitos.',
        tipo: 'advertencia',
      });
      return;
    }

    if (nueva !== confirmar) {
      await alerta({
        titulo: 'No coinciden',
        mensaje: 'La confirmación no coincide con la nueva contraseña.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      /* 1. Cambiar la contraseña en Authentication. */
      await updatePassword(actual, nueva);

      /* 2. Quitar el gate del perfil (Firestore). */
      await updateDoc(doc(db, 'usuarios', actual.uid), {
        'seguridad.mustChangePassword': false,
        'seguridad.passwordChangedAt': new Date().toISOString(),
      });

      /* 3. Refrescar la sesión (relee el perfil). */
      await refrescarSesion();

      await alerta({
        titulo: 'Contraseña actualizada',
        mensaje: 'Tu nueva contraseña ya está activa.',
        tipo: 'exito',
      });

      router.replace(esAseguradora ? '/(insurer)' : '/(tabs)');
    } catch (error: any) {
      let mensaje = 'No fue posible cambiar la contraseña.';

      if (error?.code === 'auth/requires-recent-login') {
        mensaje =
          'Por seguridad debes volver a iniciar sesión antes de cambiar la contraseña.';
      } else if (error?.code === 'auth/weak-password') {
        mensaje = 'La contraseña es demasiado débil.';
      }

      await alerta({
        titulo: 'Error',
        mensaje,
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={Gradientes.marca}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.logoCaja}>
            <Ionicons name="lock-closed" size={28} color={paleta.tinta} />
          </View>

          <Text style={styles.heroTitulo}>Protege tu cuenta</Text>
          <Text style={styles.heroSubtitulo}>
            Estás usando una contraseña temporal. Cámbiala para continuar.
          </Text>
        </LinearGradient>

        <View style={styles.tarjeta}>
          <Text style={styles.correo} numberOfLines={1}>
            {user?.email}
          </Text>

          <Text style={styles.etiqueta}>Nueva contraseña</Text>
          <CampoContrasena
            placeholder="Escribe la nueva contraseña"
            value={nueva}
            onChangeText={setNueva}
            autoCapitalize="none"
          />

          <Text style={styles.etiqueta}>Confirmar contraseña</Text>
          <CampoContrasena
            placeholder="Repite la nueva contraseña"
            value={confirmar}
            onChangeText={setConfirmar}
            autoCapitalize="none"
          />

          <View style={styles.requisitos}>
            {requisitos.map((item) => (
              <View key={item.texto} style={styles.requisitoFila}>
                <Ionicons
                  name={item.cumple ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={item.cumple ? paleta.exito : paleta.textoSuave}
                />
                <Text
                  style={[
                    styles.requisitoTexto,
                    item.cumple && styles.requisitoCumplido,
                  ]}
                >
                  {item.texto}
                </Text>
              </View>
            ))}
          </View>

          <BotonNitro
            titulo="Guardar contraseña"
            icono="shield-checkmark"
            onPress={guardar}
            cargando={guardando}
            deshabilitado={!valida}
            style={styles.boton}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: Paleta.fondo },
  contenido: { flexGrow: 1, paddingBottom: 40 },
  hero: {
    alignItems: 'center',
    paddingTop: 70,
    paddingHorizontal: 24,
    paddingBottom: 56,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
  },
  logoCaja: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: Paleta.acento,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...sombraDura(4, 4, 'rgba(0,0,0,0.35)'),
  },
  heroTitulo: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  heroSubtitulo: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 300,
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
  correo: {
    fontSize: 13,
    fontWeight: '800',
    color: Paleta.textoSecundario,
    textAlign: 'center',
    marginBottom: 18,
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
  requisitos: { gap: 6, marginTop: 4, marginBottom: 8 },
  requisitoFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  requisitoTexto: { fontSize: 13, color: Paleta.textoSecundario },
  requisitoCumplido: { color: Paleta.exito, fontWeight: '700' },
  boton: { marginTop: 14 },
});

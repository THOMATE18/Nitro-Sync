/*
=======================================================
NITRO SYNC - AUTORIZACIÓN DE TRATAMIENTO DE DATOS
=======================================================

Pantalla de PRIMER INGRESO (Ley 1581 de 2012).

Se muestra una sola vez por versión del texto: mientras el
perfil del usuario no tenga aceptada la versión vigente, el
layout raíz bloquea el resto de la aplicación y trae aquí.

Al aceptar:

  1. Se guarda quién, cuándo y qué versión aceptó
     (services/autorizacionDatos.ts).
  2. Se refresca la sesión y se entra al panel que
     corresponda según el rol.

La casilla es OBLIGATORIA: el botón permanece deshabilitado
hasta marcarla. El usuario también puede cerrar sesión si no
desea autorizar.
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
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { Gradientes, Radios, sombraDura, type TipoPaleta } from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';

import { useAuth } from '@/context/AuthContext';
import {
  TEXTO_AUTORIZACION_DATOS,
  TITULO_AUTORIZACION_DATOS,
  VERSION_AUTORIZACION_DATOS,
  registrarAutorizacionDatos,
} from '@/services/autorizacionDatos';
import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta } from '@/components/ui/confirm-dialog';

export default function AutorizacionScreen() {
  const alerta = useAlerta();
  const { user, esAseguradora, refrescarSesion, logout } = useAuth();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [acepta, setAcepta] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const aceptar = async () => {
    if (!user) return;

    if (!acepta) {
      await alerta({
        titulo: 'Autorización requerida',
        mensaje:
          'Debes marcar la casilla para autorizar el tratamiento de tus datos y continuar.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      await registrarAutorizacionDatos(user.uid, user.email ?? '');
      await refrescarSesion();

      router.replace(esAseguradora ? '/(insurer)' : '/(tabs)');
    } catch {
      await alerta({
        titulo: 'No se pudo guardar',
        mensaje:
          'No pudimos registrar tu autorización. Revisa tu conexión e inténtalo de nuevo.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  const rechazar = async () => {
    await logout();
  };

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
            <Ionicons name="document-text" size={28} color={paleta.tinta} />
          </View>

          <Text style={styles.heroTitulo}>Antes de continuar</Text>
          <Text style={styles.heroSubtitulo}>
            Necesitamos tu autorización para tratar tus datos personales.
          </Text>
        </LinearGradient>

        <View style={styles.tarjeta}>
          <Text style={styles.titulo}>{TITULO_AUTORIZACION_DATOS}</Text>

          <View style={styles.textoCaja}>
            <ScrollView
              style={styles.textoScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <Text style={styles.texto}>{TEXTO_AUTORIZACION_DATOS}</Text>
            </ScrollView>
          </View>

          <Text style={styles.version}>
            Versión del texto: {VERSION_AUTORIZACION_DATOS}
          </Text>

          {/* Casilla OBLIGATORIA */}
          <Pressable
            style={styles.casillaFila}
            onPress={() => setAcepta((valor) => !valor)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acepta }}
            accessibilityLabel="Autorizo el tratamiento de mis datos personales"
          >
            <View style={[styles.casilla, acepta && styles.casillaMarcada]}>
              {acepta ? (
                <Ionicons name="checkmark" size={16} color={paleta.tinta} />
              ) : null}
            </View>

            <Text style={styles.casillaTexto}>
              Autorizo el tratamiento de mis datos personales conforme al texto
              anterior.
            </Text>
          </Pressable>

          <BotonNitro
            titulo="Aceptar y continuar"
            iconoDerecha="arrow-forward"
            anchoCompleto
            cargando={guardando}
            deshabilitado={!acepta}
            onPress={aceptar}
            style={styles.botonPrincipal}
          />

          <BotonNitro
            titulo="No autorizo, cerrar sesión"
            variante="secundario"
            tamano="mediano"
            anchoCompleto
            onPress={rechazar}
            style={styles.botonSecundario}
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
    overflow: 'hidden',
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
    padding: 22,
    marginHorizontal: 18,
    marginTop: -36,
    ...sombraDura(6, 6),
  },
  titulo: {
    fontSize: 17,
    fontWeight: '900',
    color: Paleta.texto,
    marginBottom: 12,
  },
  textoCaja: {
    backgroundColor: Paleta.fondo,
    borderWidth: 1,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    padding: 14,
  },
  textoScroll: { maxHeight: 260 },
  texto: {
    fontSize: 13,
    lineHeight: 20,
    color: Paleta.textoSecundario,
  },
  version: {
    fontSize: 11,
    fontWeight: '700',
    color: Paleta.textoSuave,
    marginTop: 8,
    textAlign: 'right',
  },
  casillaFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
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
  botonPrincipal: { marginTop: 20 },
  botonSecundario: { marginTop: 12 },
});

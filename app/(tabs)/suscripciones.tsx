/*
=======================================================
NITRO SYNC - SUSCRIPCIONES DE ASEGURADORAS (ADMIN)
=======================================================

Pantalla completa accesible desde la pestaña inferior
"Suscripciones" del panel del súper administrador.

Muestra TODA la información disponible de cada aseguradora:
organización, suscripción (incluida su trazabilidad), última
compra simulada e historial de cambios. Las acciones de
activar/desactivar son las mismas del panel; las notificaciones
de compras siguen en la pestaña "Panel".
=======================================================
*/

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SuscripcionesAdmin } from '@/app/(tabs)/panel';
import { Gradientes, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';

export default function SuscripcionesScreen() {
  const { esAdmin, loading, user } = useAuth();
  const { paleta } = useTema();
  const styles = useEstilos(crearEstilos);
  const insets = useSafeAreaInsets();

  if (loading) return null;
  if (!esAdmin) return <Redirect href="/(tabs)" />;

  return (
    <View style={styles.pantalla}>
      <LinearGradient
        colors={Gradientes.marca}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 20 }]}
      >
        <View style={styles.heroFila}>
          <View style={styles.heroTextos}>
            <Text style={styles.heroEtiqueta}>ADMINISTRADOR</Text>
            <Text style={styles.heroTitulo}>Suscripciones</Text>
            <Text style={styles.heroSubtitulo} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>

          <View style={styles.heroIcono}>
            <Ionicons name="card-outline" size={26} color={paleta.tinta} />
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.contenido}
        contentContainerStyle={styles.contenidoInterno}
        showsVerticalScrollIndicator={false}
      >
        <SuscripcionesAdmin detallado />
      </ScrollView>
    </View>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    pantalla: { flex: 1, backgroundColor: Paleta.fondo },
    hero: {
      paddingHorizontal: 20,
      paddingBottom: 30,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    heroFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    heroTextos: { flex: 1 },
    heroEtiqueta: {
      color: Paleta.acento,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 2.5,
    },
    heroTitulo: {
      color: Paleta.blanco,
      fontSize: 26,
      fontWeight: '900',
      marginTop: 4,
    },
    heroSubtitulo: { color: Paleta.blanco, fontSize: 13, marginTop: 2 },
    heroIcono: {
      width: 52,
      height: 52,
      borderRadius: 18,
      backgroundColor: Paleta.acento,
      borderWidth: 2,
      borderColor: Paleta.bordeDuro,
      alignItems: 'center',
      justifyContent: 'center',
      ...Sombras.suave,
    },
    contenido: { flex: 1 },
    contenidoInterno: { paddingBottom: 28 },
  });

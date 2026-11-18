/*
=======================================================
NITRO SYNC - PANEL DE ASEGURADORA (TABS)
=======================================================

Contenedor del panel para los roles insurer_admin e
insurer_agent. Solo se muestra cuando el usuario tiene
una organización asignada.

Pestañas:

  inicio       -> resumen de la organización
  vinculos     -> vehículos con el seguro de la aseguradora
  polizas      -> pólizas y ofertas de renovación
  suscripcion  -> plan mensual y pagos
  avisos       -> avisos enviados por WhatsApp

Cada pestaña vuelve a comprobar el rol: aunque alguien
llegue a la ruta por enlace, si no es aseguradora se
redirige a la app principal.
=======================================================
*/

import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import { claveAseguradora } from '@/data/aseguradoras';
import { useCotizacionesNuevas } from '@/hooks/use-cotizaciones-nuevas';
import { useMembresiaAseguradora } from '@/hooks/use-membresia-aseguradora';

export default function InsurerLayout() {
  const { esAseguradora, loading, organizacion } = useAuth();
  const { paleta } = useTema();
  const styles = useEstilos(crearEstilos);
  const insets = useSafeAreaInsets();
  const membresia = useMembresiaAseguradora();

  const clave =
    organizacion?.aseguradoraClave || claveAseguradora(organizacion?.nombre ?? '');
  const cotizacionesNuevas = useCotizacionesNuevas(clave);

  /* Aviso limpio: el bloqueo sigue activo, pero no se muestran errores. */
  const mostrarAviso = !loading && esAseguradora && !membresia.cargando && !membresia.activa;
  const estadoAviso =
    membresia.estado === 'expired'
      ? 'vencida'
      : membresia.estado === 'pendiente'
        ? 'pendiente de aprobación'
        : 'inactiva';

  if (loading) return null;

  if (!esAseguradora) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.contenedor}>
      {mostrarAviso ? (
        <Pressable
          onPress={() => router.push('/(insurer)/suscripcion')}
          style={styles.aviso}
          accessibilityRole="button"
          accessibilityLabel="Ir a la suscripción para activar el plan"
        >
          <Ionicons
            name="alert-circle-outline"
            size={18}
            color={paleta.advertencia}
          />
          <View style={styles.avisoTextos}>
            <Text style={styles.avisoTitulo}>Membresía {estadoAviso}</Text>
            <Text style={styles.avisoDetalle}>
              Activa tu plan para ver vehículos y cotizaciones.
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={paleta.advertencia}
          />
        </Pressable>
      ) : null}

      <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: paleta.primario,
        tabBarInactiveTintColor: paleta.textoSuave,
        tabBarStyle: {
          backgroundColor: paleta.tarjeta,
          borderTopWidth: 2,
          borderTopColor: paleta.bordeDuro,
          paddingTop: 6,
          /* Suma el área segura inferior para que ninguna pestaña quede tapada. */
          height: 58 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'grid' : 'grid-outline'}
              size={size}
              color={color == null || typeof color === 'number' ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="vinculos"
        options={{
          title: 'Vehículos',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'car-sport' : 'car-sport-outline'}
              size={size}
              color={color == null || typeof color === 'number' ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="polizas"
        options={{
          title: 'Pólizas',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'document-text' : 'document-text-outline'}
              size={size}
              color={color == null || typeof color === 'number' ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="cotizaciones"
        options={{
          title: 'Cotizaciones',
          tabBarBadge:
            cotizacionesNuevas > 0 ? cotizacionesNuevas : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'mail-unread' : 'mail-unread-outline'}
              size={size}
              color={color == null || typeof color === 'number' ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="suscripcion"
        options={{
          title: 'Suscripción',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'card' : 'card-outline'}
              size={size}
              color={color == null || typeof color === 'number' ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="avisos"
        options={{
          title: 'Avisos',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              size={size}
              color={color == null || typeof color === 'number' ? undefined : color}
            />
          ),
        }}
      />
      </Tabs>
    </View>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: Paleta.fondo },
    aviso: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: Paleta.advertenciaFondo,
      borderBottomWidth: 2,
      borderBottomColor: Paleta.advertencia,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    avisoTextos: { flex: 1, gap: 1 },
    avisoTitulo: { fontSize: 12.5, fontWeight: '900', color: Paleta.texto },
    avisoDetalle: { fontSize: 11, color: Paleta.textoSecundario },
  });

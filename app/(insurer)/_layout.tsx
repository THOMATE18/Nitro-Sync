/*
=======================================================
NITRO SYNC - PANEL DE ASEGURADORA (TABS)
=======================================================

Contenedor del panel para los roles insurer_admin e
insurer_agent. Solo se muestra cuando el usuario tiene
una organización asignada.

Pestañas:

  inicio       -> resumen de la organización
  vinculos     -> vehículos vinculados (proyección)
  polizas      -> pólizas y ofertas de renovación
  suscripcion  -> plan mensual y pagos
  avisos       -> avisos enviados por WhatsApp

Cada pestaña vuelve a comprobar el rol: aunque alguien
llegue a la ruta por enlace, si no es aseguradora se
redirige a la app principal.
=======================================================
*/

import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { Paleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

export default function InsurerLayout() {
  const { esAseguradora, loading } = useAuth();

  if (loading) return null;

  if (!esAseguradora) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Paleta.primario,
        tabBarInactiveTintColor: Paleta.textoSuave,
        tabBarStyle: {
          backgroundColor: Paleta.tarjeta,
          borderTopWidth: 2,
          borderTopColor: Paleta.tinta,
          paddingTop: 6,
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
  );
}

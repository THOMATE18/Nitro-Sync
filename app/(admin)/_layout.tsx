/*
=======================================================
NITRO SYNC - PANEL DE PLATAFORMA (SUPER ADMIN)
=======================================================

Contenedor del panel del super administrador. Convive con
el panel heredado de `(tabs)`: aquí se administran las
aseguradoras, los planes y pagos, los vínculos entre
vehículos y aseguradoras, y la auditoría.

Pestañas:

  panel        -> resumen general
  aseguradoras -> organizaciones y su acceso
  facturacion  -> planes, suscripciones y pagos
  vinculos     -> proyección vehículo <-> aseguradora
  auditoria    -> registro de acciones sensibles

Cada pantalla vuelve a comprobar el rol: si el usuario no
es super administrador se redirige a la app principal.
=======================================================
*/

import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { Paleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

export default function AdminLayout() {
  const { esSuperAdmin, loading } = useAuth();

  if (loading) return null;

  if (!esSuperAdmin) {
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
        name="panel"
        options={{
          title: 'Panel',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'speedometer' : 'speedometer-outline'}
              size={size}
              color={color == null || typeof color === 'number' ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="aseguradoras"
        options={{
          title: 'Aseguradoras',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'business' : 'business-outline'}
              size={size}
              color={color == null || typeof color === 'number' ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="facturacion"
        options={{
          title: 'Facturación',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'cash' : 'cash-outline'}
              size={size}
              color={color == null || typeof color === 'number' ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="vinculos"
        options={{
          title: 'Vínculos',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'link' : 'link-outline'}
              size={size}
              color={color == null || typeof color === 'number' ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="auditoria"
        options={{
          title: 'Auditoría',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'}
              size={size}
              color={color == null || typeof color === 'number' ? undefined : color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

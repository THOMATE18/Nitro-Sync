/*
=======================================================
NITRO SYNC - NAVEGACIÓN DE AUTENTICACIÓN
=======================================================

Este Stack agrupa las pantallas que se muestran
CUANDO NO EXISTE SESIÓN:

  /login       -> Pantalla de acceso (usuario / aseguradora)
  /register    -> Crear cuenta
  /recuperar   -> Pedir enlace de recuperación por correo
  /restablecer -> Crear contraseña nueva con el código
  /aseguradora -> (heredada) ingreso directo de aseguradora

El grupo (auth) es protegido en app/_layout.tsx:

  Sin sesión  -> se muestra este grupo
  Con sesión  -> se muestran las pestañas (tabs)

Los encabezados nativos están ocultos porque cada
pantalla ya incluye su propio diseño de tarjeta.
=======================================================
*/

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" options={{ title: 'Iniciar sesión' }} />

      <Stack.Screen name="register" options={{ title: 'Crear cuenta' }} />

      <Stack.Screen
        name="aseguradora"
        options={{ title: 'Ingreso de aseguradora' }}
      />

      <Stack.Screen
        name="recuperar"
        options={{ title: 'Recuperar contraseña' }}
      />

      <Stack.Screen
        name="restablecer"
        options={{ title: 'Nueva contraseña' }}
      />
    </Stack>
  );
}

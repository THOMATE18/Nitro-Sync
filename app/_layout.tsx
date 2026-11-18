/*
=======================================================
NITRO SYNC - NAVEGACIÓN PRINCIPAL (STACKs)
=======================================================

El Stack Navigator apila las pantallas una encima de otra.

Rutas principales:
  /(auth)        -> Login y registro (sin sesión)
  /(tabs)        -> Contenedor de pestañas (con sesión)
  /vehicle/[id]  -> Detalle de un vehículo (con sesión)

Además, AuthProvider permite que toda la aplicación
conozca el usuario autenticado de Firebase.

PROTECCIÓN DE RUTAS (Stack.Protected):

  Mientras carga la sesión  -> pantalla de carga
  Sin sesión                -> grupo (auth)
  Con sesión                -> pestañas + detalle

De este modo la sesión se mantiene: si no hay usuario
no es posible entrar a la aplicación principal, y si
existe sesión no se muestra la pantalla de login.
=======================================================
*/

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from 'expo-router/react-navigation';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useMemo, useRef } from 'react';

import 'react-native-reanimated';

import { Layout, type TipoPaleta } from '@/constants/theme';
import {
  TemaProvider,
  useEstilos,
  useTema,
} from '@/context/TemaContext';

// Contextos globales: sesión y vehículos en tiempo real
import { AuthProvider, useAuth } from '../context/AuthContext';
import { VehiculosProvider } from '../context/VehiculosContext';
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  registerNotificationHandler,
} from '@/lib/notifications';
import {
  handleNotificationResponse,
  navigateFromNotificationData,
  type NotificationData,
} from '@/lib/notificationNavigation';
import { instalarAlertWeb } from '@/lib/webAlert';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { NotificationBannerProvider, useNotificationBanner } from '@/components/ui/notification-banner';
import SolicitudPermisosNotificaciones from '@/components/ui/solicitud-permisos-notificaciones';

/*
En web, Alert.alert() no hace nada (es una función
vacía en React Native Web). Este polyfill restaura el
comportamiento nativo para que las confirmaciones y
avisos funcionen también en el navegador.
*/
instalarAlertWeb();

export const unstable_settings = {
  anchor: '(tabs)',
};

/*
=======================================================
TEMA DE NAVEGACIÓN NITRO
=======================================================

Se construye a partir de la paleta vigente (clara u
oscura) para que los encabezados y fondos de la
navegación combinen con las pantallas.
=======================================================
*/

/*
=======================================================
NAVEGACIÓN PRINCIPAL
=======================================================

Se encuentra dentro de AuthProvider para poder
consultar el estado de la sesión.
=======================================================
*/

function RootNavigator() {
  const { user, loading, esAdmin, esAseguradora, esSuperAdmin, debeCambiarContrasena, debeAutorizarDatos } =
    useAuth();
  const { paleta } = useTema();
  const styles = useEstilos(crearEstilos);
  const mostrarBanner = useNotificationBanner();
  const isMountedRef = useRef(true);
  const listenersRef = useRef<any[]>([]);

  /* Gate del primer ingreso: obliga a cambiar la contraseña. */
  const necesitaCambio = !!user && debeCambiarContrasena;

  /* Gate del tratamiento de datos: obliga a aceptar antes de usar la app. */
  const necesitaAutorizar = !!user && !necesitaCambio && debeAutorizarDatos;

  const sesionLista = !!user && !necesitaCambio && !necesitaAutorizar;

  /*
  ======================================================
  DESTINO DE REDIRECCIÓN

  Cada `Stack.Protected` necesita un `redirectTo` que
  SIEMPRE apunte a una ruta habilitada para el estado
  actual. Si el destino también estuviera protegido, se
  produciría un bucle de redirecciones (pantalla en
  blanco + "Maximum update depth exceeded").

  Por eso el destino se calcula una sola vez y es válido
  en todos los casos:

    sin sesión            -> (auth)/login
    primer ingreso        -> cambiar-contrasena
    falta autorización    -> autorizacion
    aseguradora           -> (insurer)
    resto (usuario/admin) -> (tabs)
  ======================================================
  */
  const destino = !user
    ? '/(auth)/login'
    : necesitaCambio
      ? '/cambiar-contrasena'
      : necesitaAutorizar
        ? '/autorizacion'
        : esAseguradora
          ? '/(insurer)'
          : '/(tabs)';

  useEffect(() => {
    isMountedRef.current = true;

    /*
    Las funciones de `@/lib/notifications` ya son "no-op"
    seguras en web (Metro usa `notifications.web.ts`), así
    que aquí no hace falta distinguir la plataforma ni
    importar expo-notifications.
    */
    registerNotificationHandler();

    const checkInitialNotification = async () => {
      try {
        const response = await getLastNotificationResponseAsync();
        if (response?.notification && isMountedRef.current) {
          handleNotificationResponse(response);
        }
      } catch (error) {
        console.warn('No se pudo leer la última notificación:', error);
      }
    };
    checkInitialNotification();

    const receivedListener = addNotificationReceivedListener(
      (notification) => {
        /*
        La notificación local llegó con la app ABIERTA.
        Mostramos un banner con el diseño de la aplicación
        (ver components/ui/notification-banner.tsx).
        */
        const contenido = notification.request.content;
        const datos = (contenido.data ?? {}) as NotificationData;

        mostrarBanner({
          titulo: contenido.title ?? 'Nitro Sync',
          mensaje: contenido.body ?? '',
          icono: 'notifications',
          onPress: () => navigateFromNotificationData(datos),
        });
      }
    );

    const responseListener = addNotificationResponseReceivedListener(
      (response) => {
        if (isMountedRef.current) {
          handleNotificationResponse(response);
        }
      }
    );

    listenersRef.current.push(receivedListener, responseListener);

    return () => {
      isMountedRef.current = false;
      listenersRef.current.forEach((listener) => listener.remove());
      listenersRef.current = [];
    };
  }, [mostrarBanner]);

  /*
  ======================================================
  CARGA DE LA SESIÓN
  ======================================================

  Mientras Firebase verifica si existe una sesión se
  muestra una pantalla de carga. Esto evita que se
  parpadee la pantalla de login al abrir la aplicación.
  */

  if (loading) {
    return (
      <View style={styles.loading}>
        <View style={styles.loadingMarca}>
          <Text style={styles.loadingLogo}>NITRO</Text>
        </View>

        <Text style={styles.loadingTitulo}>Nitro Sync</Text>

        <Text style={styles.loadingSubtitle}>Cargando tu sesión...</Text>

        <ActivityIndicator
          size="large"
          color={paleta.primario}
          style={styles.loadingIndicator}
        />
      </View>
    );
  }

  /*
  ======================================================
  RUTAS PROTEGIDAS
  ======================================================
  */

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: paleta.tarjeta },
        headerTintColor: paleta.texto,
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: paleta.fondo },
      }}
    >
      {/*
      CAMBIO OBLIGATORIO DE CONTRASEÑA (PRIMER INGRESO)

      Mientras `debeCambiarContrasena` sea true, la única
      ruta disponible es esta pantalla. El resto de grupos
      exige `!necesitaCambio`.
      */}
      <Stack.Protected guard={necesitaCambio} redirectTo={destino}>
        <Stack.Screen
          name="cambiar-contrasena"
          options={{ headerShown: false }}
        />
      </Stack.Protected>

      {/*
      AUTORIZACIÓN DE TRATAMIENTO DE DATOS (PRIMER INGRESO)

      Mientras falte aceptar el texto vigente, la única ruta
      disponible es esta pantalla.
      */}
      <Stack.Protected guard={necesitaAutorizar} redirectTo={destino}>
        <Stack.Screen
          name="autorizacion"
          options={{ headerShown: false }}
        />
      </Stack.Protected>

      {/*
      Rutas disponibles cuando existe sesión.
      */}
      <Stack.Protected guard={sesionLista && !esAseguradora} redirectTo={destino}>
        {/* Grupo de pestañas: Inicio y Explorar */}
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />

        {/* Pantalla de detalle con ruta dinámica */}
        <Stack.Screen
          name="vehicle/[id]"
          options={{
            title: 'Detalle del vehículo',
          }}
        />

        {/* Registrar o editar un vehículo */}
        <Stack.Screen
          name="vehicle/formulario"
          options={{
            title: 'Vehículo',
          }}
        />

        {/* Registrar o editar un documento */}
        <Stack.Screen
          name="vehicle/documento"
          options={{
            title: 'Documento',
          }}
        />

        {/* Registrar o editar un mantenimiento */}
        <Stack.Screen
          name="vehicle/mantenimiento"
          options={{
            title: 'Mantenimiento',
          }}
        />

        {/* Registrar o editar un recordatorio */}
        <Stack.Screen
          name="vehicle/recordatorio"
          options={{
            title: 'Recordatorio',
          }}
        />

        {/* Registrar o editar un gasto */}
        <Stack.Screen
          name="vehicle/gasto"
          options={{
            title: 'Gasto',
          }}
        />

        {/* Actualizar el kilometraje (control del cambio de aceite) */}
        <Stack.Screen
          name="vehicle/kilometraje"
          options={{
            title: 'Kilometraje',
          }}
        />

        {/* Todos los recordatorios guardados */}
        <Stack.Screen
          name="recordatorios"
          options={{
            title: 'Recordatorios',
          }}
        />

        {/* Directorio de aseguradoras con teléfonos de asistencia */}
        <Stack.Screen
          name="aseguradoras"
          options={{
            title: 'Aseguradoras',
          }}
        />

        <Stack.Screen
          name="mis-seguros"
          options={{
            title: 'Mis seguros',
          }}
        />

        {/* Carga masiva de vehículos desde Excel */}
        <Stack.Screen
          name="carga-masiva"
          options={{
            title: 'Carga masiva',
          }}
        />
      </Stack.Protected>

      <Stack.Protected guard={sesionLista && esAdmin} redirectTo={destino}>
        <Stack.Screen
          name="admin/vehiculo"
          options={{
            title: 'Vehículo afiliado',
          }}
        />
      </Stack.Protected>

      {/*
      PANEL DE ASEGURADORA

      Solo para insurer_admin / insurer_agent. La
      aseguradora opera únicamente con su organización.
      */}
      <Stack.Protected
        guard={sesionLista && esAseguradora}
        redirectTo={destino}
      >
        <Stack.Screen
          name="(insurer)"
          options={{ headerShown: false }}
        />
      </Stack.Protected>

      {/*
      PANEL DE SUPER ADMINISTRADOR (PLATAFORMA)

      Convive con el panel heredado de (tabs): aquí se
      administran aseguradoras, planes, pagos y auditoría.
      */}
      <Stack.Protected
        guard={sesionLista && esSuperAdmin}
        redirectTo={destino}
      >
        <Stack.Screen
          name="(admin)"
          options={{ headerShown: false }}
        />
      </Stack.Protected>

      {/* Rutas disponibles cuando NO existe sesión */}
      <Stack.Protected guard={!user} redirectTo={destino}>
        <Stack.Screen
          name="(auth)"
          options={{ headerShown: false }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <TemaProvider>
      <AppTema />
    </TemaProvider>
  );
}

/*
=======================================================
SHELL DE LA APLICACIÓN
=======================================================

Consume el tema vigente para el fondo raíz, la barra de
estado y el tema de la navegación. Debe vivir DENTRO de
TemaProvider.
=======================================================
*/

function AppTema() {
  const { paleta, esOscuro } = useTema();
  const styles = useEstilos(crearEstilos);

  const temaNavegacion = useMemo(() => {
    const base = esOscuro ? DarkTheme : DefaultTheme;

    return {
      ...base,
      colors: {
        ...base.colors,
        primary: paleta.primario,
        background: paleta.fondo,
        card: paleta.tarjeta,
        text: paleta.texto,
        border: paleta.borde,
        notification: paleta.coral,
      },
    };
  }, [paleta, esOscuro]);

  return (
    <ThemeProvider value={temaNavegacion}>
      {/*
        En el navegador la ventana es muy ancha: esta columna
        centra toda la aplicación con un ancho máximo para que
        se vea ordenada y profesional. En Android/iOS no cambia
        nada (Layout.appWeb es un objeto vacío).
      */}
      <View style={styles.app}>
        <View style={[styles.columna, Layout.appWeb]}>
          {/*
            AuthProvider permite que todas las pantallas
            puedan conocer el usuario autenticado.
            VehiculosProvider mantiene los vehículos del
            usuario en tiempo real (Firestore) disponibles
            en toda la aplicación.
          */}
          <AuthProvider>
            <VehiculosProvider>
              <ConfirmProvider>
                <NotificationBannerProvider>
                  <RootNavigator />

                  {/*
                    Pregunta una sola vez, al abrir la app con
                    sesión, si se permiten las notificaciones.
                  */}
                  <SolicitudPermisosNotificaciones />
                </NotificationBannerProvider>
              </ConfirmProvider>
            </VehiculosProvider>
          </AuthProvider>
        </View>
      </View>

      <StatusBar style={esOscuro ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

/*
=======================================================
ESTILOS
=======================================================
*/

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    app: {
      flex: 1,
      /*
      En web, un tono ligeramente distinto detrás de la
      columna centrada para que la app "flote".
      */
      backgroundColor:
        Platform.OS === 'web' ? Paleta.fondoAlterno : Paleta.fondo,
    },

    columna: {
      flex: 1,
    },

    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Paleta.fondo,
      padding: 24,
    },

    loadingMarca: {
      backgroundColor: Paleta.acento,
      borderWidth: 2,
      borderColor: Paleta.tinta,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 10,
      marginBottom: 16,
    },

    loadingLogo: {
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: 6,
      color: Paleta.tinta,
    },

    loadingTitulo: {
      fontSize: 22,
      fontWeight: '900',
      color: Paleta.texto,
      letterSpacing: 0.4,
    },

    loadingSubtitle: {
      fontSize: 13,
      color: Paleta.textoSecundario,
      marginTop: 6,
    },

    loadingIndicator: {
      marginTop: 20,
    },
  });

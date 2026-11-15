/*
========================================================
NITRO SYNC - AUTH CONTEXT
========================================================

Este contexto administra globalmente la autenticación
del usuario mediante Firebase Authentication.

Además del usuario, expone los datos de negocio que
necesitan los paneles nuevos:

  - rol                    -> customer | insurer_admin |
                              insurer_agent | super_admin
  - orgId                  -> aseguradora del usuario
  - organizacion           -> documento organizations/{orgId}
  - debeCambiarContrasena  -> gate del primer ingreso
  - refrescarSesion()      -> recarga claims y perfil

IMPORTANTE:

- El rol viene de los custom claims (autoridad real).
- El perfil de Firestore NO concede privilegios.
- La cuenta de administrador heredada (colección
  `administradores`) se traduce a `super_admin`.

========================================================
*/

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  User,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';

import { auth } from '../firebaseConfig';

import { cancelarNotificacionesUsuario } from '@/services/notificationService';
import { resolverSesion } from '@/services/sesion';
import { suscribirOrganizacion } from '@/services/organizaciones';

import type { Organizacion, Rol } from '@/types/negocio';

/*
========================================================
TIPO DEL CONTEXTO
========================================================
*/

interface AuthContextType {
  user: User | null;
  loading: boolean;

  /** Cuenta con permisos de super administrador. */
  esAdmin: boolean;

  /** Rol efectivo del usuario. */
  rol: Rol;

  /** Identificador de la aseguradora (solo roles de aseguradora). */
  orgId: string | null;

  /** Documento de la aseguradora en tiempo real. */
  organizacion: Organizacion | null;

  /** true si el usuario debe cambiar la contraseña antes de usar la app. */
  debeCambiarContrasena: boolean;

  /** true para insurer_admin / insurer_agent. */
  esAseguradora: boolean;

  /** true solo para super_admin. */
  esSuperAdmin: boolean;

  /** Vuelve a leer claims y perfil (tras cambiar la contraseña, por ejemplo). */
  refrescarSesion: () => Promise<void>;

  logout: () => Promise<void>;
}

/*
========================================================
CREACIÓN DEL CONTEXTO
========================================================
*/

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  esAdmin: false,
  rol: 'customer',
  orgId: null,
  organizacion: null,
  debeCambiarContrasena: false,
  esAseguradora: false,
  esSuperAdmin: false,
  refrescarSesion: async () => {},
  logout: async () => {},
});

/*
========================================================
AUTH PROVIDER
========================================================

Este componente envuelve la aplicación y permite
compartir la información de autenticación con todas
las pantallas.
========================================================
*/

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [rol, setRol] = useState<Rol>('customer');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [debeCambiarContrasena, setDebeCambiarContrasena] = useState(false);
  const [organizacion, setOrganizacion] = useState<Organizacion | null>(null);

  /*
  Secuencia para descartar respuestas antiguas cuando el
  usuario cambia rápido de sesión.
  */
  const secuenciaRef = useRef(0);

  const aplicarSesion = useCallback(async (usuario: User | null) => {
    const actual = ++secuenciaRef.current;

    if (!usuario) {
      setRol('customer');
      setOrgId(null);
      setDebeCambiarContrasena(false);
      setOrganizacion(null);
      return;
    }

    const datos = await resolverSesion(usuario);

    if (actual !== secuenciaRef.current) return;

    setRol(datos.rol);
    setOrgId(datos.orgId);
    setDebeCambiarContrasena(datos.debeCambiarContrasena);
  }, []);

  /*
  ======================================================
  ESCUCHAR CAMBIOS DE AUTENTICACIÓN
  ======================================================

  Firebase informa automáticamente cuando:

  - El usuario inicia sesión.
  - El usuario cierra sesión.
  - Firebase recupera una sesión existente.
  */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usuario) => {
      if (!usuario) {
        secuenciaRef.current += 1;
        setUser(null);
        setRol('customer');
        setOrgId(null);
        setDebeCambiarContrasena(false);
        setOrganizacion(null);
        setLoading(false);
        return;
      }

      setUser(usuario);
      setLoading(true);

      aplicarSesion(usuario).finally(() => setLoading(false));
    });

    return unsubscribe;
  }, [aplicarSesion]);

  /*
  ======================================================
  ORGANIZACIÓN EN TIEMPO REAL
  ======================================================

  Solo los roles de aseguradora leen su propia
  organización. El super_admin no necesita una en
  concreto, así que aquí se omite.
  */

  useEffect(() => {
    if (!user || !orgId) {
      setOrganizacion(null);
      return;
    }

    return suscribirOrganizacion(
      orgId,
      (datos) => setOrganizacion(datos),
      () => setOrganizacion(null)
    );
  }, [user, orgId]);

  /*
  ======================================================
  REFRESCAR SESIÓN
  ======================================================
  */

  const refrescarSesion = useCallback(async () => {
    if (auth.currentUser) {
      await aplicarSesion(auth.currentUser);
    }
  }, [aplicarSesion]);

  /*
  ======================================================
  CERRAR SESIÓN
  ======================================================
  */

  const logout = useCallback(async () => {
    /*
    Cancela las notificaciones locales del usuario que
    cierra sesión para no dejar avisos de una cuenta que
    ya no está activa. Si falla, no impide cerrar sesión.
    */
    const actual = auth.currentUser;

    if (actual) {
      await cancelarNotificacionesUsuario(actual.uid).catch(() => {});
    }

    await signOut(auth);
  }, []);

  /*
  ======================================================
  DERIVADOS
  ======================================================
  */

  const esAseguradora = rol === 'insurer_admin' || rol === 'insurer_agent';
  const esSuperAdmin = rol === 'super_admin';

  const valor = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      esAdmin: esSuperAdmin,
      rol,
      orgId,
      organizacion,
      debeCambiarContrasena,
      esAseguradora,
      esSuperAdmin,
      refrescarSesion,
      logout,
    }),
    [
      user,
      loading,
      esSuperAdmin,
      rol,
      orgId,
      organizacion,
      debeCambiarContrasena,
      esAseguradora,
      refrescarSesion,
      logout,
    ]
  );

  /*
  ======================================================
  PROVEER INFORMACIÓN A LA APLICACIÓN
  ======================================================
  */

  return (
    <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
  );
}

/*
========================================================
HOOK PERSONALIZADO
========================================================

Permite utilizar la información de autenticación
desde cualquier pantalla:

const { user, loading, rol, logout } = useAuth();

========================================================
*/

export function useAuth() {
  return useContext(AuthContext);
}

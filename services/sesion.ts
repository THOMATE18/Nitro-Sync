/*
=======================================================
NITRO SYNC - RESOLUCIÓN DE LA SESIÓN
=======================================================

Traduce una sesión de Firebase Authentication a los
datos que necesita la aplicación:

  - rol        -> custom claim `role`
  - orgId      -> custom claim `orgId`
  - debe cambiar contraseña -> perfil del usuario

IMPORTANTE:

- Los claims son la única fuente de autoridad sobre el rol.
- El perfil en Firestore solo se usa para datos de pantalla.
- Si no hay claim de rol, se comprueba la colección heredada
  `administradores/{uid}` para no romper la cuenta de
  administrador existente.
=======================================================
*/

import type { User } from 'firebase/auth';

import { doc, getDoc } from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import { esAdministrador } from '@/services/roles';

import { ROLES, type Rol } from '@/types/negocio';

export interface DatosSesion {
  rol: Rol;
  orgId: string | null;
  claimsVersion: number;
  debeCambiarContrasena: boolean;
  correoVerificado: boolean;
  /** true si el rol vino de `administradores` y no de un claim. */
  rolHeredado: boolean;
}

const SESION_INVITADO: DatosSesion = {
  rol: 'customer',
  orgId: null,
  claimsVersion: 0,
  debeCambiarContrasena: false,
  correoVerificado: false,
  rolHeredado: false,
};

export async function resolverSesion(usuario: User | null): Promise<DatosSesion> {
  if (!usuario) return SESION_INVITADO;

  let rol: Rol = 'customer';
  let orgId: string | null = null;
  let claimsVersion = 0;

  try {
    /*
    Se fuerza la renovación del token para reflejar cambios
    recientes de claims (por ejemplo, cuando el
    administrador suspende una organización).
    */
    const token = await usuario.getIdTokenResult(true);
    const claims = token.claims as Record<string, unknown>;

    if (typeof claims.role === 'string' && ROLES.includes(claims.role as Rol)) {
      rol = claims.role as Rol;
    }

    if (typeof claims.orgId === 'string' && claims.orgId.length > 0) {
      orgId = claims.orgId;
    }

    if (typeof claims.claimsVersion === 'number') {
      claimsVersion = claims.claimsVersion;
    }
  } catch {
    /* Sin red: se mantiene el rol mínimo. */
  }

  let rolHeredado = false;

  if (rol === 'customer') {
    const admin = await esAdministrador(usuario.uid);

    if (admin) {
      rol = 'super_admin';
      rolHeredado = true;
    }
  }

  let debeCambiarContrasena = false;

  try {
    const perfil = await getDoc(doc(db, 'usuarios', usuario.uid));

    if (perfil.exists()) {
      const datos = perfil.data();
      debeCambiarContrasena = Boolean(datos?.seguridad?.mustChangePassword);
    }
  } catch {
    /* Si el perfil no existe o no es legible, no se bloquea. */
  }

  return {
    rol,
    orgId,
    claimsVersion,
    debeCambiarContrasena,
    correoVerificado: usuario.emailVerified,
    rolHeredado,
  };
}

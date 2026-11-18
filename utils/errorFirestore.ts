/*
=======================================================
NITRO SYNC - ERRORES DE FIRESTORE AMIGABLES
=======================================================

Firestore devuelve códigos técnicos. Esta función los
traduce a mensajes claros para que la persona sepa qué
hacer (publicar reglas, crear la base de datos, etc.).

Se comparte entre vehículos, documentos y las demás
colecciones.

=======================================================
*/

export function describirErrorFirestore(
  error: Error & { code?: string }
): string {
  switch (error.code) {
    case 'permission-denied':
      return (
        'Firestore rechazó la consulta. Publica las reglas de ' +
        'seguridad (firestore.rules) en la consola de Firebase.'
      );

    case 'failed-precondition':
      return (
        'Firestore no está creado. Crea la base de datos en la ' +
        'consola de Firebase (Firestore Database → Crear base).'
      );

    case 'unavailable':
      return 'Sin conexión con Firestore. Revisa tu conexión a internet.';

    default:
      return 'No fue posible cargar los datos de Firestore.';
  }
}

/*
=======================================================
CLASIFICACIÓN DE ERRORES (PARA ESTADOS DE PANTALLA)
=======================================================

A diferencia de `describirErrorFirestore` (pensado para
avisos genéricos), esta función separa los tres casos que
una pantalla debe mostrar de forma distinta:

  - 'red'        -> no hay conexión (reintentar suele servir).
  - 'permisos'   -> las reglas bloquean la lectura.
  - 'indice'     -> falta un índice compuesto en Firestore.
  - 'desconocido'-> cualquier otro fallo.

Así el panel puede mostrar un mensaje distinto y un botón
"Reintentar" en vez de un único error genérico.
=======================================================
*/

/**
 * true cuando Firestore rechazó la lectura por reglas de seguridad.
 * Con el bloqueo por membresía activo, una aseguradora INACTIVA
 * recibe exactamente este código al consultar vehículos o
 * cotizaciones: es un estado esperado, no una falla de red.
 */
export function esPermisoDenegado(
  error: unknown
): error is Error & { code: 'permission-denied' } {
  return (
    error instanceof Error &&
    (error as Error & { code?: string }).code === 'permission-denied'
  );
}

export type TipoErrorFirestore = 'red' | 'permisos' | 'indice' | 'desconocido';

export interface ErrorFirestoreClasificado {
  tipo: TipoErrorFirestore;
  titulo: string;
  mensaje: string;
}

export function clasificarErrorFirestore(
  error: Error & { code?: string }
): ErrorFirestoreClasificado {
  switch (error.code) {
    case 'unavailable':
    case 'deadline-exceeded':
      return {
        tipo: 'red',
        titulo: 'Sin conexión',
        mensaje:
          'No pudimos contactar a Firestore. Revisa tu conexión a internet e inténtalo de nuevo.',
      };

    case 'permission-denied':
      return {
        tipo: 'permisos',
        titulo: 'Acceso no autorizado',
        mensaje:
          'Tu cuenta no tiene permiso para leer estos datos. Si eres aseguradora, pide al administrador que habilite el acceso de tu organización.',
      };

    case 'failed-precondition':
      return {
        tipo: 'indice',
        titulo: 'Consulta no preparada',
        mensaje:
          'Falta un índice en Firestore para esta consulta. Avísale al administrador de la plataforma.',
      };

    default:
      return {
        tipo: 'desconocido',
        titulo: 'No se pudieron cargar los datos',
        mensaje:
          error.message ||
          'Ocurrió un error inesperado. Inténtalo de nuevo en unos segundos.',
      };
  }
}

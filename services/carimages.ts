/*
=======================================================
NITRO SYNC - CARIMAGES (FOTOS DE VEHÍCULOS)
=======================================================

Sustituye la búsqueda en Wikimedia por la API de
CarImages (https://carimagesapi.com), que entrega fotos
de estudio de carros y motos a partir de marca, modelo y
año.

MODO DE USO

  La clave se lee de EXPO_PUBLIC_CARIMAGES_KEY (archivo
  `.env.local`, fuera de Git). Es una clave PÚBLICA por
  diseño: viaja en la URL de la imagen (`?key=`). El
  `api_secret` NUNCA debe llegar a la app.

  URL pública:

    /image?type=car&make=Mazda&model=3&year=2022
          &width=1200&format=webp&key=ci_xxx

LIMITACIONES DEL PLAN GRATUITO

  - 5.000 peticiones/mes y 60 rpm.
  - Solo WebP y con marca de agua.
  - Si no hay coincidencia, el endpoint /image devuelve
    una imagen de relleno en vez de un error.

Si no hay clave o la petición falla, `buscarImagenCarImages`
devuelve null y el llamador cae a la búsqueda anterior
(Wikimedia) o a la imagen genérica.

=======================================================
*/

import type { TipoVehiculo } from '@/types/models';

const BASE = 'https://carimagesapi.com/image';

/** Clave pública de CarImages (opcional). */
const CLAVE = (process.env.EXPO_PUBLIC_CARIMAGES_KEY ?? '').trim();

export interface DatosCarImages {
  marca: string;
  modelo: string;
  tipo: TipoVehiculo;
  year?: number;
}

/** true si hay una clave configurada y CarImages puede usarse. */
export function carimagesDisponible(): boolean {
  return CLAVE.length > 0;
}

/**
 * Construye la URL pública de CarImages.
 * Nunca incluye el api_secret (no debe existir en la app).
 */
export function construirUrlCarImages(datos: DatosCarImages): string {
  const parametros = new URLSearchParams();

  parametros.set('type', datos.tipo === 'Moto' ? 'moto' : 'car');
  parametros.set('make', datos.marca.trim());

  if (datos.modelo.trim()) {
    parametros.set('model', datos.modelo.trim());
  }

  if (datos.year) {
    parametros.set('year', String(datos.year));
  }

  parametros.set('width', '1200');
  parametros.set('format', 'webp');
  parametros.set('key', CLAVE);

  return `${BASE}?${parametros.toString()}`;
}

/**
 * Devuelve la URL de CarImages o null si no se puede usar.
 *
 * No hace una petición de comprobación: la clave viaja en
 * la URL y expo-image carga la imagen directamente. Así se
 * gasta una sola petición del cupo mensual por vehículo.
 */
export async function buscarImagenCarImages(
  datos: DatosCarImages
): Promise<string | null> {
  if (!carimagesDisponible()) return null;

  if (!datos.marca.trim()) return null;

  try {
    return construirUrlCarImages(datos);
  } catch {
    return null;
  }
}

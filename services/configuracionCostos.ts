/*
=======================================================
NITRO SYNC - COSTOS Y PRECIOS GLOBALES (F7)
=======================================================

  configuracionCostos/{clave_tipo}

El administrador ajusta aquí los precios SUGERIDOS que ve
el propietario al registrar sus gastos mensuales. Si no
hay documento para un concepto, se usa el valor local de
`data/costosVehiculo.ts` (comportamiento actual).

Consultas: colección simple y lectura por id. Sin índices.
=======================================================
*/

import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import {
  CONCEPTOS_COSTO,
  valorSugerido,
  type ConceptoCosto,
} from '@/data/costosVehiculo';

import type { ConfiguracionCosto } from '@/types/negocio';
import type { TipoVehiculo } from '@/types/models';

const COLECCION = 'configuracionCostos';

export function idConfiguracionCosto(
  clave: string,
  tipo: TipoVehiculo
): string {
  return `${clave}_${tipo.toLowerCase()}`;
}

function convertir(id: string, datos: DocumentData): ConfiguracionCosto {
  return {
    id,
    clave: String(datos.clave ?? id.split('_')[0]),
    tipoVehiculo: (datos.tipoVehiculo ?? 'Carro') as TipoVehiculo,
    valorCop: Number(datos.valorCop ?? 0),
    nota: datos.nota ?? null,
    actualizadaEn: Number(datos.actualizadaEn ?? 0),
  };
}

export function suscribirConfiguracionCostos(
  onData: (configuraciones: ConfiguracionCosto[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, COLECCION),
    (instantanea) => {
      onData(
        instantanea.docs
          .map((documento) => convertir(documento.id, documento.data()))
          .sort(
            (a, b) =>
              a.tipoVehiculo.localeCompare(b.tipoVehiculo) ||
              a.clave.localeCompare(b.clave)
          )
      );
    },
    (error) => onError?.(error)
  );
}

export async function guardarConfiguracionCosto(datos: {
  clave: string;
  tipoVehiculo: TipoVehiculo;
  valorCop: number;
  nota?: string | null;
}): Promise<void> {
  await setDoc(
    doc(db, COLECCION, idConfiguracionCosto(datos.clave, datos.tipoVehiculo)),
    {
      clave: datos.clave,
      tipoVehiculo: datos.tipoVehiculo,
      valorCop: datos.valorCop,
      nota: datos.nota?.trim() || null,
      actualizadaEn: Date.now(),
    },
    { merge: true }
  );
}

/**
 * Precio sugerido effective: primero la configuración global,
 * después el valor local del concepto. Así la F7 es aditiva.
 */
export function valorSugeridoDesdeConfig(
  configuraciones: ConfiguracionCosto[],
  concepto: ConceptoCosto,
  tipo: TipoVehiculo
): number {
  const id = idConfiguracionCosto(concepto.clave, tipo);
  const guardado = configuraciones.find((c) => c.id === id);

  return guardado ? guardado.valorCop : valorSugerido(concepto, tipo);
}

/** Conceptos locales disponibles (para poblar la pantalla de admin). */
export function conceptosSinConfigurar(
  configuraciones: ConfiguracionCosto[]
): ConceptoCosto[] {
  const ids = new Set(configuraciones.map((c) => c.id));

  return CONCEPTOS_COSTO.filter(
    (concepto) =>
      !ids.has(idConfiguracionCosto(concepto.clave, 'Carro')) ||
      !ids.has(idConfiguracionCosto(concepto.clave, 'Moto'))
  );
}

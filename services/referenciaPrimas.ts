/*
=======================================================
NITRO SYNC - SERVICIO DE REFERENCIA DE PRIMAS (F7)
=======================================================

  referenciaPrimas/{id}

El administrador puede cargar/editar la tabla; cualquier
usuario autenticado puede leerla para ver el precio
sugerido. Consulta de colección simple: sin índices nuevos.
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

import type { ReferenciaPrima } from '@/types/negocio';
import type { TipoVehiculo } from '@/types/models';

const COLECCION = 'referenciaPrimas';

function convertir(id: string, datos: DocumentData): ReferenciaPrima {
  return {
    id,
    producto: String(datos.producto ?? 'SOAT'),
    anio: Number(datos.anio ?? 0),
    tipoVehiculo: (datos.tipoVehiculo ?? 'Carro') as TipoVehiculo,
    rango: String(datos.rango ?? ''),
    cilindradaMin: datos.cilindradaMin ?? null,
    cilindradaMax: datos.cilindradaMax ?? null,
    valorCop: datos.valorCop ?? null,
    nota: datos.nota ?? null,
    actualizadaEn: Number(datos.actualizadaEn ?? 0),
  };
}

export function suscribirReferenciaPrimas(
  onData: (primas: ReferenciaPrima[]) => void,
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
              (a.cilindradaMin ?? -1) - (b.cilindradaMin ?? -1)
          )
      );
    },
    (error) => onError?.(error)
  );
}

export async function guardarReferenciaPrima(
  prima: ReferenciaPrima
): Promise<void> {
  await setDoc(
    doc(db, COLECCION, prima.id),
    {
      producto: prima.producto,
      anio: prima.anio,
      tipoVehiculo: prima.tipoVehiculo,
      rango: prima.rango,
      cilindradaMin: prima.cilindradaMin,
      cilindradaMax: prima.cilindradaMax,
      valorCop: prima.valorCop,
      nota: prima.nota,
      actualizadaEn: Date.now(),
    },
    { merge: true }
  );
}

/** Busca la prima de referencia que aplica a un vehículo. */
export function primaParaVehiculo(
  primas: ReferenciaPrima[],
  tipo: TipoVehiculo,
  cilindrada?: number | null,
  anio = 2026
): ReferenciaPrima | null {
  const candidatas = primas.filter(
    (p) => p.anio === anio && p.tipoVehiculo === tipo
  );

  if (tipo !== 'Moto') return candidatas[0] ?? null;

  const cc = Number(cilindrada ?? 0);

  return (
    candidatas.find(
      (p) =>
        (p.cilindradaMin === null || cc >= p.cilindradaMin) &&
        (p.cilindradaMax === null || cc <= p.cilindradaMax)
    ) ?? null
  );
}

/*
=======================================================
NITRO SYNC - COTIZACIONES (PROPIETARIO -> ASEGURADORA)
=======================================================

  cotizaciones/{id}

El propietario envía una cotización a UNA O VARIAS
aseguradoras. Se crea un documento por cada aseguradora
destino, identificado por `aseguradoraClave` (la misma clave
multi-tenant de `data/aseguradoras.ts`).

Cada aseguradora lee SOLO las suyas:

  where('aseguradoraClave', '==', claveDeMiOrganizacion)

La consulta y las reglas comparten el mismo filtro, así que la
aseguradora nunca descarga cotizaciones ajenas.

El id es determinista (`uid_vehiculoId_clave`): reenviar la
misma solicitud no duplica el documento.
=======================================================
*/

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import { esPermisoDenegado } from '@/utils/errorFirestore';
import { hoyISO } from '@/utils/fechas';

import {
  idCotizacion,
  type Cotizacion,
  type EstadoCotizacion,
  type NuevaCotizacion,
} from '@/types/negocio';

const COLECCION = 'cotizaciones';

function convertir(id: string, datos: DocumentData): Cotizacion {
  return {
    id,
    uid: String(datos.uid ?? ''),
    email: String(datos.email ?? ''),
    vehiculoId: String(datos.vehiculoId ?? ''),
    vehiculoNombre: String(datos.vehiculoNombre ?? ''),
    placa: String(datos.placa ?? ''),
    tipoVehiculo: (datos.tipoVehiculo ?? 'Carro') as Cotizacion['tipoVehiculo'],
    aseguradoraClave: String(datos.aseguradoraClave ?? ''),
    aseguradora: String(datos.aseguradora ?? ''),
    telefono: String(datos.telefono ?? ''),
    nota: String(datos.nota ?? ''),
    estado: (datos.estado ?? 'nueva') as EstadoCotizacion,
    primaCop: datos.primaCop ?? null,
    fecha: String(datos.fecha ?? ''),
    creadaEn: Number(datos.creadaEn ?? 0),
    actualizadaEn: Number(datos.actualizadaEn ?? 0),
    atendidaPor: datos.atendidaPor ?? null,
    atendidaFecha: datos.atendidaFecha ?? null,
  };
}

export function cotizacionRef(id: string) {
  return doc(db, COLECCION, id);
}

export async function crearCotizacion(datos: NuevaCotizacion): Promise<string> {
  const id = idCotizacion(datos.uid, datos.vehiculoId, datos.aseguradoraClave);
  const marca = Date.now();

  const cotizacion: Omit<Cotizacion, 'id'> = {
    ...datos,
    estado: 'nueva',
    primaCop: null,
    fecha: hoyISO(),
    creadaEn: marca,
    actualizadaEn: marca,
    atendidaPor: null,
    atendidaFecha: null,
  };

  await setDoc(cotizacionRef(id), cotizacion);

  return id;
}

/** Cotizaciones del propietario (todas sus aseguradoras destino). */
export function suscribirMisCotizaciones(
  uid: string,
  onData: (cotizaciones: Cotizacion[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION), where('uid', '==', uid)),
    (snapshot) => {
      onData(
        snapshot.docs
          .map((documento) => convertir(documento.id, documento.data()))
          .sort((a, b) => b.creadaEn - a.creadaEn)
      );
    },
    (error) => onError?.(error)
  );
}

/** Cotizaciones dirigidas a la aseguradora activa. */
export function suscribirCotizacionesAseguradora(
  clave: string,
  onData: (cotizaciones: Cotizacion[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, COLECCION),
      where('aseguradoraClave', '==', clave)
    ),
    (snapshot) => {
      onData(
        snapshot.docs
          .map((documento) => convertir(documento.id, documento.data()))
          .sort((a, b) => {
            if (a.estado !== b.estado) {
              return a.estado === 'nueva' ? -1 : b.estado === 'nueva' ? 1 : 0;
            }

            return b.creadaEn - a.creadaEn;
          })
      );
    },
    (error) => {
      /* Membresía inactiva: estado esperado, no error de red. */
      if (esPermisoDenegado(error)) {
        onData([]);
        return;
      }

      onError?.(error);
    }
  );
}

/** Todas las cotizaciones (solo super_admin). */
export function suscribirTodasCotizaciones(
  onData: (cotizaciones: Cotizacion[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION), orderBy('creadaEn', 'desc')),
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) =>
          convertir(documento.id, documento.data())
        )
      );
    },
    (error) => onError?.(error)
  );
}

export interface CambiosCotizacion {
  estado: EstadoCotizacion;
  primaCop?: number | null;
  atendidaPor?: string | null;
}

export async function actualizarCotizacion(
  id: string,
  cambios: CambiosCotizacion
): Promise<void> {
  await updateDoc(cotizacionRef(id), {
    estado: cambios.estado,
    primaCop: cambios.primaCop ?? null,
    atendidaPor: cambios.atendidaPor ?? null,
    atendidaFecha: hoyISO(),
    actualizadaEn: Date.now(),
  });
}

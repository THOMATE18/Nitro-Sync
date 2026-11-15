/*
=======================================================
NITRO SYNC - PÓLIZAS Y OFERTAS DE RENOVACIÓN
=======================================================

  policies/{policyId}   -> pólizas de la aseguradora
  offers/{offerId}      -> ofertas de renovación al propietario

La aseguradora crea pólizas y ofertas; el propietario las
consulta desde la app. Las ofertas quedan en `enviada`
hasta que el propietario responde (aceptar/rechazar).

El número de póliza es único por organización, así que el
id del documento se deriva de `orgId` + número para evitar
duplicados.
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

import type {
  EstadoOferta,
  EstadoPoliza,
  Oferta,
  Poliza,
} from '@/types/negocio';

const COLECCION_POLIZAS = 'policies';
const COLECCION_OFERTAS = 'offers';

/* -----------------------------------------------
   PÓLIZAS
----------------------------------------------- */

function convertirPoliza(id: string, datos: DocumentData): Poliza {
  return {
    id,
    vehiculoId: String(datos.vehiculoId ?? ''),
    propietarioUid: String(datos.propietarioUid ?? ''),
    orgId: String(datos.orgId ?? ''),
    producto: String(datos.producto ?? 'General'),
    numero: String(datos.numero ?? ''),
    placa: String(datos.placa ?? ''),
    vigenciaInicio: String(datos.vigenciaInicio ?? ''),
    vigenciaFin: String(datos.vigenciaFin ?? ''),
    primaCop: datos.primaCop ?? null,
    estado: (datos.estado ?? 'vigente') as EstadoPoliza,
    creadaEn: Number(datos.creadaEn ?? 0),
    actualizadaEn: Number(datos.actualizadaEn ?? 0),
  };
}

export function polizaRef(orgId: string, numero: string) {
  const limpio = numero.replace(/[^a-zA-Z0-9]+/g, '-');
  return doc(db, COLECCION_POLIZAS, `${orgId}_${limpio}`);
}

export function suscribirPolizasOrg(
  orgId: string,
  onData: (polizas: Poliza[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, COLECCION_POLIZAS),
      where('orgId', '==', orgId),
      orderBy('actualizadaEn', 'desc')
    ),
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) =>
          convertirPoliza(documento.id, documento.data())
        )
      );
    },
    (error) => onError?.(error)
  );
}

export function suscribirPolizasPropietario(
  propietarioUid: string,
  onData: (polizas: Poliza[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, COLECCION_POLIZAS),
      where('propietarioUid', '==', propietarioUid),
      orderBy('actualizadaEn', 'desc')
    ),
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) =>
          convertirPoliza(documento.id, documento.data())
        )
      );
    },
    (error) => onError?.(error)
  );
}

/** Todas las pólizas de la plataforma (solo super_admin). */
export function suscribirTodasPolizas(
  onData: (polizas: Poliza[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION_POLIZAS), orderBy('actualizadaEn', 'desc')),
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) =>
          convertirPoliza(documento.id, documento.data())
        )
      );
    },
    (error) => onError?.(error)
  );
}

export interface NuevaPoliza {
  vehiculoId: string;
  propietarioUid: string;
  orgId: string;
  producto: string;
  numero: string;
  placa: string;
  vigenciaInicio: string;
  vigenciaFin: string;
  primaCop?: number | null;
  estado?: EstadoPoliza;
}

export async function crearPoliza(datos: NuevaPoliza): Promise<string> {
  const marca = Date.now();
  const referencia = polizaRef(datos.orgId, datos.numero);

  await setDoc(
    referencia,
    {
      vehiculoId: datos.vehiculoId,
      propietarioUid: datos.propietarioUid,
      orgId: datos.orgId,
      producto: datos.producto,
      numero: datos.numero,
      placa: datos.placa,
      vigenciaInicio: datos.vigenciaInicio,
      vigenciaFin: datos.vigenciaFin,
      primaCop: datos.primaCop ?? null,
      estado: datos.estado ?? ('vigente' as EstadoPoliza),
      creadaEn: marca,
      actualizadaEn: marca,
    },
    { merge: true }
  );

  return referencia.id;
}

export async function actualizarPoliza(
  orgId: string,
  numero: string,
  cambios: Partial<Pick<Poliza, 'vigenciaFin' | 'primaCop' | 'estado' | 'producto'>>
): Promise<void> {
  await updateDoc(polizaRef(orgId, numero), {
    ...cambios,
    actualizadaEn: Date.now(),
  });
}

/* -----------------------------------------------
   OFERTAS
----------------------------------------------- */

function convertirOferta(id: string, datos: DocumentData): Oferta {
  return {
    id,
    polizaId: String(datos.polizaId ?? ''),
    vehiculoId: String(datos.vehiculoId ?? ''),
    propietarioUid: String(datos.propietarioUid ?? ''),
    orgId: String(datos.orgId ?? ''),
    titulo: String(datos.titulo ?? 'Renovación'),
    descripcion: datos.descripcion ?? null,
    primaCop: datos.primaCop ?? null,
    vigenciaFin: datos.vigenciaFin ?? null,
    estado: (datos.estado ?? 'enviada') as EstadoOferta,
    creadaEn: Number(datos.creadaEn ?? 0),
    respondidaEn: datos.respondidaEn ?? null,
  };
}

export function suscribirOfertasOrg(
  orgId: string,
  onData: (ofertas: Oferta[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, COLECCION_OFERTAS),
      where('orgId', '==', orgId),
      orderBy('creadaEn', 'desc')
    ),
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) =>
          convertirOferta(documento.id, documento.data())
        )
      );
    },
    (error) => onError?.(error)
  );
}

export function suscribirOfertasPropietario(
  propietarioUid: string,
  onData: (ofertas: Oferta[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, COLECCION_OFERTAS),
      where('propietarioUid', '==', propietarioUid),
      orderBy('creadaEn', 'desc')
    ),
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) =>
          convertirOferta(documento.id, documento.data())
        )
      );
    },
    (error) => onError?.(error)
  );
}

export interface NuevaOferta {
  polizaId: string;
  vehiculoId: string;
  propietarioUid: string;
  orgId: string;
  titulo: string;
  descripcion?: string | null;
  primaCop?: number | null;
  vigenciaFin?: string | null;
}

export async function crearOferta(datos: NuevaOferta): Promise<string> {
  const referencia = doc(collection(db, COLECCION_OFERTAS));

  await setDoc(referencia, {
    polizaId: datos.polizaId,
    vehiculoId: datos.vehiculoId,
    propietarioUid: datos.propietarioUid,
    orgId: datos.orgId,
    titulo: datos.titulo,
    descripcion: datos.descripcion ?? null,
    primaCop: datos.primaCop ?? null,
    vigenciaFin: datos.vigenciaFin ?? null,
    estado: 'enviada' as EstadoOferta,
    creadaEn: Date.now(),
    respondidaEn: null,
  });

  return referencia.id;
}

export async function responderOferta(
  ofertaId: string,
  estado: Extract<EstadoOferta, 'aceptada' | 'rechazada'>
): Promise<void> {
  await updateDoc(doc(db, COLECCION_OFERTAS, ofertaId), {
    estado,
    respondidaEn: new Date().toISOString(),
  });
}

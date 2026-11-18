import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import { hoyISO } from '@/utils/fechas';

import {
  idResena,
  type NuevaOpinion,
  type NuevaResena,
  type Opinion,
  type Resena,
} from '@/types/models';

export function opinionRef(uid: string) {
  return doc(db, 'opiniones', uid);
}

export async function leerMiOpinion(uid: string): Promise<Opinion | null> {
  const snapshot = await getDoc(opinionRef(uid));

  return snapshot.exists() ? (snapshot.data() as Opinion) : null;
}

export async function guardarOpinion(
  uid: string,
  email: string,
  datos: NuevaOpinion
): Promise<void> {
  const opinion: Opinion = {
    ...datos,
    uid,
    email,
    fecha: hoyISO(),
  };

  await setDoc(opinionRef(uid), opinion);
}

export function suscribirOpiniones(
  onData: (opiniones: Opinion[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, 'opiniones'),
    (snapshot) => {
      onData(snapshot.docs.map((documento) => documento.data() as Opinion));
    },
    (error) => {
      onError?.(error);
    }
  );
}

/* -------------------------------------------------------
   RESEÑAS DE VEHÍCULOS
   ------------------------------------------------------- */

export function resenaRef(uid: string, vehiculoId: string) {
  return doc(db, 'resenas', idResena(uid, vehiculoId));
}

function aResena(id: string, datos: Record<string, unknown>): Resena {
  return { ...(datos as Omit<Resena, 'id'>), id };
}

/** Reseñas del propietario (una por vehículo), en tiempo real. */
export function suscribirMisResenas(
  uid: string,
  onData: (resenas: Resena[]) => void,
  onError?: (error: Error) => void
): () => void {
  const consulta = query(collection(db, 'resenas'), where('uid', '==', uid));

  return onSnapshot(
    consulta,
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) => aResena(documento.id, documento.data()))
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

/** Todas las reseñas (bandeja del administrador), en tiempo real. */
export function suscribirResenas(
  onData: (resenas: Resena[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, 'resenas'),
    (snapshot) => {
      onData(
        snapshot.docs.map((documento) => aResena(documento.id, documento.data()))
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

/**
 * Crea o actualiza la reseña de un vehículo. El id es
 * determinista, así que reenviar la reseña no duplica nada.
 * Al editarse vuelve a quedar SIN leer para el administrador.
 */
export async function guardarResena(
  uid: string,
  email: string,
  datos: NuevaResena
): Promise<void> {
  const referencia = resenaRef(uid, datos.vehiculoId);
  const actual = await getDoc(referencia);
  const ahora = Date.now();

  const contenido = {
    vehiculoNombre: datos.vehiculoNombre,
    placa: datos.placa,
    tipoVehiculo: datos.tipoVehiculo,
    calificacion: datos.calificacion,
    titulo: datos.titulo,
    comentario: datos.comentario,
  };

  if (actual.exists()) {
    await updateDoc(referencia, {
      ...contenido,
      leida: false,
      actualizadaEn: ahora,
    });

    return;
  }

  const resena: Omit<Resena, 'id'> = {
    ...contenido,
    vehiculoId: datos.vehiculoId,
    uid,
    email,
    leida: false,
    fecha: hoyISO(),
    creadaEn: ahora,
    actualizadaEn: ahora,
  };

  await setDoc(referencia, resena);
}

/** El administrador marca una reseña como leída o no leída. */
export async function marcarResenaLeida(
  resenaId: string,
  leida: boolean
): Promise<void> {
  await updateDoc(doc(db, 'resenas', resenaId), { leida });
}

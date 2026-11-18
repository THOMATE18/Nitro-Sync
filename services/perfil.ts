/*
=======================================================
NITRO SYNC - PERFIL DEL USUARIO (FIRESTORE)
=======================================================

Ubicación de los datos:

  usuarios/{uid}   -> documento con el perfil

El perfil se crea de forma idempotente (merge: true),
por lo que llamar varias veces no duplica ni borra
información.

=======================================================
*/

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import { vehiculosCol } from '@/services/vehiculos';

import type { Perfil } from '@/types/models';

/*
=======================================================
REFERENCIA AL PERFIL
=======================================================
*/

export function perfilRef(uid: string) {
  return doc(db, 'usuarios', uid);
}

/*
=======================================================
CREAR PERFIL (SI NO EXISTE)
=======================================================

Se llama al registrarse o al iniciar sesión.
=======================================================
*/

export async function crearPerfil(
  uid: string,
  email: string
): Promise<void> {
  const fechaRegistro = new Date().toISOString().slice(0, 10);

  await setDoc(
    perfilRef(uid),
    {
      uid,
      email,
      fechaRegistro,
    },
    { merge: true }
  );
}

/*
=======================================================
SUSCRIPCIÓN AL PERFIL EN TIEMPO REAL
=======================================================

Devuelve la función de limpieza del listener.
=======================================================
*/

export function suscribirPerfil(
  uid: string,
  onData: (perfil: Perfil | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    perfilRef(uid),
    (snapshot: DocumentSnapshot) => {
      onData(
        snapshot.exists() ? (snapshot.data() as Perfil) : null
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

/**
 * Guarda el teléfono del cliente y lo propaga a la copia que
 * ven las aseguradoras (`usuarios/{uid}/vehiculos/{id}.contactoPropietario`).
 * Así el cambio desde el perfil se refleja de inmediato sin
 * duplicar una colección de contacto.
 */
export async function guardarTelefono(
  uid: string,
  telefono: string
): Promise<void> {
  await setDoc(perfilRef(uid), { telefono }, { merge: true });

  const vehiculos = await getDocs(vehiculosCol(uid));
  if (vehiculos.empty) return;

  const ahora = Date.now();
  const lote = writeBatch(db);
  vehiculos.forEach((documento) => {
    const contacto = documento.data().contactoPropietario;
    lote.update(documento.ref, {
      /* Se conserva el nombre; solo se reemplaza el teléfono. */
      contactoPropietario: {
        nombre: contacto?.nombre ?? '',
        telefono,
      },
      actualizadoEn: ahora,
    });
  });
  await lote.commit();

  /* La proyección que lee la aseguradora también se actualiza. */
  const vinculos = await getDocs(
    query(collection(db, 'vehicleInsurerLinks'), where('propietarioUid', '==', uid))
  );
  if (vinculos.empty) return;

  const loteVinculos = writeBatch(db);
  vinculos.forEach((documento) => {
    loteVinculos.update(documento.ref, {
      propietarioTelefono: telefono,
      actualizadoEn: ahora,
    });
  });
  await loteVinculos.commit();
}

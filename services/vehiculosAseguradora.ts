/*
=======================================================
NITRO SYNC - VEHÍCULOS DE LA ASEGURADORA
=======================================================

Lee SOLO los vehículos de la aseguradora activa usando el
campo `aseguradoraClave` (collection group):

  where('aseguradoraClave', '==', claveDeMiOrganizacion)

La aseguradora NUNCA descarga todos los vehículos ni filtra
en el cliente: la consulta y las reglas de Firestore comparten
el mismo filtro. Al cambiar de aseguradora, el vehículo
cambia de clave y deja de ser visible para la anterior.

La clave de la organización vive en
`organizations/{orgId}.aseguradoraClave` (ver
`services/organizaciones.ts` y `data/aseguradoras.ts`).

Para que la consulta funcione hace falta un índice de
COLLECTION_GROUP sobre `aseguradoraClave` (ver
`firestore.indexes.json`).
=======================================================
*/

import {
  collectionGroup,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import type { VehiculoAdmin } from '@/types/models';
import { esPermisoDenegado } from '@/utils/errorFirestore';

/*
=======================================================
SUSCRIPCIÓN EN TIEMPO REAL
=======================================================

Devuelve la función de limpieza del listener. El orden se
calcula en el cliente (sin `orderBy`) para no exigir un
índice compuesto.
=======================================================
*/

export function suscribirVehiculosAseguradora(
  clave: string,
  onData: (vehiculos: VehiculoAdmin[]) => void,
  onError?: (error: Error) => void
): () => void {
  const consulta = query(
    collectionGroup(db, 'vehiculos'),
    where('aseguradoraClave', '==', clave)
  );

  return onSnapshot(
    consulta,
    (snapshot: QuerySnapshot<DocumentData>) => {
      const lista = snapshot.docs
        .map(
          (documento) =>
            ({
              id: documento.id,
              ...documento.data(),
              propietarioUid: documento.ref.parent.parent?.id ?? '',
            }) as VehiculoAdmin
        )
        .sort((a, b) =>
          (a.placa || a.nombre || '').localeCompare(
            b.placa || b.nombre || '',
            'es'
          )
        );

      onData(lista);
    },
    (error) => {
      /*
      Con el bloqueo por membresía, una aseguradora INACTIVA no
      tiene permiso para leer vehículos. Es un estado esperado:
      se entrega una lista vacía y el banner del panel explica
      qué hacer. No se registra como error de red.
      */
      if (esPermisoDenegado(error)) {
        onData([]);
        return;
      }

      onError?.(error);
    }
  );
}

/* Límite seguro por lote (Firestore permite hasta 500). */
const TAMANO_LOTE = 400;

/*
=======================================================
SINCRONIZAR EL TELÉFONO DE LA ASEGURADORA

Copia el teléfono de contacto de la organización a
`telefonoAseguradora` de TODOS sus vehículos. Solo escribe ese
campo y solo cuando cambia:

  - Es IDEMPOTENTE: repetirlo no cambia nada.
  - Es ADITIVO: no toca ningún otro campo del vehículo.

Devuelve cuántos vehículos quedaron con el teléfono al día.
Las reglas permiten a la aseguradora actualizar
`telefonoAseguradora` de sus propios vehículos.
=======================================================
*/
export async function sincronizarTelefonoAseguradora(
  clave: string,
  telefono: string
): Promise<number> {
  if (!clave) return 0;

  const snapshot = await getDocs(
    query(
      collectionGroup(db, 'vehiculos'),
      where('aseguradoraClave', '==', clave)
    )
  );

  const pendientes = snapshot.docs.filter(
    (documento) =>
      String(documento.data().telefonoAseguradora ?? '') !== telefono
  );

  let actualizados = 0;

  for (let i = 0; i < pendientes.length; i += TAMANO_LOTE) {
    const lote = writeBatch(db);
    const grupo = pendientes.slice(i, i + TAMANO_LOTE);

    grupo.forEach((documento) =>
      lote.update(documento.ref, { telefonoAseguradora: telefono })
    );

    await lote.commit();
    actualizados += grupo.length;
  }

  return actualizados;
}

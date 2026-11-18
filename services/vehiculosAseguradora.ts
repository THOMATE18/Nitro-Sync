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
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import type { VehiculoAdmin } from '@/types/models';

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
      onError?.(error);
    }
  );
}

import {
  collectionGroup,
  doc,
  getDocs,
  onSnapshot,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type QuerySnapshot,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import { claveAseguradora } from '@/data/aseguradoras';

import { hoyISO } from '@/utils/fechas';

import type { Vehiculo, VehiculoAdmin } from '@/types/models';

export interface DatosSeguroAsignado {
  aseguradora: string;
  telefonoAseguradora: string;
  numeroPoliza: string;
  vencimientoSeguro: string;
  /*
  Clave normalizada de la aseguradora (ver
  `data/aseguradoras.ts`). La escriben los formularios y el
  panel admin; es la que filtra el panel de aseguradora.
  */
  aseguradoraClave?: string;
  /* Copia de solo nombre y teléfono del propietario. */
  contactoPropietario?: { nombre: string; telefono: string };
}

export function suscribirTodosLosVehiculos(
  onData: (vehiculos: VehiculoAdmin[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collectionGroup(db, 'vehiculos'),
    (snapshot: QuerySnapshot<DocumentData>) => {
      const lista = snapshot.docs.map(
        (documento) =>
          ({
            id: documento.id,
            ...documento.data(),
            propietarioUid: documento.ref.parent.parent?.id ?? '',
          }) as VehiculoAdmin
      );

      onData(lista);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function suscribirVehiculoAdmin(
  propietarioUid: string,
  vehiculoId: string,
  onData: (vehiculo: Vehiculo | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    doc(db, 'usuarios', propietarioUid, 'vehiculos', vehiculoId),
    (snapshot) => {
      onData(
        snapshot.exists()
          ? ({ id: snapshot.id, ...snapshot.data() } as Vehiculo)
          : null
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function asignarSeguro(
  propietarioUid: string,
  vehiculoId: string,
  datos: DatosSeguroAsignado,
  adminUid: string,
  solicitudPendienteId?: string
): Promise<void> {
  const lote = writeBatch(db);

  lote.update(
    doc(db, 'usuarios', propietarioUid, 'vehiculos', vehiculoId),
    {
      ...datos,
      seguroAsignadoPor: adminUid,
      seguroAsignadoFecha: hoyISO(),
    }
  );

  if (solicitudPendienteId) {
    lote.update(doc(db, 'solicitudes', solicitudPendienteId), {
      estado: 'Atendida',
      atendidaPor: adminUid,
      atendidaFecha: hoyISO(),
    });
  }

  await lote.commit();
}

export interface ResultadoSincronizacion {
  revisados: number;
  actualizados: number;
}

/*
=======================================================
SINCRONIZAR `aseguradoraClave` (ADMIN)

Recorre TODOS los vehículos (collection group) y recalcula la
clave normalizada de su aseguradora. Solo escribe el campo
`aseguradoraClave` y solo cuando cambia:

  - Es IDEMPOTENTE: volver a ejecutarlo no cambia nada.
  - Es ADITIVO: no toca ningún otro campo del vehículo.

Sirve para poner al día los vehículos creados antes de que
existiera el campo, o tras corregir el directorio de
aseguradoras.
=======================================================
*/
export async function sincronizarAseguradoraClave(): Promise<ResultadoSincronizacion> {
  const snapshot = await getDocs(collectionGroup(db, 'vehiculos'));

  const pendientes: { ref: DocumentReference; clave: string }[] = [];

  snapshot.forEach((documento) => {
    const datos = documento.data();
    const clave = claveAseguradora(String(datos.aseguradora ?? ''));
    const actual = String(datos.aseguradoraClave ?? '');

    if (clave !== actual) {
      pendientes.push({ ref: documento.ref, clave });
    }
  });

  let actualizados = 0;

  for (let i = 0; i < pendientes.length; i += 400) {
    const lote = writeBatch(db);
    const grupo = pendientes.slice(i, i + 400);

    grupo.forEach(({ ref, clave }) => {
      lote.update(ref, { aseguradoraClave: clave });
    });

    await lote.commit();
    actualizados += grupo.length;
  }

  return { revisados: snapshot.size, actualizados };
}

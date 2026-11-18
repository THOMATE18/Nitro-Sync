import {
  collection,
  collectionGroup,
  doc,
  getDoc,
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

export interface ResultadoReparacion {
  organizaciones: number;
  vehiculos: number;
}

/* Copia de solo nombre y teléfono del propietario. */
interface ContactoPropietario {
  nombre: string;
  telefono: string;
}

/* Límite seguro por lote (Firestore permite hasta 500). */
const TAMANO_LOTE = 400;

/* Un cambio pendiente sobre un documento concreto. */
interface CambioPendiente {
  ref: DocumentReference;
  cambios: Record<string, unknown>;
}

/**
 * Extrae el nombre y el teléfono del perfil. Devuelve null si
 * el perfil no tiene ninguno de los dos (no hay nada que
 * copiar al vehículo).
 */
function extraerContacto(datos: DocumentData): ContactoPropietario | null {
  const nombre = String(datos.nombre ?? '').trim();
  const telefono = String(datos.telefono ?? '').trim();

  if (!nombre && !telefono) {
    return null;
  }

  return { nombre, telefono };
}

/** Lee el contacto del propietario; nunca lanza (best-effort). */
async function leerContacto(
  propietarioUid: string
): Promise<ContactoPropietario | null> {
  if (!propietarioUid) {
    return null;
  }

  try {
    const perfil = await getDoc(doc(db, 'usuarios', propietarioUid));
    return perfil.exists() ? extraerContacto(perfil.data()) : null;
  } catch {
    return null;
  }
}

/** Compara el contacto guardado con el del perfil. */
function contactoIgual(
  actual: ContactoPropietario | undefined,
  nuevo: ContactoPropietario
): boolean {
  return (
    !!actual &&
    actual.nombre === nuevo.nombre &&
    actual.telefono === nuevo.telefono
  );
}

/** Aplica los cambios pendientes en lotes. Devuelve cuántos aplicó. */
async function aplicarCambios(pendientes: CambioPendiente[]): Promise<number> {
  let aplicados = 0;

  for (let i = 0; i < pendientes.length; i += TAMANO_LOTE) {
    const lote = writeBatch(db);
    const grupo = pendientes.slice(i, i + TAMANO_LOTE);

    grupo.forEach(({ ref, cambios }) => lote.update(ref, cambios));

    await lote.commit();
    aplicados += grupo.length;
  }

  return aplicados;
}

/*
=======================================================
SINCRONIZAR `aseguradoraClave` DE LAS ORGANIZACIONES

Recorre TODAS las organizaciones y recalcula su clave a partir
del nombre. Solo escribe `aseguradoraClave` y solo cuando
cambia:

  - Es IDEMPOTENTE: repetirlo no cambia nada.
  - Es ADITIVO: no toca ningún otro campo.

Así la aseguradora deja de depender de una clave asignada a
mano: la clave nace del nombre (ver `data/aseguradoras.ts`).
=======================================================
*/
export async function sincronizarOrganizaciones(): Promise<ResultadoSincronizacion> {
  const snapshot = await getDocs(collection(db, 'organizations'));
  const pendientes: CambioPendiente[] = [];

  snapshot.forEach((documento) => {
    const datos = documento.data();
    const clave = claveAseguradora(String(datos.nombre ?? ''));
    const actual = String(datos.aseguradoraClave ?? '');

    if (clave && clave !== actual) {
      pendientes.push({
        ref: documento.ref,
        cambios: { aseguradoraClave: clave },
      });
    }
  });

  const actualizados = await aplicarCambios(pendientes);

  return { revisados: snapshot.size, actualizados };
}

/*
=======================================================
SINCRONIZAR `aseguradoraClave` + `contactoPropietario`
(VEHÍCULOS, ADMIN)

Recorre TODOS los vehículos (collection group) y:

  - recalcula la clave normalizada de su aseguradora;
  - copia el nombre y el teléfono del propietario SOLO en los
    vehículos con seguro (los que la aseguradora puede ver).

Solo escribe esos dos campos y solo cuando cambian:

  - Es IDEMPOTENTE: volver a ejecutarlo no cambia nada.
  - Es ADITIVO: no toca ningún otro campo del vehículo.

Sirve para poner al día los vehículos creados antes de que
existieran esos campos.
=======================================================
*/
export async function sincronizarAseguradoraClave(): Promise<ResultadoSincronizacion> {
  const snapshot = await getDocs(collectionGroup(db, 'vehiculos'));
  const contactos = new Map<string, ContactoPropietario | null>();
  const pendientes: CambioPendiente[] = [];

  for (const documento of snapshot.docs) {
    const datos = documento.data();
    const clave = claveAseguradora(String(datos.aseguradora ?? ''));
    const actual = String(datos.aseguradoraClave ?? '');
    const cambios: Record<string, unknown> = {};

    if (clave !== actual) {
      cambios.aseguradoraClave = clave;
    }

    /* El contacto solo importa en vehículos con seguro. */
    if (clave) {
      const propietarioUid = documento.ref.parent.parent?.id ?? '';

      if (!contactos.has(propietarioUid)) {
        contactos.set(propietarioUid, await leerContacto(propietarioUid));
      }

      const contacto = contactos.get(propietarioUid);

      if (
        contacto &&
        !contactoIgual(
          datos.contactoPropietario as ContactoPropietario | undefined,
          contacto
        )
      ) {
        cambios.contactoPropietario = contacto;
      }
    }

    if (Object.keys(cambios).length > 0) {
      pendientes.push({ ref: documento.ref, cambios });
    }
  }

  const actualizados = await aplicarCambios(pendientes);

  return { revisados: snapshot.size, actualizados };
}

/*
=======================================================
REPARAR TODAS LAS CLAVES (ADMIN)

Atajo que pone al día organizaciones y vehículos. Devuelve
cuántos documentos cambiaron en cada colección. Se usa en
segundo plano al abrir el panel de plataforma.
=======================================================
*/
export async function repararAseguradoraClaves(): Promise<ResultadoReparacion> {
  const organizaciones = await sincronizarOrganizaciones();
  const vehiculos = await sincronizarAseguradoraClave();

  return {
    organizaciones: organizaciones.actualizados,
    vehiculos: vehiculos.actualizados,
  };
}

/*
=======================================================
COMPLETAR CLAVES DEL PROPIETARIO (AUTORREPARACIÓN)

El propietario solo puede escribir SUS vehículos, así que esta
versión no toca organizaciones: completa `aseguradoraClave` y
`contactoPropietario` en los vehículos que ya tiene cargados en
memoria. Es idempotente y no bloquea la interfaz.
=======================================================
*/
export async function completarClavesVehiculos(
  propietarioUid: string,
  vehiculos: Vehiculo[]
): Promise<number> {
  if (!propietarioUid || vehiculos.length === 0) {
    return 0;
  }

  const contacto = await leerContacto(propietarioUid);
  const pendientes: CambioPendiente[] = [];

  vehiculos.forEach((vehiculo) => {
    const clave = claveAseguradora(String(vehiculo.aseguradora ?? ''));
    const actual = String(vehiculo.aseguradoraClave ?? '');
    const cambios: Record<string, unknown> = {};

    if (clave !== actual) {
      cambios.aseguradoraClave = clave;
    }

    if (clave && contacto && !contactoIgual(vehiculo.contactoPropietario, contacto)) {
      cambios.contactoPropietario = contacto;
    }

    if (Object.keys(cambios).length > 0) {
      pendientes.push({
        ref: doc(db, 'usuarios', propietarioUid, 'vehiculos', vehiculo.id),
        cambios,
      });
    }
  });

  return aplicarCambios(pendientes);
}

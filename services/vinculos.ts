/*
=======================================================
NITRO SYNC - VÍNCULOS VEHÍCULO <-> ASEGURADORA
=======================================================

  vehicleInsurerLinks/{linkId}

Es la PROYECCIÓN autorizada que lee la aseguradora. La
aseguradora NUNCA lee `usuarios/{uid}/vehiculos`: solo ve
los vehículos vinculados a su organización, con los campos
técnicos necesarios para gestionar pólizas.

Un mismo vehículo puede estar vinculado a varias
aseguradoras con productos distintos (SOAT, todo riesgo,
etc.). El id del documento es determinista:

  {vehiculoId}_{orgId}_{producto}

Los datos personales del propietario (nombre, correo y
teléfono) solo se incluyen si el propietario otorgó el
consentimiento correspondiente.
=======================================================
*/

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import {
  idVinculo,
  type EstadoVinculo,
  type VinculoAseguradora,
} from '@/types/negocio';

const COLECCION = 'vehicleInsurerLinks';

/*
=======================================================
ORDEN EN EL CLIENTE (SIN ÍNDICE COMPUESTO)
=======================================================

Las consultas se filtran solo por un campo de igualdad
(`orgId` o `propietarioUid`) y se ordenan aquí en
JavaScript. Así NO se necesita un índice compuesto
(where + orderBy) en Firestore, que es la causa real del
error "No se pudieron cargar los vehículos": la consulta
anterior pedía un índice que no estaba desplegado y el
listener fallaba con `failed-precondition`.
=======================================================
*/

function ordenarPorActualizado(
  vinculos: VinculoAseguradora[]
): VinculoAseguradora[] {
  return [...vinculos].sort((a, b) => b.actualizadoEn - a.actualizadoEn);
}

function convertir(id: string, datos: DocumentData): VinculoAseguradora {
  return {
    id,
    vehiculoId: String(datos.vehiculoId ?? ''),
    propietarioUid: String(datos.propietarioUid ?? ''),
    propietarioNombre: datos.propietarioNombre ?? null,
    propietarioTelefono: datos.propietarioTelefono ?? null,
    propietarioCorreo: datos.propietarioCorreo ?? null,
    orgId: String(datos.orgId ?? ''),
    producto: String(datos.producto ?? 'General'),
    placa: String(datos.placa ?? ''),
    marca: String(datos.marca ?? ''),
    modelo: String(datos.modelo ?? ''),
    year: datos.year ?? null,
    tipo: String(datos.tipo ?? 'Carro'),
    poliza: datos.poliza ?? null,
    vigencia: datos.vigencia ?? null,
    estado: (datos.estado ?? 'solicitado') as EstadoVinculo,
    datosPropietarioVisibles: datos.datosPropietarioVisibles === true,
    creadoEn: Number(datos.creadoEn ?? 0),
    actualizadoEn: Number(datos.actualizadoEn ?? 0),
  };
}

export function vinculoRef(
  vehiculoId: string,
  orgId: string,
  producto: string
) {
  return doc(db, COLECCION, idVinculo(vehiculoId, orgId, producto));
}

/** Vínculos de una aseguradora (panel de aseguradora). */
export function suscribirVinculosOrg(
  orgId: string,
  onData: (vinculos: VinculoAseguradora[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION), where('orgId', '==', orgId)),
    (snapshot) => {
      onData(
        ordenarPorActualizado(
          snapshot.docs.map((documento) =>
            convertir(documento.id, documento.data())
          )
        )
      );
    },
    (error) => onError?.(error)
  );
}

/** Vínculos de un propietario (para "Mis seguros"). */
export function suscribirVinculosPropietario(
  propietarioUid: string,
  onData: (vinculos: VinculoAseguradora[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, COLECCION),
      where('propietarioUid', '==', propietarioUid)
    ),
    (snapshot) => {
      onData(
        ordenarPorActualizado(
          snapshot.docs.map((documento) =>
            convertir(documento.id, documento.data())
          )
        )
      );
    },
    (error) => onError?.(error)
  );
}

/** Todos los vínculos de la plataforma (solo super_admin). */
export function suscribirTodosVinculos(
  onData: (vinculos: VinculoAseguradora[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLECCION)),
    (snapshot) => {
      onData(
        ordenarPorActualizado(
          snapshot.docs.map((documento) =>
            convertir(documento.id, documento.data())
          )
        )
      );
    },
    (error) => onError?.(error)
  );
}

export interface NuevoVinculo {
  vehiculoId: string;
  propietarioUid: string;
  propietarioNombre?: string | null;
  propietarioTelefono?: string | null;
  propietarioCorreo?: string | null;
  orgId: string;
  producto: string;
  placa: string;
  marca: string;
  modelo: string;
  year?: number | null;
  tipo: string;
  poliza?: string | null;
  vigencia?: string | null;
  datosPropietarioVisibles?: boolean;
}

export async function crearVinculo(datos: NuevoVinculo): Promise<string> {
  const marca = Date.now();
  const referencia = vinculoRef(
    datos.vehiculoId,
    datos.orgId,
    datos.producto
  );

  await setDoc(
    referencia,
    {
      vehiculoId: datos.vehiculoId,
      propietarioUid: datos.propietarioUid,
      propietarioNombre: datos.propietarioNombre ?? null,
      propietarioTelefono: datos.propietarioTelefono ?? null,
      propietarioCorreo: datos.propietarioCorreo ?? null,
      orgId: datos.orgId,
      producto: datos.producto,
      placa: datos.placa,
      marca: datos.marca,
      modelo: datos.modelo,
      year: datos.year ?? null,
      tipo: datos.tipo,
      poliza: datos.poliza ?? null,
      vigencia: datos.vigencia ?? null,
      estado: 'solicitado' as EstadoVinculo,
      datosPropietarioVisibles: datos.datosPropietarioVisibles === true,
      creadoEn: marca,
      actualizadoEn: marca,
    },
    { merge: true }
  );

  return referencia.id;
}

export async function actualizarVinculo(
  vinculoId: string,
  cambios: Partial<
    Pick<
      VinculoAseguradora,
      | 'estado'
      | 'poliza'
      | 'vigencia'
      | 'producto'
      | 'datosPropietarioVisibles'
    >
  >
): Promise<void> {
  await updateDoc(doc(db, COLECCION, vinculoId), {
    ...cambios,
    actualizadoEn: Date.now(),
  });
}

export async function revocarVinculo(vinculoId: string): Promise<void> {
  await actualizarVinculo(vinculoId, { estado: 'revocado' });
}

export async function eliminarVinculo(vinculoId: string): Promise<void> {
  await deleteDoc(doc(db, COLECCION, vinculoId));
}

/*
=======================================================
NITRO SYNC - CONSENTIMIENTOS DEL PROPIETARIO
=======================================================

  consents/{consentId}

El propietario de un vehículo autoriza (o revoca) que una
aseguradora vea los datos de ese vehículo para una
finalidad concreta:

  - operativo  -> gestión de la póliza y asistencia.
  - comercial  -> envío de ofertas y promociones.

Sin consentimiento vigente, la aseguradora no puede leer
los datos personales del propietario. Los datos técnicos
del vehículo se comparten por separado en
`vehicleInsurerLinks`.

El id del documento es determinista:

  {vehiculoId}_{orgId}_{finalidad}

para que solo exista un consentimiento por combinación.
=======================================================
*/

import {
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  collection,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';

import {
  idConsentimiento,
  type Consentimiento,
  type EstadoConsentimiento,
  type FinalidadConsentimiento,
} from '@/types/negocio';

const COLECCION = 'consents';

function convertir(id: string, datos: DocumentData): Consentimiento {
  return {
    id,
    vehiculoId: String(datos.vehiculoId ?? ''),
    propietarioUid: String(datos.propietarioUid ?? ''),
    orgId: String(datos.orgId ?? ''),
    finalidad: (datos.finalidad ?? 'operativo') as FinalidadConsentimiento,
    estado: (datos.estado ?? 'otorgado') as EstadoConsentimiento,
    alcance: Array.isArray(datos.alcance) ? datos.alcance.map(String) : [],
    otorgadoEn: String(datos.otorgadoEn ?? ''),
    revocadoEn: datos.revocadoEn ?? null,
    actualizadoEn: Number(datos.actualizadoEn ?? 0),
  };
}

export function consentimientoRef(
  vehiculoId: string,
  orgId: string,
  finalidad: FinalidadConsentimiento
) {
  return doc(db, COLECCION, idConsentimiento(vehiculoId, orgId, finalidad));
}

export async function obtenerConsentimiento(
  vehiculoId: string,
  orgId: string,
  finalidad: FinalidadConsentimiento
): Promise<Consentimiento | null> {
  const referencia = consentimientoRef(vehiculoId, orgId, finalidad);
  const documento = await getDoc(referencia);

  return documento.exists()
    ? convertir(documento.id, documento.data())
    : null;
}

/**
 * Otorga (o vuelve a otorgar) un consentimiento.
 * El alcance indica qué datos se comparten.
 */
export async function otorgarConsentimiento(datos: {
  vehiculoId: string;
  propietarioUid: string;
  orgId: string;
  finalidad: FinalidadConsentimiento;
  alcance: string[];
}): Promise<void> {
  const marca = new Date().toISOString();
  const referencia = consentimientoRef(
    datos.vehiculoId,
    datos.orgId,
    datos.finalidad
  );

  await setDoc(
    referencia,
    {
      vehiculoId: datos.vehiculoId,
      propietarioUid: datos.propietarioUid,
      orgId: datos.orgId,
      finalidad: datos.finalidad,
      estado: 'otorgado' as EstadoConsentimiento,
      alcance: datos.alcance,
      otorgadoEn: marca,
      revocadoEn: null,
      actualizadoEn: Date.now(),
      _servidor: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function revocarConsentimiento(
  vehiculoId: string,
  orgId: string,
  finalidad: FinalidadConsentimiento
): Promise<void> {
  const marca = new Date().toISOString();

  await updateDoc(consentimientoRef(vehiculoId, orgId, finalidad), {
    estado: 'revocado' as EstadoConsentimiento,
    revocadoEn: marca,
    actualizadoEn: Date.now(),
  });
}

/** Consentimientos de un propietario (para "Mis seguros"). */
export function suscribirConsentimientosPropietario(
  propietarioUid: string,
  onData: (consentimientos: Consentimiento[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, COLECCION),
      where('propietarioUid', '==', propietarioUid),
      orderBy('actualizadoEn', 'desc')
    ),
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

/**
 * Consentimientos otorgados a una aseguradora concreta.
 * La aseguradora los usa para saber si puede enviar
 * comunicaciones comerciales (opt-in).
 */
export function suscribirConsentimientosOrg(
  orgId: string,
  onData: (consentimientos: Consentimiento[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, COLECCION),
      where('orgId', '==', orgId),
      orderBy('actualizadoEn', 'desc')
    ),
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

/*
=======================================================
NITRO SYNC - PRUEBAS DE REGLAS EN EL EMULADOR
=======================================================

Prueba firestore.rules contra el EMULADOR de Firestore
usando las MISMAS identidades (uid / rol / orgId) que ya
existen en el proyecto real. NO crea cuentas nuevas y NO
toca el proyecto real: todo se siembra y se escribe en el
emulador.

Cómo ejecutarlo:

  1. En una terminal aparte, levanta el emulador:
       npx firebase emulators:start --only firestore --project servicio-vehicular-7bc23
  2. En otra terminal:
       npm i --no-save --legacy-peer-deps @firebase/rules-unit-testing
       node tools/admin/probar-reglas-emulador.mjs

@firebase/rules-unit-testing NO se agrega a package.json
(se instala con --no-save) para no cambiar dependencias del
proyecto.
=======================================================
*/

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

const PROYECTO = 'servicio-vehicular-7bc23';

const REGLAS = readFileSync(
  fileURLToPath(new URL('../../firestore.rules', import.meta.url)),
  'utf8'
);

/*
Identidades REALES del proyecto (uid / rol / orgId), leídas
solo para reproducirlas en el emulador:
  - SURA           (insurer_admin, orgId sura)
  - MAPFRE         (insurer_admin, orgId mapfre)
  - super_admin
  - propietario demo (customer) y otro propietario real
*/
const SURA = { uid: 'se1MM7mwtodkOb4W3g3qCRFBCh62', org: 'sura', clave: 'sura' };
const MAPFRE = { uid: 'MW4JhhgeXhWTltfh8RwjEnOUH7C2', org: 'mapfre', clave: 'mapfre' };
const ADMIN = { uid: '1m4ie5dd9EXySuPRVGRpcnyJMqm1' };
const DUENO = { uid: 'uq1zc6hcp3hbsIfOYVtoiehJzRD2' }; // propietario demo (is_test)
const OTRO_DUENO = { uid: 'RLsU9OLhLvbEoVn8IGS3RvPPs6K2' };

const VEH_PROPIO = 'demo-vehiculo-2'; // del propietario demo, clave = sura
const VEH_AJENO = 'demo-vehiculo-ajeno'; // del propietario demo, clave = mapfre
const VEH_OTRO_DUENO = 'FyHYsCUqlZcS8ZInwp0b'; // de OTRO_DUENO, clave = sura

/* Ids deterministas de cotizaciones: uid_vehiculoId_clave */
const COT_SURA = `${DUENO.uid}_${VEH_PROPIO}_sura`;
const COT_MAPFRE = `${DUENO.uid}_${VEH_PROPIO}_mapfre`;

const rutaVehiculo = (dueno, id) => `usuarios/${dueno.uid}/vehiculos/${id}`;

const resultados = [];
function registrar(titulo, esperado, obtenido, detalle = '') {
  const ok = esperado === obtenido;
  resultados.push({ ok });
  const estado = ok ? 'PASA ' : 'FALLA';
  const marca = obtenido ? 'PERMITIDO' : 'DENEGADO ';
  console.log(
    `${estado}  ${marca}  (esperado ${esperado ? 'PERMITIDO' : 'DENEGADO'})  ${titulo}` +
      (detalle && !ok ? `\n         -> ${detalle}` : '')
  );
}

async function corre(fn) {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.code ?? error?.message ?? error).split('\n')[0].slice(0, 140),
    };
  }
}

/* -------------------------------------------------------
   ENTORNO
   ------------------------------------------------------- */

const env = await initializeTestEnvironment({
  projectId: PROYECTO,
  firestore: { rules: REGLAS, host: '127.0.0.1', port: 8080 },
});

await env.clearFirestore();

/* Sembrado SOLO en el emulador (reglas desactivadas). */
await env.withSecurityRulesDisabled(async (contexto) => {
  const db = contexto.firestore();

  await db.doc(`organizations/${SURA.org}`).set({
    nombre: 'SURA',
    slug: 'sura',
    aseguradoraClave: SURA.clave,
    estado: 'active',
    accesoHabilitado: true,
  });

  await db.doc(`organizations/${MAPFRE.org}`).set({
    nombre: 'MAPFRE',
    slug: 'mapfre',
    aseguradoraClave: MAPFRE.clave,
    estado: 'active',
    accesoHabilitado: true,
  });

  /* F8: precio vigente de la configuración central (único plan). */
  await db.doc('configuracionSuscripcion/super_empresarial').set({
    planId: 'super_empresarial',
    nombre: 'Súper Empresarial',
    precioCop: 149900,
    moneda: 'COP',
    periodicidad: 'monthly',
    descripcion: 'Plan único',
    beneficios: ['Panel', 'Pólizas'],
    actualizadaEn: 1,
    actualizadaPor: ADMIN.uid,
    actualizadoPorCorreo: 'admin@nitro.test',
  });

  /*
  F8: SURA queda con plan SÚPER EMPRESARIAL ACTIVO y vencimiento
  futuro. El bloqueo por membresía está ENCENDIDO: solo SURA
  puede operar. MAPFRE se queda sin suscripción a propósito.
  */
  await db.doc(`subscriptions/${SURA.org}`).set({
    orgId: SURA.org,
    planId: 'super_empresarial',
    estado: 'active',
    inicio: '2026-01-01',
    vencimiento: '2027-12-31',
    precioCop: 149900,
    actualizadaEn: 1,
  });

  /* MAPFRE también activa para que las pruebas F1-F7 de
     aislamiento por aseguradora sigan siendo válidas. En F8
     se retira su suscripción para probar el bloqueo. */
  await db.doc(`subscriptions/${MAPFRE.org}`).set({
    orgId: MAPFRE.org,
    planId: 'super_empresarial',
    estado: 'active',
    inicio: '2026-01-01',
    vencimiento: '2027-12-31',
    precioCop: 149900,
    actualizadaEn: 1,
  });

  await db.doc(`usuarios/${DUENO.uid}`).set({
    uid: DUENO.uid,
    role: 'customer',
    nombre: 'Propietario Demo',
    telefono: '+57 300 000 0000',
  });

  await db.doc(rutaVehiculo(DUENO, VEH_PROPIO)).set({
    uid: DUENO.uid,
    marca: 'Toyota',
    modelo: 'Hilux',
    year: 2022,
    tipo: 'Carro',
    placa: 'DEM002',
    aseguradora: 'SURA',
    aseguradoraClave: 'sura',
    numeroPoliza: 'DEMO-POL-002',
    vencimientoSeguro: '2026-12-01',
    contactoPropietario: {
      nombre: 'Propietario Demo',
      telefono: '+57 300 000 0000',
    },
  });

  await db.doc(rutaVehiculo(DUENO, VEH_AJENO)).set({
    uid: DUENO.uid,
    marca: 'Mazda',
    modelo: '3',
    year: 2021,
    tipo: 'Carro',
    placa: 'DEM003',
    aseguradora: 'MAPFRE',
    aseguradoraClave: 'mapfre',
    numeroPoliza: 'MAP-POL-003',
    vencimientoSeguro: '2026-11-20',
    contactoPropietario: {
      nombre: 'Propietario Demo',
      telefono: '+57 300 000 0000',
    },
  });

  await db.doc(`usuarios/${OTRO_DUENO.uid}`).set({
    uid: OTRO_DUENO.uid,
    role: 'customer',
    nombre: 'Otro Propietario',
  });

  await db.doc(rutaVehiculo(OTRO_DUENO, VEH_OTRO_DUENO)).set({
    uid: OTRO_DUENO.uid,
    marca: 'Renault',
    modelo: 'Logan',
    year: 2020,
    tipo: 'Carro',
    placa: 'OTR001',
    aseguradora: 'SURA',
    aseguradoraClave: 'sura',
    numeroPoliza: 'DEMO-POL-OTRO',
    vencimientoSeguro: '2027-01-15',
  });

  await db.doc(`cotizaciones/${COT_SURA}`).set({
    uid: DUENO.uid,
    email: 'demo@nitro.test',
    vehiculoId: VEH_PROPIO,
    vehiculoNombre: 'Toyota Hilux',
    placa: 'DEM002',
    tipoVehiculo: 'Carro',
    aseguradoraClave: 'sura',
    aseguradora: 'SURA',
    telefono: '3000000000',
    nota: '',
    estado: 'nueva',
    primaCop: null,
    fecha: '2026-11-18',
    creadaEn: 1,
    actualizadaEn: 1,
    atendidaPor: null,
    atendidaFecha: null,
  });

  await db.doc(`cotizaciones/${COT_MAPFRE}`).set({
    uid: DUENO.uid,
    email: 'demo@nitro.test',
    vehiculoId: VEH_PROPIO,
    vehiculoNombre: 'Toyota Hilux',
    placa: 'DEM002',
    tipoVehiculo: 'Carro',
    aseguradoraClave: 'mapfre',
    aseguradora: 'MAPFRE',
    telefono: '3000000000',
    nota: '',
    estado: 'nueva',
    primaCop: null,
    fecha: '2026-11-18',
    creadaEn: 1,
    actualizadaEn: 1,
    atendidaPor: null,
    atendidaFecha: null,
  });
});

const sura = env.authenticatedContext(SURA.uid, { role: 'insurer_admin', orgId: SURA.org }).firestore();
const mapfre = env.authenticatedContext(MAPFRE.uid, { role: 'insurer_admin', orgId: MAPFRE.org }).firestore();
const admin = env.authenticatedContext(ADMIN.uid, { role: 'super_admin' }).firestore();
const dueno = env.authenticatedContext(DUENO.uid, { role: 'customer' }).firestore();
const otroDueno = env.authenticatedContext(OTRO_DUENO.uid, { role: 'customer' }).firestore();
const anonimo = env.unauthenticatedContext().firestore();

/* -------------------------------------------------------
   1. LECTURA: aislamiento por aseguradoraClave
   ------------------------------------------------------- */

console.log('\n== 1. LECTURA (aislamiento por aseguradoraClave) ==');

let r = await corre(() => sura.doc(rutaVehiculo(DUENO, VEH_PROPIO)).get());
registrar('SURA lee un vehículo con su clave (sura)', true, r.ok, r.error);

r = await corre(() => sura.doc(rutaVehiculo(DUENO, VEH_AJENO)).get());
registrar('SURA NO lee un vehículo de otra aseguradora (mapfre)', false, r.ok, r.error);

r = await corre(() => sura.doc(rutaVehiculo(OTRO_DUENO, VEH_OTRO_DUENO)).get());
registrar('SURA lee otro vehículo con su clave (otro propietario)', true, r.ok, r.error);

r = await corre(() => mapfre.doc(rutaVehiculo(DUENO, VEH_AJENO)).get());
registrar('MAPFRE lee su propio vehículo', true, r.ok, r.error);

r = await corre(() => mapfre.doc(rutaVehiculo(DUENO, VEH_PROPIO)).get());
registrar('MAPFRE NO lee el vehículo de SURA', false, r.ok, r.error);

r = await corre(async () => {
  const snap = await sura
    .collectionGroup('vehiculos')
    .where('aseguradoraClave', '==', 'sura')
    .get();
  if (snap.size !== 2) throw new Error(`esperaba 2 documentos, obtuvo ${snap.size}`);
});
registrar('SURA consulta collection group where clave==sura (2 docs)', true, r.ok, r.error);

r = await corre(() =>
  sura.collectionGroup('vehiculos').where('aseguradoraClave', '==', 'mapfre').get()
);
registrar('SURA NO puede consultar la clave de otra aseguradora', false, r.ok, r.error);

r = await corre(() => anonimo.doc(rutaVehiculo(DUENO, VEH_PROPIO)).get());
registrar('Sin autenticar NO lee ningún vehículo', false, r.ok, r.error);

/* -------------------------------------------------------
   2. ESCRITURA: la aseguradora solo toca campos del seguro
   ------------------------------------------------------- */

console.log('\n== 2. ESCRITURA (solo campos del seguro) ==');

r = await corre(() =>
  sura.doc(rutaVehiculo(DUENO, VEH_PROPIO)).update({
    aseguradora: 'SURA',
    numeroPoliza: 'DEMO-POL-002-R',
    vencimientoSeguro: '2027-12-01',
    seguroAsignadoPor: 'sura',
    seguroAsignadoFecha: '2026-11-17',
  })
);
registrar('SURA renueva su vehículo (campos del seguro)', true, r.ok, r.error);

r = await corre(() =>
  sura.doc(rutaVehiculo(DUENO, VEH_PROPIO)).update({ aseguradoraClave: 'mapfre' })
);
registrar('SURA NO puede cambiar aseguradoraClave', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(rutaVehiculo(DUENO, VEH_PROPIO)).update({
    contactoPropietario: { nombre: 'Hack', telefono: '+57 300 000 0001' },
  })
);
registrar('SURA NO puede cambiar contactoPropietario', false, r.ok, r.error);

r = await corre(() => sura.doc(rutaVehiculo(DUENO, VEH_PROPIO)).update({ placa: 'XXX999' }));
registrar('SURA NO puede cambiar campos fuera del seguro (placa)', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(rutaVehiculo(DUENO, VEH_AJENO)).update({ numeroPoliza: 'HACK-1' })
);
registrar('SURA NO puede escribir en un vehículo ajeno', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(rutaVehiculo(DUENO, 'vehiculo-nuevo')).set({
    aseguradoraClave: 'sura',
    placa: 'NEW001',
  })
);
registrar('SURA NO puede crear vehículos', false, r.ok, r.error);

r = await corre(() => sura.doc(rutaVehiculo(DUENO, VEH_PROPIO)).delete());
registrar('SURA NO puede borrar vehículos', false, r.ok, r.error);

/* -------------------------------------------------------
   3. PROPIETARIO Y ADMIN SIGUEN FUNCIONANDO
   ------------------------------------------------------- */

console.log('\n== 3. PROPIETARIO Y ADMIN ==');

r = await corre(() => dueno.doc(rutaVehiculo(DUENO, VEH_PROPIO)).get());
registrar('El propietario lee su propio vehículo', true, r.ok, r.error);

r = await corre(() =>
  dueno.doc(rutaVehiculo(DUENO, VEH_PROPIO)).update({ color: 'Negro' })
);
registrar('El propietario actualiza su propio vehículo', true, r.ok, r.error);

r = await corre(() => dueno.doc(rutaVehiculo(OTRO_DUENO, VEH_OTRO_DUENO)).get());
registrar('El propietario NO lee el vehículo de otro', false, r.ok, r.error);

r = await corre(() => otroDueno.doc(rutaVehiculo(OTRO_DUENO, VEH_OTRO_DUENO)).get());
registrar('El otro propietario lee el suyo', true, r.ok, r.error);

r = await corre(() => admin.doc(rutaVehiculo(DUENO, VEH_AJENO)).get());
registrar('El super_admin lee cualquier vehículo', true, r.ok, r.error);

r = await corre(() =>
  admin.doc(rutaVehiculo(DUENO, VEH_AJENO)).update({ numeroPoliza: 'ADMIN-1' })
);
registrar('El super_admin actualiza campos del seguro', true, r.ok, r.error);

r = await corre(() => admin.doc(rutaVehiculo(DUENO, VEH_AJENO)).update({ placa: 'ADM999' }));
registrar('El super_admin NO cambia campos fuera del seguro (placa)', false, r.ok, r.error);

/* -------------------------------------------------------
   4. COTIZACIONES Y TELÉFONO DE CONTACTO
   ------------------------------------------------------- */

console.log('\n== 4. COTIZACIONES Y TELÉFONO DE CONTACTO ==');

/* --- Cotizaciones: propietario --- */

r = await corre(() =>
  dueno.doc(`cotizaciones/${COT_SURA}`).get()
);
registrar('El propietario lee su propia cotización', true, r.ok, r.error);

r = await corre(async () => {
  const snap = await dueno
    .collection('cotizaciones')
    .where('uid', '==', DUENO.uid)
    .get();
  if (snap.size !== 2) throw new Error(`esperaba 2 documentos, obtuvo ${snap.size}`);
});
registrar('El propietario lista sus cotizaciones (2 docs)', true, r.ok, r.error);

r = await corre(() =>
  dueno.doc(`cotizaciones/${DUENO.uid}_nuevo_veh_sura`).set({
    uid: DUENO.uid,
    email: 'demo@nitro.test',
    vehiculoId: 'nuevo_veh',
    vehiculoNombre: 'Nuevo',
    placa: 'NEW001',
    tipoVehiculo: 'Carro',
    aseguradoraClave: 'sura',
    aseguradora: 'SURA',
    telefono: '3000000000',
    nota: '',
    estado: 'nueva',
    primaCop: null,
    fecha: '2026-11-18',
    creadaEn: 1,
    actualizadaEn: 1,
    atendidaPor: null,
    atendidaFecha: null,
  })
);
registrar('El propietario crea una cotización (id determinista)', true, r.ok, r.error);

r = await corre(() =>
  dueno.doc('cotizaciones/otro_uid_veh_sura').set({
    uid: OTRO_DUENO.uid,
    vehiculoId: 'veh',
    vehiculoNombre: 'X',
    placa: 'X',
    tipoVehiculo: 'Carro',
    aseguradoraClave: 'sura',
    aseguradora: 'SURA',
    telefono: '3000000000',
    nota: '',
    estado: 'nueva',
    primaCop: null,
    fecha: '2026-11-18',
    creadaEn: 1,
    actualizadaEn: 1,
    atendidaPor: null,
    atendidaFecha: null,
  })
);
registrar('El propietario NO crea cotizaciones a nombre de otro', false, r.ok, r.error);

r = await corre(() =>
  dueno.doc('cotizaciones/uid_mal_formado').set({
    uid: DUENO.uid,
    vehiculoId: 'veh',
    vehiculoNombre: 'X',
    placa: 'X',
    tipoVehiculo: 'Carro',
    aseguradoraClave: 'sura',
    aseguradora: 'SURA',
    telefono: '3000000000',
    nota: '',
    estado: 'nueva',
    primaCop: null,
    fecha: '2026-11-18',
    creadaEn: 1,
    actualizadaEn: 1,
    atendidaPor: null,
    atendidaFecha: null,
  })
);
registrar('El propietario NO crea con id mal formado', false, r.ok, r.error);

r = await corre(() => otroDueno.doc(`cotizaciones/${COT_SURA}`).get());
registrar('Otro propietario NO lee la cotización ajena', false, r.ok, r.error);

/* --- Cotizaciones: aseguradora --- */

r = await corre(() => sura.doc(`cotizaciones/${COT_SURA}`).get());
registrar('SURA lee su cotización (clave sura)', true, r.ok, r.error);

r = await corre(() => sura.doc(`cotizaciones/${COT_MAPFRE}`).get());
registrar('SURA NO lee la cotización de otra aseguradora', false, r.ok, r.error);

r = await corre(async () => {
  const snap = await sura
    .collection('cotizaciones')
    .where('aseguradoraClave', '==', 'sura')
    .get();
  if (snap.size !== 2) throw new Error(`esperaba 2 documentos, obtuvo ${snap.size}`);
});
registrar('SURA consulta where aseguradoraClave==sura (2 docs)', true, r.ok, r.error);

r = await corre(() =>
  sura.collection('cotizaciones').where('aseguradoraClave', '==', 'mapfre').get()
);
registrar('SURA NO consulta la clave de otra aseguradora', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(`cotizaciones/${COT_SURA}`).update({
    estado: 'cotizada',
    primaCop: 850000,
    atendidaPor: SURA.uid,
    atendidaFecha: '2026-11-18',
    actualizadaEn: 2,
  })
);
registrar('SURA actualiza estado y prima de su cotización', true, r.ok, r.error);

r = await corre(() =>
  sura.doc(`cotizaciones/${COT_SURA}`).update({ aseguradoraClave: 'mapfre' })
);
registrar('SURA NO puede cambiar aseguradoraClave de la cotización', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(`cotizaciones/${COT_SURA}`).update({ telefono: '3111111111' })
);
registrar('SURA NO puede cambiar el teléfono del propietario', false, r.ok, r.error);

r = await corre(() =>
  mapfre.doc(`cotizaciones/${COT_SURA}`).update({ estado: 'cerrada' })
);
registrar('MAPFRE NO actualiza la cotización de SURA', false, r.ok, r.error);

r = await corre(() => admin.doc(`cotizaciones/${COT_MAPFRE}`).get());
registrar('El super_admin lee cualquier cotización', true, r.ok, r.error);

r = await corre(() => anonimo.doc(`cotizaciones/${COT_SURA}`).get());
registrar('Sin autenticar NO lee cotizaciones', false, r.ok, r.error);

/* --- Teléfono de contacto de la organización --- */

r = await corre(() =>
  sura.doc(`organizations/${SURA.org}`).update({ telefonoContacto: '6014378888' })
);
registrar('SURA guarda su telefonoContacto', true, r.ok, r.error);

r = await corre(() =>
  sura.doc(`organizations/${SURA.org}`).update({ aseguradoraClave: 'hack' })
);
registrar('SURA NO cambia la aseguradoraClave de su organización', false, r.ok, r.error);

r = await corre(() =>
  mapfre.doc(`organizations/${SURA.org}`).update({ telefonoContacto: '3000000000' })
);
registrar('MAPFRE NO edita la organización de SURA', false, r.ok, r.error);

/* -------------------------------------------------------
   5. ASEGURADORA SUSPENDIDA PIERDE ACCESO
   ------------------------------------------------------- */

console.log('\n== 5. ORGANIZACIÓN SUSPENDIDA ==');

await env.withSecurityRulesDisabled(async (contexto) => {
  await contexto.firestore().doc(`organizations/${MAPFRE.org}`).update({ estado: 'suspended' });
});

r = await corre(() => mapfre.doc(rutaVehiculo(DUENO, VEH_AJENO)).get());
registrar('Aseguradora suspendida NO lee sus vehículos', false, r.ok, r.error);

r = await corre(() => mapfre.doc(`cotizaciones/${COT_MAPFRE}`).get());
registrar('Aseguradora suspendida NO lee sus cotizaciones', false, r.ok, r.error);

/* -------------------------------------------------------
   6. RESEÑAS DE VEHÍCULOS
   ------------------------------------------------------- */

console.log('\n== 6. RESEÑAS DE VEHÍCULOS ==');

const RESENA_DUENO = `${DUENO.uid}_${VEH_PROPIO}`;

await env.withSecurityRulesDisabled(async (contexto) => {
  await contexto.firestore().doc(`resenas/${RESENA_DUENO}`).set({
    uid: DUENO.uid,
    email: 'demo@nitro.test',
    vehiculoId: VEH_PROPIO,
    vehiculoNombre: 'Toyota Hilux',
    placa: 'DEM002',
    tipoVehiculo: 'Carro',
    calificacion: 5,
    titulo: 'Excelente',
    comentario: 'Muy buena experiencia',
    leida: false,
    fecha: '2026-11-18',
    creadaEn: 1,
    actualizadaEn: 1,
  });
});

r = await corre(() => dueno.doc(`resenas/${RESENA_DUENO}`).get());
registrar('El propietario lee su propia reseña', true, r.ok, r.error);

r = await corre(async () => {
  const snap = await dueno.collection('resenas').where('uid', '==', DUENO.uid).get();
  if (snap.size !== 1) throw new Error(`esperaba 1 documento, obtuvo ${snap.size}`);
});
registrar('El propietario lista sus reseñas (1 doc)', true, r.ok, r.error);

r = await corre(() => otroDueno.doc(`resenas/${RESENA_DUENO}`).get());
registrar('Otro propietario NO lee la reseña ajena', false, r.ok, r.error);

r = await corre(() =>
  dueno.doc(`resenas/${DUENO.uid}_nuevo_veh`).set({
    uid: DUENO.uid,
    email: 'demo@nitro.test',
    vehiculoId: 'nuevo_veh',
    vehiculoNombre: 'Nuevo',
    placa: 'NEW001',
    tipoVehiculo: 'Carro',
    calificacion: 4,
    titulo: 'Buena',
    comentario: 'Bien',
    leida: false,
    fecha: '2026-11-18',
    creadaEn: 2,
    actualizadaEn: 2,
  })
);
registrar('El propietario crea una reseña (id determinista)', true, r.ok, r.error);

r = await corre(() =>
  dueno.doc('resenas/resena_mal_formada').set({
    uid: DUENO.uid,
    email: 'demo@nitro.test',
    vehiculoId: 'veh',
    vehiculoNombre: 'X',
    placa: 'X',
    tipoVehiculo: 'Carro',
    calificacion: 4,
    titulo: 'X',
    comentario: 'X',
    leida: false,
    fecha: '2026-11-18',
    creadaEn: 3,
    actualizadaEn: 3,
  })
);
registrar('El propietario NO crea con id mal formado', false, r.ok, r.error);

r = await corre(() =>
  dueno.doc(`resenas/${DUENO.uid}_veh_6`).set({
    uid: DUENO.uid,
    email: 'demo@nitro.test',
    vehiculoId: 'veh_6',
    vehiculoNombre: 'X',
    placa: 'X',
    tipoVehiculo: 'Carro',
    calificacion: 6,
    titulo: 'X',
    comentario: 'X',
    leida: false,
    fecha: '2026-11-18',
    creadaEn: 4,
    actualizadaEn: 4,
  })
);
registrar('El propietario NO crea con calificación fuera de 1..5', false, r.ok, r.error);

r = await corre(() =>
  dueno.doc(`resenas/${DUENO.uid}_otro_veh`).set({
    uid: OTRO_DUENO.uid,
    email: 'otro@nitro.test',
    vehiculoId: 'otro_veh',
    vehiculoNombre: 'X',
    placa: 'X',
    tipoVehiculo: 'Carro',
    calificacion: 3,
    titulo: 'X',
    comentario: 'X',
    leida: false,
    fecha: '2026-11-18',
    creadaEn: 5,
    actualizadaEn: 5,
  })
);
registrar('El propietario NO crea reseñas a nombre de otro', false, r.ok, r.error);

r = await corre(() =>
  dueno.doc(`resenas/${RESENA_DUENO}`).update({
    calificacion: 4,
    titulo: 'Buenísima',
    comentario: 'Actualizada',
    leida: false,
    actualizadaEn: 9,
  })
);
registrar('El propietario actualiza su propia reseña', true, r.ok, r.error);

r = await corre(() =>
  dueno.doc(`resenas/${RESENA_DUENO}`).update({ uid: OTRO_DUENO.uid })
);
registrar('El propietario NO puede cambiar el dueño de la reseña', false, r.ok, r.error);

r = await corre(() => admin.doc(`resenas/${RESENA_DUENO}`).get());
registrar('El super_admin lee cualquier reseña', true, r.ok, r.error);

r = await corre(() => admin.doc(`resenas/${RESENA_DUENO}`).update({ leida: true }));
registrar('El super_admin marca la reseña como leída', true, r.ok, r.error);

r = await corre(() =>
  admin.doc(`resenas/${RESENA_DUENO}`).update({ calificacion: 1 })
);
registrar('El super_admin NO cambia la calificación de la reseña', false, r.ok, r.error);

r = await corre(() => sura.doc(`resenas/${RESENA_DUENO}`).get());
registrar('La aseguradora NO lee reseñas de vehículos', false, r.ok, r.error);

r = await corre(() => anonimo.doc(`resenas/${RESENA_DUENO}`).get());
registrar('Sin autenticar NO lee reseñas', false, r.ok, r.error);

r = await corre(() => dueno.doc(`resenas/${RESENA_DUENO}`).delete());
registrar('Nadie borra reseñas', false, r.ok, r.error);

/* -------------------------------------------------------
   7. FASE 7 · MEMBRESÍA, PAGOS SIMULADOS Y PRECIOS
   ------------------------------------------------------- */

console.log('\n== 7. FASE 7 (membresía, pagos simulados y precios) ==');

const SOLICITUD_F7 = `sol_${SURA.org}`;
const PAGO_F7 = 'pago-f7-1';

const datosSolicitudF7 = {
  orgId: SURA.org,
  planId: 'plan-pro',
  planNombre: 'Plan Profesional',
  precioCop: 350000,
  motivo: 'Más vehículos',
  estado: 'pendiente',
  solicitadoPor: SURA.uid,
  solicitadoEn: 1,
  respondidaPor: null,
  respondidaEn: null,
  simulado: true,
};

const datosPagoF7 = {
  orgId: SURA.org,
  vehiculoId: VEH_PROPIO,
  propietarioUid: DUENO.uid,
  polizaId: null,
  producto: 'SOAT',
  periodo: '2026-11',
  montoCop: 343300,
  referencia: `SIM-${PAGO_F7}`,
  estado: 'pendiente',
  simulado: true,
  registradoPor: SURA.uid,
  registradoEn: 1,
  respondidaEn: null,
};

/* F8: el bloqueo está ENCENDIDO; SURA tiene plan activo y puede operar. */
r = await corre(() => sura.doc(rutaVehiculo(DUENO, VEH_PROPIO)).get());
registrar('F7 SURA con plan activo SIGUE operando (bloqueo encendido)', true, r.ok, r.error);

/* --- solicitudesSuscripcion --- */
r = await corre(() =>
  sura.doc(`solicitudesSuscripcion/${SOLICITUD_F7}`).set(datosSolicitudF7)
);
registrar('F7 SURA crea solicitud de cambio de plan simulada', true, r.ok, r.error);

r = await corre(() =>
  sura.doc(`solicitudesSuscripcion/${SOLICITUD_F7}_mala`).set({
    ...datosSolicitudF7,
    simulado: false,
  })
);
registrar('F7 NO se acepta una solicitud sin simulado=true', false, r.ok, r.error);

r = await corre(() => mapfre.doc(`solicitudesSuscripcion/${SOLICITUD_F7}`).get());
registrar('F7 MAPFRE NO lee la solicitud de SURA', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(`solicitudesSuscripcion/${SOLICITUD_F7}`).update({ estado: 'aprobada' })
);
registrar('F7 SURA NO se autoaprueba el cambio de plan', false, r.ok, r.error);

r = await corre(() =>
  admin.doc(`solicitudesSuscripcion/${SOLICITUD_F7}`).update({
    estado: 'aprobada',
    respondidaPor: ADMIN.uid,
    respondidaEn: 2,
  })
);
registrar('F7 el super_admin aprueba la solicitud', true, r.ok, r.error);

r = await corre(() => anonimo.doc(`solicitudesSuscripcion/${SOLICITUD_F7}`).get());
registrar('F7 sin autenticar NO lee solicitudes', false, r.ok, r.error);

/* --- pagosSeguros --- */
r = await corre(() => sura.doc(`pagosSeguros/${PAGO_F7}`).set(datosPagoF7));
registrar('F7 SURA registra pago simulado con referencia SIM-', true, r.ok, r.error);

r = await corre(() =>
  sura.doc(`pagosSeguros/${PAGO_F7}_real`).set({
    ...datosPagoF7,
    simulado: false,
  })
);
registrar('F7 NO se acepta un pago sin simulado=true', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(`pagosSeguros/${PAGO_F7}_pasarela`).set({
    ...datosPagoF7,
    referencia: 'PAY-REAL-123',
  })
);
registrar('F7 NO se acepta una referencia de pasarela real', false, r.ok, r.error);

r = await corre(() => dueno.doc(`pagosSeguros/${PAGO_F7}`).get());
registrar('F7 el propietario lee su pago simulado', true, r.ok, r.error);

r = await corre(() => mapfre.doc(`pagosSeguros/${PAGO_F7}`).get());
registrar('F7 MAPFRE NO lee el pago de SURA', false, r.ok, r.error);

r = await corre(() => otroDueno.doc(`pagosSeguros/${PAGO_F7}`).get());
registrar('F7 otro propietario NO lee el pago', false, r.ok, r.error);

r = await corre(() =>
  dueno.doc(`pagosSeguros/${PAGO_F7}`).update({
    estado: 'confirmado',
    respondidaEn: 3,
    respondidaPor: DUENO.uid,
  })
);
registrar('F7 el propietario NO confirma su pago (solo aseguradora)', false, r.ok, r.error);

r = await corre(() => dueno.doc(`pagosSeguros/${PAGO_F7}`).update({ montoCop: 1 }));
registrar('F7 el propietario NO cambia el monto del pago', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(`pagosSeguros/${PAGO_F7}`).update({ estado: 'confirmado' })
);
registrar('F7 la aseguradora NO confirma el pago', false, r.ok, r.error);

r = await corre(() => admin.doc(`pagosSeguros/${PAGO_F7}`).get());
registrar('F7 el super_admin lee cualquier pago simulado', true, r.ok, r.error);

/* --- referenciaPrimas y configuracionCostos --- */
r = await corre(() => dueno.doc('referenciaPrimas/SOAT_2026_CARRO_TODO').get());
registrar('F7 cualquier usuario lee la referencia de primas', true, r.ok, r.error);

r = await corre(() => anonimo.doc('referenciaPrimas/SOAT_2026_CARRO_TODO').get());
registrar('F7 sin autenticar NO lee la referencia de primas', false, r.ok, r.error);

r = await corre(() =>
  sura.doc('referenciaPrimas/SOAT_2026_CARRO_TODO').set({
    producto: 'SOAT',
    anio: 2026,
    tipoVehiculo: 'Carro',
    rango: 'Todos',
    cilindradaMin: null,
    cilindradaMax: null,
    valorCop: 1,
    nota: null,
    actualizadaEn: 1,
  })
);
registrar('F7 la aseguradora NO edita la referencia de primas', false, r.ok, r.error);

r = await corre(() =>
  admin.doc('referenciaPrimas/SOAT_2026_CARRO_TODO').set({
    producto: 'SOAT',
    anio: 2026,
    tipoVehiculo: 'Carro',
    rango: 'Todos',
    cilindradaMin: null,
    cilindradaMax: null,
    valorCop: null,
    nota: 'TODO',
    actualizadaEn: 1,
  })
);
registrar('F7 el super_admin guarda la referencia (carro en TODO)', true, r.ok, r.error);

r = await corre(() => dueno.doc('configuracionCostos/soat_moto').get());
registrar('F7 cualquier usuario lee los costos sugeridos', true, r.ok, r.error);

r = await corre(() => anonimo.doc('configuracionCostos/soat_moto').get());
registrar('F7 sin autenticar NO lee los costos sugeridos', false, r.ok, r.error);

r = await corre(() =>
  sura.doc('configuracionCostos/soat_moto').set({
    clave: 'soat',
    tipoVehiculo: 'Moto',
    valorCop: 1,
    nota: null,
    actualizadaEn: 1,
  })
);
registrar('F7 la aseguradora NO edita los costos sugeridos', false, r.ok, r.error);

r = await corre(() =>
  admin.doc('configuracionCostos/soat_moto').set({
    clave: 'soat',
    tipoVehiculo: 'Moto',
    valorCop: 256200,
    nota: null,
    actualizadaEn: 1,
  })
);
registrar('F7 el super_admin guarda un costo sugerido', true, r.ok, r.error);

/* -------------------------------------------------------
   8. FASE 8 · PLAN ÚNICO, COMPRAS, NOTIFICACIONES Y ROLES
   ------------------------------------------------------- */

console.log('\n== 8. FASE 8 (plan único, compras, notificaciones y roles) ==');

/*
Año-mes UTC para el id determinista de la compra. El emulador
usa `request.time` (UTC), por eso se calcula con toISOString.
*/
const MES_COMPRA = new Date().toISOString().slice(0, 7);
const COMPRA_SURA = `${SURA.org}_${MES_COMPRA}`;
const COMPRA_MAPFRE = `${MAPFRE.org}_${MES_COMPRA}`;
const NOTIF_SURA = COMPRA_SURA;

/*
Rehabilitamos MAPFRE y le retiramos la suscripción para probar
que una aseguradora SIN plan todavía puede comprar (la compra
no está bloqueada por membresía).
*/
await env.withSecurityRulesDisabled(async (contexto) => {
  await contexto.firestore().doc(`organizations/${MAPFRE.org}`).update({
    estado: 'active',
    accesoHabilitado: true,
  });
  await contexto.firestore().doc(`subscriptions/${MAPFRE.org}`).delete();
});

const datosCompraSura = {
  orgId: SURA.org,
  orgNombre: 'SURA',
  planId: 'super_empresarial',
  planNombre: 'Súper Empresarial',
  precioCop: 149900,
  periodicidad: 'monthly',
  beneficios: ['Panel', 'Pólizas'],
  estado: 'pendiente',
  compradorUid: SURA.uid,
  compradorCorreo: 'sura@nitro.test',
  fechaCompra: new Date().toISOString().slice(0, 10),
  registradoEn: 1,
  aprobadaPor: null,
  aprobadaEn: null,
  simulado: true,
};

const datosNotifSura = {
  compraId: COMPRA_SURA,
  orgId: SURA.org,
  orgNombre: 'SURA',
  planId: 'super_empresarial',
  planNombre: 'Súper Empresarial',
  precioCop: 149900,
  fechaCompra: datosCompraSura.fechaCompra,
  estadoCompra: 'pendiente',
  leida: false,
  leidaPor: null,
  leidaEn: null,
  creadoEn: 1,
  simulado: true,
};

/* --- Configuración central del precio --- */

r = await corre(() => sura.doc('configuracionSuscripcion/super_empresarial').get());
registrar('F8 la aseguradora lee el precio vigente', true, r.ok, r.error);

r = await corre(() => dueno.doc('configuracionSuscripcion/super_empresarial').get());
registrar('F8 el propietario lee el precio vigente', true, r.ok, r.error);

r = await corre(() => anonimo.doc('configuracionSuscripcion/super_empresarial').get());
registrar('F8 sin autenticar NO lee el precio', false, r.ok, r.error);

r = await corre(() =>
  sura.doc('configuracionSuscripcion/super_empresarial').update({ precioCop: 1 })
);
registrar('F8 la aseguradora NO cambia el precio', false, r.ok, r.error);

r = await corre(() =>
  admin.doc('configuracionSuscripcion/super_empresarial').update({
    precioCop: 159900,
    actualizadaEn: 2,
    actualizadaPor: ADMIN.uid,
  })
);
registrar('F8 el super_admin actualiza el precio central', true, r.ok, r.error);

r = await corre(() =>
  admin.doc('configuracionSuscripcion/super_empresarial').update({ precioCop: -1 })
);
registrar('F8 ni el admin guarda un precio inválido', false, r.ok, r.error);

/* Dejamos el precio en 149900 para el resto de pruebas. */
await env.withSecurityRulesDisabled(async (contexto) => {
  await contexto.firestore().doc('configuracionSuscripcion/super_empresarial').update({
    precioCop: 149900,
  });
});

r = await corre(() => admin.doc('configuracionSuscripcion/super_empresarial/historial/h1').get());
registrar('F8 el admin consulta el historial de precios', true, r.ok, r.error);

r = await corre(() => sura.doc('configuracionSuscripcion/super_empresarial/historial/h1').get());
registrar('F8 la aseguradora NO consulta el historial de precios', false, r.ok, r.error);

/* --- Compras simuladas del plan único --- */

/*
Regresión: el servicio hace getDoc() ANTES de crear la compra.
El documento todavía no existe, así que `resource` es null y la
regla debe permitir la lectura (de lo contrario la compra nunca
se crea y el admin nunca recibe la notificación).
*/
r = await corre(() =>
  sura.doc(`comprasSuscripcion/${COMPRA_SURA}`).get()
);
registrar('F8 SURA consulta si ya existe su compra del mes', true, r.ok, r.error);

r = await corre(() =>
  sura.doc(`comprasSuscripcion/${COMPRA_SURA}`).set(datosCompraSura)
);
registrar('F8 SURA crea su compra con el precio vigente', true, r.ok, r.error);

r = await corre(() =>
  sura.doc(`comprasSuscripcion/${COMPRA_SURA}_mal`).set({
    ...datosCompraSura,
    precioCop: 1,
  })
);
registrar('F8 SURA NO inventa otro precio en la compra', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(`comprasSuscripcion/${SURA.org}_1999-01`).set(datosCompraSura)
);
registrar('F8 SURA NO crea compra con id de otro mes', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(`comprasSuscripcion/${MAPFRE.org}_${MES_COMPRA}`).set({
    ...datosCompraSura,
    orgId: MAPFRE.org,
    compradorUid: SURA.uid,
  })
);
registrar('F8 SURA NO compra a nombre de otra aseguradora', false, r.ok, r.error);

r = await corre(() =>
  mapfre.doc(`comprasSuscripcion/${COMPRA_MAPFRE}`).set({
    ...datosCompraSura,
    orgId: MAPFRE.org,
    compradorUid: MAPFRE.uid,
  })
);
registrar('F8 aseguradora SIN suscripción SÍ puede comprar', true, r.ok, r.error);

r = await corre(() => mapfre.doc(`comprasSuscripcion/${COMPRA_SURA}`).get());
registrar('F8 MAPFRE NO lee la compra de SURA', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(`comprasSuscripcion/${COMPRA_SURA}`).update({ estado: 'aprobada' })
);
registrar('F8 la aseguradora NO se autoaprueba la compra', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(`comprasSuscripcion/${COMPRA_SURA}`).update({ precioCop: 1 })
);
registrar('F8 la aseguradora NO cambia el precio de su compra', false, r.ok, r.error);

r = await corre(() =>
  admin.doc(`comprasSuscripcion/${COMPRA_SURA}`).update({
    estado: 'aprobada',
    aprobadaPor: ADMIN.uid,
    aprobadaEn: 2,
  })
);
registrar('F8 el super_admin aprueba la compra', true, r.ok, r.error);

r = await corre(() =>
  admin.doc(`comprasSuscripcion/${COMPRA_SURA}`).update({ precioCop: 1 })
);
registrar('F8 ni el admin cambia el precio congelado', false, r.ok, r.error);

r = await corre(() => anonimo.doc(`comprasSuscripcion/${COMPRA_SURA}`).get());
registrar('F8 sin autenticar NO lee compras', false, r.ok, r.error);

/* --- Notificaciones del super administrador --- */

r = await corre(() => admin.doc(`notificacionesAdmin/${NOTIF_SURA}`).get());
registrar('F8 el admin lee notificaciones (aunque no existan)', true, r.ok, r.error);

r = await corre(() => sura.doc(`notificacionesAdmin/${NOTIF_SURA}`).get());
registrar('F8 la aseguradora NO lee notificaciones', false, r.ok, r.error);

/*
NO se puede falsificar un aviso: la compra `COMPRA_SURA` ya
está aprobada, así que el `getAfter(... estado == 'pendiente')`
debe rechazar la notificación aunque el documento exista.
*/
r = await corre(() =>
  sura.doc(`notificacionesAdmin/${COMPRA_SURA}`).set(datosNotifSura)
);
registrar('F8 NO se crea notificación sobre compra aprobada', false, r.ok, r.error);

/* Creamos una notificación válida con la compra de MAPFRE (pendiente). */
r = await corre(async () => {
  const lote = mapfre.batch();
  lote.set(mapfre.doc(`notificacionesAdmin/${COMPRA_MAPFRE}`), {
    ...datosNotifSura,
    compraId: COMPRA_MAPFRE,
    orgId: MAPFRE.org,
    orgNombre: 'MAPFRE',
  });
  await lote.commit();
});
registrar('F8 la aseguradora crea su notificación con su compra', true, r.ok, r.error);

r = await corre(() =>
  sura.doc(`notificacionesAdmin/${COMPRA_MAPFRE}`).update({ leida: true })
);
registrar('F8 la aseguradora NO marca notificaciones como leídas', false, r.ok, r.error);

r = await corre(() =>
  admin.doc(`notificacionesAdmin/${COMPRA_MAPFRE}`).update({
    leida: true,
    leidaPor: ADMIN.uid,
    leidaEn: 3,
  })
);
registrar('F8 el admin marca la notificación como leída', true, r.ok, r.error);

/* --- Pagos simulados: el cliente registra, la aseguradora responde --- */

const PAGO_F8 = `pago-f8-${DUENO.uid}`;
const datosPagoF8 = {
  orgId: SURA.org,
  orgNombre: 'SURA',
  vehiculoId: VEH_PROPIO,
  propietarioUid: DUENO.uid,
  clienteNombre: 'Propietario Demo',
  polizaId: null,
  producto: 'SOAT',
  concepto: 'Pago de seguro',
  periodo: '2026-11',
  montoCop: 343300,
  metodoPago: 'transferencia',
  fechaOperacion: '2026-11-18',
  referencia: `SIM-${PAGO_F8}`,
  estado: 'pendiente',
  simulado: true,
  registradoPor: DUENO.uid,
  registradoEn: 1,
  respondidaEn: null,
  respondidaPor: null,
};

r = await corre(() => dueno.doc(`pagosSeguros/${PAGO_F8}`).set(datosPagoF8));
registrar('F8 el cliente registra su pago simulado', true, r.ok, r.error);

r = await corre(() =>
  dueno.doc(`pagosSeguros/${PAGO_F8}_otro`).set({
    ...datosPagoF8,
    propietarioUid: OTRO_DUENO.uid,
  })
);
registrar('F8 el cliente NO registra pagos a nombre de otro', false, r.ok, r.error);

r = await corre(() =>
  dueno.doc(`pagosSeguros/${PAGO_F8}`).update({
    estado: 'confirmado',
    respondidaEn: 2,
    respondidaPor: DUENO.uid,
  })
);
registrar('F8 el cliente NO confirma su propio pago', false, r.ok, r.error);

r = await corre(() => mapfre.doc(`pagosSeguros/${PAGO_F8}`).get());
registrar('F8 MAPFRE NO lee el pago de SURA', false, r.ok, r.error);

r = await corre(() =>
  sura.doc(`pagosSeguros/${PAGO_F8}`).update({
    estado: 'confirmado',
    respondidaEn: 2,
    respondidaPor: SURA.uid,
  })
);
registrar('F8 la aseguradora confirma el pago del cliente', true, r.ok, r.error);

r = await corre(() => sura.doc(`pagosSeguros/${PAGO_F8}`).update({ montoCop: 1 }));
registrar('F8 un pago respondido es inmutable', false, r.ok, r.error);

r = await corre(() => admin.doc(`pagosSeguros/${PAGO_F8}`).get());
registrar('F8 el admin consulta todos los pagos', true, r.ok, r.error);

/* ---membership: una vencida nunca se ve activa --- */
await env.withSecurityRulesDisabled(async (contexto) => {
  await contexto.firestore().doc(`subscriptions/${MAPFRE.org}`).set({
    orgId: MAPFRE.org,
    planId: 'super_empresarial',
    estado: 'expired',
    inicio: '2026-01-01',
    vencimiento: '2026-01-31',
    precioCop: 149900,
    actualizadaEn: 1,
  });
});

r = await corre(() => mapfre.doc(rutaVehiculo(DUENO, VEH_AJENO)).get());
registrar('F8 suscripción VENCIDA NO puede operar', false, r.ok, r.error);

/* -------------------------------------------------------
   RESUMEN
   ------------------------------------------------------- */

const total = resultados.length;
const pasan = resultados.filter((x) => x.ok).length;

console.log('\n=======================================================');
console.log(`RESULTADO: ${pasan}/${total} pruebas correctas`);
console.log('=======================================================');

await env.cleanup();

if (pasan !== total) process.exitCode = 1;

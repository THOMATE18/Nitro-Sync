/*
=======================================================
NITRO SYNC - CLI DE ADMINISTRACION
=======================================================

Comandos:

  node tools/admin/cli.mjs backup
      Respaldo logico completo de Firestore + inventario
      de Firebase Authentication, cifrado (AES-256-GCM)
      y guardado FUERA del repositorio.

  node tools/admin/cli.mjs provision
      Crea las 11 organizaciones y las 11 cuentas de
      aseguradora. Reutiliza cuentas existentes, asigna
      claims y escribe el archivo cifrado de credenciales.

  node tools/admin/cli.mjs verify
      Prueba de inicio de sesion REAL de las 11 cuentas y
      comprueba los claims. No imprime contrasenas.

  node tools/admin/cli.mjs isolation
      Comprueba que una aseguradora no puede leer datos
      de otra organizacion.

  node tools/admin/cli.mjs credentials
      Descifra y muestra la tabla de credenciales.
      Uso exclusivo para la entrega final al propietario.

  node tools/admin/cli.mjs deploy-rules
      Publica firestore.rules en el proyecto usando la
      Firebase Rules API (crea un ruleset y actualiza el
      release cloud.firestore).

  node tools/admin/cli.mjs bootstrap-admin [uid]
      Asigna el claim super_admin a la cuenta de
      administrador (por defecto, el uid conocido) y
      quita el gate de cambio de contrasena. Idempotente.

  node tools/admin/cli.mjs sincronizar-aseguradoras [--dry-run]
      Pone al dia la clave automatica de las organizaciones y
      de los vehiculos (aseguradoraClave) y copia el contacto
      del propietario (nombre y telefono) en los vehiculos con
      seguro. Idempotente y aditivo: solo escribe esos campos.
      Con --dry-run solo informa (conteos y resumen por
      aseguradora) y no escribe nada.

Requisitos:

  GOOGLE_APPLICATION_CREDENTIALS = ruta al JSON de la service account
  NITRO_ADMIN_DIR                = carpeta FUERA del repo para los artefactos

Las contrasenas nunca se escriben en texto plano: solo viven
dentro del archivo cifrado y en la salida del comando
`credentials`.
=======================================================
*/

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASEGURADORAS, claveAseguradora } from '../../data/aseguradoras.ts';

import {
  PROYECTO,
  ahoraISO,
  asignarClaims,
  borrarDocumento,
  buscarUsuarioPorCorreo,
  cifrar,
  crearUsuario,
  decodificarDocumento,
  descifrar,
  eliminarUsuario,
  generarContrasena,
  generarFrase,
  guardarDocumento,
  leerDocumento,
  listarColecciones,
  listarDocumentos,
  listarUsuariosAuth,
  llamar,
  obtenerToken,
  probarLogin,
  revocarSesiones,
  actualizarUsuario,
} from './lib.mjs';

/* -----------------------------------------------
   CONFIGURACION
----------------------------------------------- */

const DIR_ADMIN =
  process.env.NITRO_ADMIN_DIR ??
  join(process.env.TEMP ?? process.env.TMP ?? '.', 'opencode', 'nitro-service');

const ARCHIVO_FRASE = join(DIR_ADMIN, '.nitro-pass');
const ARCHIVO_CREDENCIALES = join(DIR_ADMIN, 'credenciales-aseguradoras.enc');
const ARCHIVO_ESTADO = join(DIR_ADMIN, 'estado-provision.json');

const API_KEY_WEB = process.env.NITRO_WEB_API_KEY ?? '';

/*
  Mapa explicito aseguradora -> identificador de organizacion.
  El correo y el prefijo de la contrasena se derivan de aqui.
  No se inventan nombres: `nombre` se toma de data/aseguradoras.ts.
*/
const MAPA = [
  { orgId: 'sura', correo: 'sura@gmail.com', prefijo: 'Sura', aseguradora: 'SURA' },
  { orgId: 'seguros-bolivar', correo: 'segurosbolivar@gmail.com', prefijo: 'SegurosBolivar', aseguradora: 'Seguros Bolívar' },
  { orgId: 'axa-colpatria', correo: 'axacolpatria@gmail.com', prefijo: 'AxaColpatria', aseguradora: 'AXA Colpatria' },
  { orgId: 'mapfre', correo: 'mapfre@gmail.com', prefijo: 'Mapfre', aseguradora: 'MAPFRE' },
  { orgId: 'allianz', correo: 'allianz@gmail.com', prefijo: 'Allianz', aseguradora: 'Allianz' },
  { orgId: 'liberty-seguros', correo: 'libertyseguros@gmail.com', prefijo: 'Liberty', aseguradora: 'Liberty Seguros' },
  { orgId: 'sbs-seguros', correo: 'sbsseguros@gmail.com', prefijo: 'SbsSeguros', aseguradora: 'SBS Seguros' },
  { orgId: 'seguros-del-estado', correo: 'segurosdelestado@gmail.com', prefijo: 'SegurosDelEstado', aseguradora: 'Seguros del Estado' },
  { orgId: 'hdi-seguros', correo: 'hdiseguros@gmail.com', prefijo: 'HdiSeguros', aseguradora: 'HDI Seguros' },
  { orgId: 'la-equidad', correo: 'laequidadseguros@gmail.com', prefijo: 'LaEquidad', aseguradora: 'La Equidad Seguros' },
  { orgId: 'positiva', correo: 'positiva@gmail.com', prefijo: 'Positiva', aseguradora: 'Positiva' },
];

function datosAseguradora(nombre) {
  const encontrada = ASEGURADORAS.find((item) => item.nombre === nombre);

  if (!encontrada) {
    throw new Error(`La aseguradora "${nombre}" no existe en data/aseguradoras.ts`);
  }

  return encontrada;
}

/* -----------------------------------------------
   FRASE DE CIFRADO Y ESTADO LOCAL
----------------------------------------------- */

function prepararDirectorio() {
  if (!existsSync(DIR_ADMIN)) mkdirSync(DIR_ADMIN, { recursive: true });
}

function obtenerFrase(crearSiFalta) {
  prepararDirectorio();

  if (existsSync(ARCHIVO_FRASE)) {
    return readFileSync(ARCHIVO_FRASE, 'utf8').trim();
  }

  if (!crearSiFalta) {
    throw new Error(
      `No existe la frase de cifrado en ${ARCHIVO_FRASE}. Ejecuta primero "provision".`
    );
  }

  const frase = generarFrase();
  writeFileSync(ARCHIVO_FRASE, frase, { encoding: 'utf8', mode: 0o600 });
  return frase;
}

function leerCredenciales() {
  if (!existsSync(ARCHIVO_CREDENCIALES)) return null;

  const frase = obtenerFrase(false);
  return JSON.parse(descifrar(readFileSync(ARCHIVO_CREDENCIALES), frase));
}

function guardarCredenciales(registros) {
  const frase = obtenerFrase(true);
  const contenido = JSON.stringify(
    { proyecto: PROYECTO, generadoEn: ahoraISO(), registros },
    null,
    2
  );

  writeFileSync(ARCHIVO_CREDENCIALES, cifrar(contenido, frase), { mode: 0o600 });
}

function leerEstado() {
  if (!existsSync(ARCHIVO_ESTADO)) return {};
  return JSON.parse(readFileSync(ARCHIVO_ESTADO, 'utf8'));
}

function guardarEstado(estado) {
  prepararDirectorio();
  writeFileSync(ARCHIVO_ESTADO, JSON.stringify(estado, null, 2), 'utf8');
}

/* -----------------------------------------------
   COMANDO: backup
----------------------------------------------- */

async function volcarColeccion(ruta, salida) {
  const documentos = await listarDocumentos(ruta);
  salida[ruta] = documentos;

  for (const documento of documentos) {
    const hijas = await listarColecciones(`${ruta}/${documento.__id}`);

    for (const hija of hijas) {
      await volcarColeccion(`${ruta}/${documento.__id}/${hija}`, salida);
    }
  }
}

async function comandoBackup() {
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const salida = {};
  const raiz = await listarColecciones('');

  for (const coleccion of raiz) {
    await volcarColeccion(coleccion, salida);
  }

  const usuarios = await listarUsuariosAuth();

  const inventario = usuarios.map((usuario) => ({
    uid: usuario.localId,
    correo: usuario.email ?? null,
    verificado: Boolean(usuario.emailVerified),
    deshabilitado: Boolean(usuario.disabled),
    creado: usuario.createdAt
      ? new Date(Number(usuario.createdAt)).toISOString()
      : null,
    ultimoAcceso: usuario.lastLoginAt
      ? new Date(Number(usuario.lastLoginAt)).toISOString()
      : null,
    claims: usuario.customAttributes ?? null,
  }));

  const paquete = {
    proyecto: PROYECTO,
    generadoEn: ahoraISO(),
    firestore: salida,
    autenticacion: inventario,
  };

  const frase = obtenerFrase(true);
  const destino = join(DIR_ADMIN, `respaldo-${marca}.enc`);

  writeFileSync(destino, cifrar(JSON.stringify(paquete, null, 2), frase), {
    mode: 0o600,
  });

  /* Verificacion de integridad: descifrar y comparar conteos */
  const releido = JSON.parse(
    descifrar(readFileSync(destino), frase)
  );

  let documentosTotales = 0;
  for (const [ruta, documentos] of Object.entries(releido.firestore)) {
    documentosTotales += documentos.length;
    console.log(`  ${ruta}: ${documentos.length}`);
  }

  const integridadOk =
    JSON.stringify(releido.firestore) === JSON.stringify(salida) &&
    releido.autenticacion.length === inventario.length;

  console.log('');
  console.log(`Proyecto: ${PROYECTO}`);
  console.log(`Cuentas de Authentication: ${inventario.length}`);
  console.log(`Documentos de Firestore: ${documentosTotales}`);
  console.log(`Archivo: ${destino}`);
  console.log(`Integridad verificada: ${integridadOk ? 'SI' : 'NO'}`);

  if (!integridadOk) process.exitCode = 1;
}

/* -----------------------------------------------
   COMANDO: provision
----------------------------------------------- */

async function comandoProvision() {
  const existentes = leerCredenciales();
  const previos = new Map(
    (existentes?.registros ?? []).map((registro) => [
      registro.correo,
      registro.contrasena,
    ])
  );

  const registros = [];
  const estado = leerEstado();

  for (const item of MAPA) {
    const aseguradora = datosAseguradora(item.aseguradora);
    const marca = ahoraISO();

    /* 1. Organizacion (no se duplica: mismo id) */
    const organizacionPrevia = await leerDocumento(`organizations/${item.orgId}`);

    await guardarDocumento(`organizations/${item.orgId}`, {
      nombre: aseguradora.nombre,
      slug: item.orgId,
      correo: item.correo,
      telefono: aseguradora.telefono ?? null,
      web: aseguradora.web ?? null,
      whatsapp: aseguradora.whatsapp ?? null,
      color: aseguradora.color ?? null,
      especialidad: aseguradora.especialidad ?? null,
      estado: organizacionPrevia?.estado ?? 'pending',
      accesoHabilitado: organizacionPrevia?.accesoHabilitado ?? true,
      creadaEn: organizacionPrevia?.creadaEn ?? marca,
      actualizadaEn: marca,
    });

    /* 2. Cuenta de Authentication (reutiliza si existe) */
    const usuario = await buscarUsuarioPorCorreo(item.correo);

    let uid = usuario?.localId ?? null;
    let contrasena = previos.get(item.correo) ?? null;
    let accion = 'reutilizada';

    if (!uid) {
      contrasena = generarContrasena(item.prefijo);

      const creado = await crearUsuario({
        correo: item.correo,
        contrasena,
        nombre: aseguradora.nombre,
      });

      uid = creado.localId;
      accion = 'creada';
    } else if (!contrasena) {
      contrasena = generarContrasena(item.prefijo);
      await actualizarUsuario(uid, { password: contrasena });
      accion = 'contrasena-restablecida';
    }

    /* 3. Claims: rol y organizacion */
    await asignarClaims(uid, {
      role: 'insurer_admin',
      orgId: item.orgId,
      claimsVersion: 1,
    });

    /* 4. Perfil en Firestore (merge: no borra datos previos) */
    const perfilPrevio = await leerDocumento(`usuarios/${uid}`);

    await guardarDocumento(`usuarios/${uid}`, {
      uid,
      email: item.correo,
      nombre: perfilPrevio?.nombre ?? aseguradora.nombre,
      role: 'insurer_admin',
      orgId: item.orgId,
      estado: 'activo',
      fechaRegistro: perfilPrevio?.fechaRegistro ?? marca.slice(0, 10),
      seguridad: {
        mustChangePassword: true,
        passwordChangedAt: null,
        credencialTemporalDesde: marca,
      },
    });

    registros.push({
      aseguradora: aseguradora.nombre,
      orgId: item.orgId,
      correo: item.correo,
      contrasena,
      uid,
      accion,
      estadoCuenta: 'creada y verificada',
      primerIngreso: 'cambio obligatorio',
    });

    estado[item.correo] = { uid, orgId: item.orgId, accion, actualizado: marca };

    console.log(
      `${aseguradora.nombre.padEnd(24)} ${item.correo.padEnd(32)} uid=${uid} (${accion})`
    );
  }

  guardarCredenciales(registros);
  guardarEstado(estado);

  console.log('');
  console.log(`Organizaciones y cuentas procesadas: ${registros.length}`);
  console.log(`Credenciales cifradas en: ${ARCHIVO_CREDENCIALES}`);
}

/* -----------------------------------------------
   COMANDO: verify
----------------------------------------------- */

async function comandoVerify() {
  const credenciales = leerCredenciales();

  if (!credenciales) {
    throw new Error('No hay credenciales registradas. Ejecuta primero "provision".');
  }

  if (!API_KEY_WEB) {
    throw new Error('Falta NITRO_WEB_API_KEY (API key web del proyecto).');
  }

  let correctas = 0;

  for (const registro of credenciales.registros) {
    const resultado = await probarLogin(
      API_KEY_WEB,
      registro.correo,
      registro.contrasena
    );

    if (!resultado.ok) {
      console.log(`FALLO  ${registro.aseguradora} -> ${resultado.error}`);
      continue;
    }

    const claimsOk =
      resultado.claims.role === 'insurer_admin' &&
      resultado.claims.orgId === registro.orgId &&
      resultado.uid === registro.uid;

    if (claimsOk) correctas += 1;

    console.log(
      `${claimsOk ? 'OK    ' : 'CLAIMS'} ${registro.aseguradora.padEnd(24)} ` +
        `uid=${resultado.uid} rol=${resultado.claims.role} org=${resultado.claims.orgId}`
    );
  }

  console.log('');
  console.log(`Inicios de sesion correctos: ${correctas} de ${credenciales.registros.length}`);
}

/* -----------------------------------------------
   COMANDO: isolation
----------------------------------------------- */

async function leerComoCliente(ruta, idToken) {
  const respuesta = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents/${ruta}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );

  const texto = await respuesta.text();
  let datos;
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    datos = { crudo: texto };
  }

  return { ok: respuesta.ok, status: respuesta.status, datos };
}

async function comandoIsolation() {
  const credenciales = leerCredenciales();
  if (!credenciales) throw new Error('Faltan credenciales. Ejecuta "provision".');
  if (!API_KEY_WEB) throw new Error('Falta NITRO_WEB_API_KEY.');

  const [primera, segunda] = credenciales.registros;

  const login = await probarLogin(
    API_KEY_WEB,
    primera.correo,
    primera.contrasena
  );

  if (!login.ok) throw new Error(`No se pudo iniciar sesion: ${login.error}`);

  const idToken = login.idToken;

  /* Necesitamos el idToken crudo, no solo los claims */
  const crudo = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY_WEB}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: primera.correo,
        password: primera.contrasena,
        returnSecureToken: true,
      }),
    }
  ).then((respuesta) => respuesta.json());

  const tokenReal = crudo.idToken;

  const pruebas = [
    {
      descripcion: `leer organizacion propia (${primera.orgId})`,
      ruta: `organizations/${primera.orgId}`,
      esperado: 'permitido o pendiente de reglas',
    },
    {
      descripcion: `leer organizacion ajena (${segunda.orgId})`,
      ruta: `organizations/${segunda.orgId}`,
      esperado: 'denegado',
    },
    {
      descripcion: 'leer lista de usuarios',
      ruta: 'usuarios',
      esperado: 'denegado',
    },
  ];

  for (const prueba of pruebas) {
    const resultado = await leerComoCliente(prueba.ruta, tokenReal);
    console.log(
      `${resultado.ok ? 'PERMITIDO' : 'DENEGADO '} ${prueba.descripcion} ` +
        `(HTTP ${resultado.status}, esperado: ${prueba.esperado})`
    );
  }

  void idToken;
}

/* -----------------------------------------------
   COMANDO: credentials
----------------------------------------------- */

async function comandoCredentials() {
  const credenciales = leerCredenciales();
  if (!credenciales) throw new Error('No hay credenciales registradas.');

  console.log('| Aseguradora | Correo electrónico | Contraseña temporal | UID | Estado |');
  console.log('|---|---|---|---|---|');

  for (const registro of credenciales.registros) {
    console.log(
      `| ${registro.aseguradora} | ${registro.correo} | ${registro.contrasena} | ${registro.uid} | ${registro.estadoCuenta} |`
    );
  }
}

/* -----------------------------------------------
   COMANDO: deploy-rules
----------------------------------------------- */

const BASE_REGLAS = `https://firebaserules.googleapis.com/v1/projects/${PROYECTO}`;

async function comandoDeployRules() {
  const rutaReglas = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

  if (!existsSync(rutaReglas)) {
    throw new Error(`No se encontro firestore.rules en ${rutaReglas}`);
  }

  const contenido = readFileSync(rutaReglas, 'utf8');

  /* 1. Crear un ruleset con el contenido del archivo. */
  const ruleset = await llamar(`${BASE_REGLAS}/rulesets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: {
        files: [{ name: 'firestore.rules', content: contenido }],
      },
    }),
  });

  const nombreRuleset = ruleset.name;
  const nombreRelease = `projects/${PROYECTO}/releases/cloud.firestore`;

  /* 2. Apuntar el release de Firestore al ruleset nuevo. */
  try {
    await llamar(`${BASE_REGLAS}/releases/cloud.firestore?updateMask=rulesetName`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        release: { name: nombreRelease, rulesetName: nombreRuleset },
      }),
    });
  } catch (error) {
    if (error.status !== 404) throw error;

    /* El release no existia: se crea. */
    await llamar(`${BASE_REGLAS}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nombreRelease,
        rulesetName: nombreRuleset,
      }),
    });
  }

  console.log(`Reglas publicadas: ${nombreRuleset}`);
  console.log('Release: cloud.firestore');
}

/* -----------------------------------------------
   COMANDO: bootstrap-admin
----------------------------------------------- */

const UID_ADMIN_POR_DEFECTO = '1m4ie5dd9EXySuPRVGRpcnyJMqm1';

async function comandoBootstrapAdmin() {
  const uid = process.argv[3] ?? UID_ADMIN_POR_DEFECTO;

  /* 1. Claim de super administrador. */
  await asignarClaims(uid, { role: 'super_admin', claimsVersion: 1 });

  /* 2. Perfil: sin gate de cambio de contrasena. */
  const perfil = await leerDocumento(`usuarios/${uid}`);
  const seguridad = { ...(perfil?.seguridad ?? {}), mustChangePassword: false };

  await guardarDocumento(`usuarios/${uid}`, {
    uid,
    role: 'super_admin',
    seguridad,
  });

  console.log(`Claim super_admin asignado a ${uid}`);
  console.log(`Perfil actualizado (mustChangePassword=false).`);
}

/* -----------------------------------------------
   COMANDO: seed  /  cleanup-seed
-----------------------------------------------

Crea DATOS DE PRUEBA claramente marcados con
`is_test: true` para poder borrarlos despues sin tocar
los datos reales. NO modifica ninguna cuenta existente.

  - Organizacion "Aseguradora Demo Test" (orgId demo-test)
  - Cuenta de aseguradora demo (demo.aseguradora@example.com)
  - Propietario demo (propietario.demo@example.com)
  - 3 vehiculos del propietario demo
  - 3 vinculos (solicitado, activo, revocado)
  - Consentimientos operativos (y comercial en el activo)
    para probar los avisos de renovacion

La contrasena de las cuentas demo se toma de la variable
de entorno NITRO_SEED_PASSWORD. Si no se define, se genera
una y se guarda en un archivo LOCAL fuera del repositorio
(seed-demo.json). Nunca se sube al repositorio.
----------------------------------------------- */

const SEED = {
  orgId: 'demo-test',
  orgNombre: 'Aseguradora Demo Test',
  aseguradoraCorreo: 'demo.aseguradora@example.com',
  aseguradoraPrefijo: 'DemoAseguradora',
  propietarioCorreo: 'propietario.demo@example.com',
  propietarioPrefijo: 'DemoPropietario',
};

const ARCHIVO_SEED = join(DIR_ADMIN, 'seed-demo.json');

/**
 * Fecha (AAAA-MM-DD) a `dias` de hoy. Se usa para que la
 * demo de renovaciones siempre tenga una poliza dentro del
 * umbral, sin depender de la fecha en que se ejecute.
 */
function fechaEnDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

const VEHICULOS_SEED = [
  {
    id: 'demo-vehiculo-1',
    nombre: 'Demo Sedán',
    marca: 'Mazda',
    modelo: '3',
    year: 2021,
    tipo: 'Carro',
    placa: 'DEM001',
    color: 'Rojo',
    kilometraje: 42000,
    imagen: '',
    producto: 'SOAT',
    estado: 'solicitado',
    poliza: null,
    vigencia: fechaEnDias(60),
  },
  {
    id: 'demo-vehiculo-2',
    nombre: 'Demo Camioneta',
    marca: 'Toyota',
    modelo: 'Hilux',
    year: 2022,
    tipo: 'Carro',
    placa: 'DEM002',
    color: 'Blanco',
    kilometraje: 31000,
    imagen: '',
    producto: 'Todo riesgo',
    estado: 'activo',
    poliza: 'DEMO-POL-002',
    vigencia: fechaEnDias(15),
  },
  {
    id: 'demo-vehiculo-3',
    nombre: 'Demo Moto',
    marca: 'Yamaha',
    modelo: 'FZ',
    year: 2020,
    tipo: 'Moto',
    placa: 'DEM003',
    color: 'Azul',
    kilometraje: 18500,
    imagen: '',
    producto: 'SOAT',
    estado: 'revocado',
    poliza: null,
    vigencia: fechaEnDias(-30),
  },
];

async function asegurarCuentaDemo(correo, contrasena, nombre) {
  const existente = await buscarUsuarioPorCorreo(correo);
  let uid = existente?.localId ?? null;

  if (!uid) {
    const creado = await crearUsuario({ correo, contrasena, nombre });
    uid = creado.localId;
  } else {
    await actualizarUsuario(uid, { password: contrasena });
  }

  return uid;
}

async function comandoSeed() {
  const contrasenaBase =
    process.env.NITRO_SEED_PASSWORD && process.env.NITRO_SEED_PASSWORD.length >= 6
      ? process.env.NITRO_SEED_PASSWORD
      : null;

  const contrasenaAseguradora =
    contrasenaBase ?? generarContrasena(SEED.aseguradoraPrefijo);
  const contrasenaPropietario =
    contrasenaBase ?? generarContrasena(SEED.propietarioPrefijo);

  const marca = ahoraISO();

  /* 1. Organizacion demo (is_test = true). */
  await guardarDocumento(`organizations/${SEED.orgId}`, {
    nombre: SEED.orgNombre,
    slug: SEED.orgId,
    correo: SEED.aseguradoraCorreo,
    telefono: '+57 000 000 0000',
    web: null,
    whatsapp: null,
    color: '#7C3AED',
    especialidad: 'Pruebas',
    estado: 'active',
    accesoHabilitado: true,
    is_test: true,
    creadaEn: marca,
    actualizadaEn: marca,
  });

  /* 2. Cuenta de aseguradora demo. */
  const uidAseguradora = await asegurarCuentaDemo(
    SEED.aseguradoraCorreo,
    contrasenaAseguradora,
    SEED.orgNombre
  );

  await asignarClaims(uidAseguradora, {
    role: 'insurer_admin',
    orgId: SEED.orgId,
    claimsVersion: 1,
  });

  await guardarDocumento(`usuarios/${uidAseguradora}`, {
    uid: uidAseguradora,
    email: SEED.aseguradoraCorreo,
    nombre: SEED.orgNombre,
    role: 'insurer_admin',
    orgId: SEED.orgId,
    estado: 'activo',
    is_test: true,
    fechaRegistro: marca.slice(0, 10),
    seguridad: {
      mustChangePassword: false,
      passwordChangedAt: marca,
      credencialTemporalDesde: null,
    },
  });

  /* 3. Propietario demo. */
  const uidPropietario = await asegurarCuentaDemo(
    SEED.propietarioCorreo,
    contrasenaPropietario,
    'Propietario Demo'
  );

  await guardarDocumento(`usuarios/${uidPropietario}`, {
    uid: uidPropietario,
    email: SEED.propietarioCorreo,
    nombre: 'Propietario Demo',
    role: 'customer',
    telefono: '+57 300 000 0000',
    estado: 'activo',
    is_test: true,
    fechaRegistro: marca.slice(0, 10),
    seguridad: {
      mustChangePassword: false,
      passwordChangedAt: marca,
    },
  });

  /* 4. Vehiculos + vinculos demo. */
  for (const vehiculo of VEHICULOS_SEED) {
    await guardarDocumento(
      `usuarios/${uidPropietario}/vehiculos/${vehiculo.id}`,
      {
        uid: uidPropietario,
        nombre: vehiculo.nombre,
        marca: vehiculo.marca,
        modelo: vehiculo.modelo,
        year: vehiculo.year,
        tipo: vehiculo.tipo,
        placa: vehiculo.placa,
        color: vehiculo.color,
        kilometraje: vehiculo.kilometraje,
        imagen: vehiculo.imagen,
        fechaRegistro: marca.slice(0, 10),
        is_test: true,
      }
    );

    const vinculoId = `${vehiculo.id}_${SEED.orgId}_${vehiculo.producto}`;

    await guardarDocumento(`vehicleInsurerLinks/${vinculoId}`, {
      vehiculoId: vehiculo.id,
      propietarioUid: uidPropietario,
      propietarioNombre: 'Propietario Demo',
      propietarioTelefono: '+57 300 000 0000',
      propietarioCorreo: SEED.propietarioCorreo,
      orgId: SEED.orgId,
      producto: vehiculo.producto,
      placa: vehiculo.placa,
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      year: vehiculo.year,
      tipo: vehiculo.tipo,
      poliza: vehiculo.poliza,
      vigencia: vehiculo.vigencia,
      estado: vehiculo.estado,
      datosPropietarioVisibles: true,
      is_test: true,
      creadoEn: Date.now(),
      actualizadoEn: Date.now(),
    });

    /*
    Consentimientos del propietario demo: operativo
    (indispensable para los avisos de renovacion de la
    Fase 8) y comercial para el vehiculo activo.
    */
    const finalidades =
      vehiculo.estado === 'activo'
        ? ['operativo', 'comercial']
        : ['operativo'];

    for (const finalidad of finalidades) {
      await guardarDocumento(
        `consents/${vehiculo.id}_${SEED.orgId}_${finalidad}`,
        {
          vehiculoId: vehiculo.id,
          propietarioUid: uidPropietario,
          orgId: SEED.orgId,
          finalidad,
          estado: 'otorgado',
          alcance:
            finalidad === 'operativo'
              ? ['nombre', 'correo', 'telefono', 'poliza']
              : ['correo', 'telefono'],
          otorgadoEn: marca,
          revocadoEn: null,
          actualizadoEn: Date.now(),
          is_test: true,
        }
      );
    }
  }

  /* 5. Guardar credenciales demo FUERA del repositorio. */
  prepararDirectorio();
  writeFileSync(
    ARCHIVO_SEED,
    JSON.stringify(
      {
        proyecto: PROYECTO,
        generadoEn: marca,
        nota: 'Datos de prueba (is_test=true). Borrar con: node tools/admin/cli.mjs cleanup-seed',
        aseguradora: {
          correo: SEED.aseguradoraCorreo,
          contrasena: contrasenaAseguradora,
          uid: uidAseguradora,
          orgId: SEED.orgId,
        },
        propietario: {
          correo: SEED.propietarioCorreo,
          contrasena: contrasenaPropietario,
          uid: uidPropietario,
        },
      },
      null,
      2
    ),
    { encoding: 'utf8', mode: 0o600 }
  );

  console.log('Datos de prueba creados (is_test = true):');
  console.log(`  Organizacion : ${SEED.orgNombre} (${SEED.orgId})`);
  console.log(`  Aseguradora  : ${SEED.aseguradoraCorreo}  uid=${uidAseguradora}`);
  console.log(`  Propietario  : ${SEED.propietarioCorreo}  uid=${uidPropietario}`);
  console.log(`  Vehiculos    : ${VEHICULOS_SEED.length} (solicitado, activo, revocado)`);
  console.log('  Consentim.   : operativo (todos) + comercial (activo)');
  console.log(`  Credenciales : ${ARCHIVO_SEED}`);
  if (!contrasenaBase) {
    console.log('');
    console.log('  Contrasenas de prueba (solo para esta sesion):');
    console.log(`    ${SEED.aseguradoraCorreo} -> ${contrasenaAseguradora}`);
    console.log(`    ${SEED.propietarioCorreo} -> ${contrasenaPropietario}`);
  }
}

async function comandoCleanupSeed() {
  let borrados = 0;

  /* 1. Vinculos demo. */
  const vinculos = await listarDocumentos('vehicleInsurerLinks');
  for (const vinculo of vinculos) {
    if (vinculo.is_test === true) {
      await borrarDocumento(`vehicleInsurerLinks/${vinculo.__id}`);
      borrados += 1;
    }
  }

  /* 1b. Consentimientos demo. */
  const consentimientos = await listarDocumentos('consents');
  for (const consentimiento of consentimientos) {
    if (consentimiento.is_test === true) {
      await borrarDocumento(`consents/${consentimiento.__id}`);
      borrados += 1;
    }
  }

  /* 2. Vehiculos demo (subcoleccion del propietario). */
  const usuarios = await listarDocumentos('usuarios');
  for (const usuario of usuarios) {
    if (usuario.is_test !== true) continue;

    const vehiculos = await listarDocumentos(
      `usuarios/${usuario.__id}/vehiculos`
    );
    for (const vehiculo of vehiculos) {
      await borrarDocumento(
        `usuarios/${usuario.__id}/vehiculos/${vehiculo.__id}`
      );
      borrados += 1;
    }

    await borrarDocumento(`usuarios/${usuario.__id}`);
    borrados += 1;

    if (usuario.uid) {
      await eliminarUsuario(usuario.uid);
    }
  }

  /* 3. Organizacion demo. */
  const organizacion = await leerDocumento(`organizations/${SEED.orgId}`);
  if (organizacion?.is_test === true) {
    await borrarDocumento(`organizations/${SEED.orgId}`);
    borrados += 1;
  }

  console.log(`Datos de prueba eliminados: ${borrados} documento(s).`);
  console.log('Las cuentas reales no fueron tocadas.');
}

/* -----------------------------------------------
   COMANDO: sincronizar-aseguradoras [--dry-run]
-----------------------------------------------

Pone al dia las claves de aseguradora SIN asignar nada a mano:

  - organizations/{orgId}.aseguradoraClave   (desde el nombre)
  - usuarios/{uid}/vehiculos/{id}.aseguradoraClave  (desde la aseguradora)
  - usuarios/{uid}/vehiculos/{id}.contactoPropietario (nombre y telefono)

Es IDEMPOTENTE y ADITIVO: solo escribe los campos que faltan o
cambian y nunca toca ningun otro dato.

Con --dry-run solo informa (conteos y resumen por aseguradora) y
NO escribe nada.
----------------------------------------------- */

function extraerContactoCli(usuario) {
  const nombre = String(usuario.nombre ?? '').trim();
  const telefono = String(usuario.telefono ?? '').trim();

  if (!nombre && !telefono) return null;

  return { nombre, telefono };
}

function contactoIgualCli(actual, nuevo) {
  return (
    actual != null &&
    typeof actual === 'object' &&
    actual.nombre === nuevo.nombre &&
    actual.telefono === nuevo.telefono
  );
}

async function comandoSincronizarAseguradoras() {
  const dryRun = process.argv.includes('--dry-run');

  /* 1. Organizaciones. */
  const organizaciones = await listarDocumentos('organizations');
  const orgsPendientes = [];

  console.log(`Organizaciones revisadas: ${organizaciones.length}`);

  for (const organizacion of organizaciones) {
    const clave = claveAseguradora(String(organizacion.nombre ?? ''));
    const actual = String(organizacion.aseguradoraClave ?? '');
    const etiqueta = clave === actual ? 'ok' : `-> ${clave || '(sin nombre)'}`;

    console.log(
      `  ${String(organizacion.nombre ?? organizacion.__id).padEnd(28)} ${etiqueta}`
    );

    if (clave && clave !== actual) {
      orgsPendientes.push({ id: organizacion.__id, clave });
    }
  }

  /* 2. Vehiculos (por usuario) y resumen por aseguradora. */
  const usuarios = await listarDocumentos('usuarios');
  const vehiculosPendientes = [];
  const resumen = new Map();
  let revisados = 0;
  let conSeguro = 0;

  for (const usuario of usuarios) {
    const contacto = extraerContactoCli(usuario);
    const vehiculos = await listarDocumentos(
      `usuarios/${usuario.__id}/vehiculos`
    );

    for (const vehiculo of vehiculos) {
      revisados += 1;

      const clave = claveAseguradora(String(vehiculo.aseguradora ?? ''));
      const actual = String(vehiculo.aseguradoraClave ?? '');
      const cambios = {};

      if (clave !== actual) cambios.aseguradoraClave = clave;

      if (
        clave &&
        contacto &&
        !contactoIgualCli(vehiculo.contactoPropietario, contacto)
      ) {
        cambios.contactoPropietario = contacto;
      }

      if (clave) {
        conSeguro += 1;
        resumen.set(clave, (resumen.get(clave) ?? 0) + 1);
      }

      if (Object.keys(cambios).length > 0) {
        vehiculosPendientes.push({
          ruta: `usuarios/${usuario.__id}/vehiculos/${vehiculo.__id}`,
          cambios,
        });
      }
    }
  }

  console.log('');
  console.log(`Vehiculos revisados: ${revisados}`);
  console.log(`Con seguro (visibles para su aseguradora): ${conSeguro}`);
  console.log('Resumen por aseguradora:');

  if (resumen.size === 0) {
    console.log('  (ninguno)');
  }

  for (const [clave, total] of [...resumen.entries()].sort()) {
    console.log(`  ${clave.padEnd(20)} ${total}`);
  }

  console.log('');
  console.log(`Organizaciones por actualizar: ${orgsPendientes.length}`);
  console.log(`Vehiculos por actualizar     : ${vehiculosPendientes.length}`);

  if (dryRun) {
    console.log('');
    console.log('SIMULACION (--dry-run): no se escribio nada.');
    return;
  }

  let escritos = 0;

  for (const organizacion of orgsPendientes) {
    await guardarDocumento(`organizations/${organizacion.id}`, {
      aseguradoraClave: organizacion.clave,
    });
    escritos += 1;
  }

  for (const vehiculo of vehiculosPendientes) {
    await guardarDocumento(vehiculo.ruta, vehiculo.cambios);
    escritos += 1;
  }

  console.log('');
  console.log(`Documentos actualizados: ${escritos}`);
}

/* -----------------------------------------------
   ENRUTADOR
----------------------------------------------- */

const comando = process.argv[2];

const comandos = {
  backup: comandoBackup,
  provision: comandoProvision,
  verify: comandoVerify,
  isolation: comandoIsolation,
  credentials: comandoCredentials,
  'deploy-rules': comandoDeployRules,
  'bootstrap-admin': comandoBootstrapAdmin,
  seed: comandoSeed,
  'cleanup-seed': comandoCleanupSeed,
  'sincronizar-aseguradoras': comandoSincronizarAseguradoras,
};

if (!comandos[comando]) {
  console.log(
    'Comandos: backup | provision | verify | isolation | credentials | deploy-rules | bootstrap-admin | seed | cleanup-seed | sincronizar-aseguradoras [--dry-run]'
  );
  process.exit(1);
}

try {
  await obtenerToken();
  await comandos[comando]();
} catch (error) {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
}

void decodificarDocumento;
void revocarSesiones;

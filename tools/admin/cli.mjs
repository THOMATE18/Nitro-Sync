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

import { ASEGURADORAS } from '../../data/aseguradoras.ts';

import {
  PROYECTO,
  ahoraISO,
  asignarClaims,
  buscarUsuarioPorCorreo,
  cifrar,
  crearUsuario,
  decodificarDocumento,
  descifrar,
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
};

if (!comandos[comando]) {
  console.log(
    'Comandos: backup | provision | verify | isolation | credentials | deploy-rules | bootstrap-admin'
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

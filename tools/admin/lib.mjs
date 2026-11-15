/*
=======================================================
NITRO SYNC - LIBRERIA DE ADMINISTRACION (REST)
=======================================================

Utilidades para tareas administrativas puntuales que
requieren privilegios de servidor:

  - Respaldo logico de Firestore.
  - Creacion y restablecimiento de cuentas.
  - Asignacion de custom claims.
  - Verificacion real de inicio de sesion.

NO usa firebase-admin: habla directo con las APIs de
Google usando una service account, de modo que no hay
dependencias nuevas en el proyecto.

La ruta de la service account se toma de la variable de
entorno GOOGLE_APPLICATION_CREDENTIALS y NUNCA se guarda
en el repositorio.

IMPORTANTE: este modulo no imprime ni escribe contrasenas.
=======================================================
*/

import { readFileSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';

/* -----------------------------------------------
   SERVICE ACCOUNT
----------------------------------------------- */

const RUTA_SA = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!RUTA_SA) {
  throw new Error(
    'Falta GOOGLE_APPLICATION_CREDENTIALS (ruta al JSON de la service account).'
  );
}

if (!existsSync(RUTA_SA)) {
  throw new Error(`No existe la service account en: ${RUTA_SA}`);
}

const sa = JSON.parse(readFileSync(RUTA_SA, 'utf8'));

if (sa.type !== 'service_account' || !sa.private_key) {
  throw new Error('El archivo no parece una service account valida.');
}

export const PROYECTO = sa.project_id;
export const CLIENTE = sa.client_email;

/* -----------------------------------------------
   TOKEN OAUTH (JWT firmado con RS256)
----------------------------------------------- */

const b64url = (valor) =>
  Buffer.from(valor)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

let cacheToken = null;

export async function obtenerToken() {
  if (cacheToken && cacheToken.expira > Date.now() + 60_000) {
    return cacheToken.token;
  }

  const ahora = Math.floor(Date.now() / 1000);

  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64url(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: ahora,
      exp: ahora + 3600,
    })
  );

  const firmador = crypto.createSign('RSA-SHA256');
  firmador.update(`${cabecera}.${cuerpo}`);
  const firma = b64url(firmador.sign(sa.private_key));

  const respuesta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecera}.${cuerpo}.${firma}`,
    }).toString(),
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(
      `No se pudo obtener token: ${respuesta.status} ${JSON.stringify(datos).slice(0, 300)}`
    );
  }

  cacheToken = {
    token: datos.access_token,
    expira: Date.now() + (datos.expires_in ?? 3600) * 1000,
  };

  return cacheToken.token;
}

/* -----------------------------------------------
   LLAMADAS HTTP
----------------------------------------------- */

export async function llamar(url, opciones = {}) {
  const token = await obtenerToken();

  const respuesta = await fetch(url, {
    ...opciones,
    headers: {
      ...(opciones.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });

  const texto = await respuesta.text();

  let datos;
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    datos = { crudo: texto };
  }

  if (!respuesta.ok) {
    const error = new Error(
      `${respuesta.status} ${url.split('?')[0]} -> ${JSON.stringify(datos).slice(0, 400)}`
    );
    error.status = respuesta.status;
    throw error;
  }

  return datos;
}

/* -----------------------------------------------
   FIRESTORE - CODIFICACION DE VALORES
----------------------------------------------- */

export function codificar(valor) {
  if (valor === null || valor === undefined) return { nullValue: null };
  if (typeof valor === 'string') return { stringValue: valor };
  if (typeof valor === 'boolean') return { booleanValue: valor };
  if (typeof valor === 'number') {
    return Number.isInteger(valor)
      ? { integerValue: String(valor) }
      : { doubleValue: valor };
  }
  if (Array.isArray(valor)) {
    return { arrayValue: { values: valor.map(codificar) } };
  }
  if (typeof valor === 'object') {
    const campos = {};
    for (const [clave, dato] of Object.entries(valor)) {
      campos[clave] = codificar(dato);
    }
    return { mapValue: { fields: campos } };
  }
  throw new Error(`Tipo no soportado en Firestore: ${typeof valor}`);
}

export function decodificar(valor) {
  if (!valor || typeof valor !== 'object') return valor;
  if ('stringValue' in valor) return valor.stringValue;
  if ('booleanValue' in valor) return valor.booleanValue;
  if ('integerValue' in valor) return Number(valor.integerValue);
  if ('doubleValue' in valor) return valor.doubleValue;
  if ('timestampValue' in valor) return valor.timestampValue;
  if ('nullValue' in valor) return null;
  if ('arrayValue' in valor) {
    return (valor.arrayValue.values ?? []).map(decodificar);
  }
  if ('mapValue' in valor) {
    const objeto = {};
    for (const [clave, dato] of Object.entries(valor.mapValue.fields ?? {})) {
      objeto[clave] = decodificar(dato);
    }
    return objeto;
  }
  return valor;
}

export function decodificarDocumento(documento) {
  const objeto = { __id: documento.name.split('/').pop() };
  for (const [clave, valor] of Object.entries(documento.fields ?? {})) {
    objeto[clave] = decodificar(valor);
  }
  return objeto;
}

const BASE_FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents`;

/* -----------------------------------------------
   FIRESTORE - LECTURA
----------------------------------------------- */

export async function listarColecciones(rutaPadre = '') {
  const padre = rutaPadre
    ? `${BASE_FIRESTORE}/${rutaPadre}`
    : BASE_FIRESTORE;

  const datos = await llamar(`${padre}:listCollectionIds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageSize: 1000 }),
  });

  return datos.collectionIds ?? [];
}

export async function listarDocumentos(ruta) {
  const documentos = [];
  let tokenPagina = null;
  let vueltas = 0;

  do {
    const url = new URL(`${BASE_FIRESTORE}/${ruta}`);
    url.searchParams.set('pageSize', '300');
    if (tokenPagina) url.searchParams.set('pageToken', tokenPagina);

    const datos = await llamar(url.toString());

    for (const documento of datos.documents ?? []) {
      documentos.push(decodificarDocumento(documento));
    }

    tokenPagina = datos.nextPageToken ?? null;
    vueltas += 1;
  } while (tokenPagina && vueltas < 200);

  return documentos;
}

/* -----------------------------------------------
   FIRESTORE - ESCRITURA
----------------------------------------------- */

/**
 * Crea o actualiza un documento.
 * Con merge=true solo toca los campos enviados.
 */
export async function guardarDocumento(ruta, datos, { merge = true } = {}) {
  const url = new URL(`${BASE_FIRESTORE}/${ruta}`);

  if (merge) {
    for (const clave of Object.keys(datos)) {
      url.searchParams.append('updateMask.fieldPaths', clave);
    }
  } else {
    url.searchParams.set('currentDocument.exists', 'false');
  }

  const cuerpo = {
    fields: Object.fromEntries(
      Object.entries(datos).map(([clave, valor]) => [clave, codificar(valor)])
    ),
  };

  return llamar(url.toString(), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
}

export async function leerDocumento(ruta) {
  try {
    const datos = await llamar(`${BASE_FIRESTORE}/${ruta}`);
    return decodificarDocumento(datos);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

/* -----------------------------------------------
   FIREBASE AUTHENTICATION
----------------------------------------------- */

const BASE_IDENTIDAD = `https://identitytoolkit.googleapis.com/v1/projects/${PROYECTO}/accounts`;

export async function listarUsuariosAuth() {
  const usuarios = [];
  let tokenPagina = null;

  do {
    const url = new URL(BASE_IDENTIDAD + ':batchGet');
    url.searchParams.set('maxResults', '1000');
    if (tokenPagina) url.searchParams.set('nextPageToken', tokenPagina);

    const datos = await llamar(url.toString());

    usuarios.push(...(datos.users ?? []));
    tokenPagina = datos.nextPageToken ?? null;
  } while (tokenPagina);

  return usuarios;
}

export async function buscarUsuarioPorCorreo(correo) {
  const lista = await listarUsuariosAuth();
  return lista.find(
    (usuario) => (usuario.email ?? '').toLowerCase() === correo.toLowerCase()
  ) ?? null;
}

export async function crearUsuario({ correo, contrasena, nombre }) {
  return llamar(BASE_IDENTIDAD, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: correo,
      password: contrasena,
      displayName: nombre,
      emailVerified: false,
    }),
  });
}

export async function actualizarUsuario(uid, cambios) {
  return llamar(BASE_IDENTIDAD + ':update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, ...cambios }),
  });
}

export async function asignarClaims(uid, claims) {
  return actualizarUsuario(uid, {
    customAttributes: JSON.stringify(claims),
  });
}

export async function revocarSesiones(uid) {
  return actualizarUsuario(uid, {
    validSince: String(Math.floor(Date.now() / 1000)),
  });
}

/* -----------------------------------------------
   VERIFICACION REAL DE INICIO DE SESION
----------------------------------------------- */

/**
 * Hace un login REAL contra Firebase Authentication
 * usando el endpoint publico de Identity Toolkit.
 * Devuelve null si las credenciales no funcionan.
 */
export async function probarLogin(apiKey, correo, contrasena) {
  const respuesta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: correo,
        password: contrasena,
        returnSecureToken: true,
      }),
    }
  );

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    return { ok: false, error: datos?.error?.message ?? `HTTP ${respuesta.status}` };
  }

  const partes = String(datos.idToken).split('.');
  const payload = JSON.parse(
    Buffer.from(partes[1], 'base64url').toString('utf8')
  );

  return {
    ok: true,
    uid: datos.localId,
    claims: {
      role: payload.role ?? null,
      orgId: payload.orgId ?? null,
      claimsVersion: payload.claimsVersion ?? null,
    },
  };
}

/* -----------------------------------------------
   GENERACION DE CONTRASENAS
----------------------------------------------- */

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Contrasena legible pero con entropia real:
 *   Prefijo_XXXXXXXX  (8 caracteres aleatorios)
 * Sin caracteres ambiguos (0/O, 1/l/I) para poder dictarla.
 */
export function generarContrasena(prefijo) {
  const bytes = crypto.randomBytes(8);
  let sufijo = '';
  for (const byte of bytes) {
    sufijo += ALFABETO[byte % ALFABETO.length];
  }
  return `${prefijo}_${sufijo}`;
}

/* -----------------------------------------------
   CIFRADO DE ARCHIVOS (AES-256-GCM)
----------------------------------------------- */

const MAGIA = Buffer.from('NITROENC1');

function derivarClave(frase, sal) {
  return crypto.scryptSync(frase, sal, 32);
}

export function cifrar(texto, frase) {
  const sal = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const clave = derivarClave(frase, sal);

  const cifrador = crypto.createCipheriv('aes-256-gcm', clave, iv);
  const cifrado = Buffer.concat([
    cifrador.update(texto, 'utf8'),
    cifrador.final(),
  ]);

  return Buffer.concat([MAGIA, sal, iv, cifrador.getAuthTag(), cifrado]);
}

export function descifrar(buffer, frase) {
  if (!buffer.subarray(0, MAGIA.length).equals(MAGIA)) {
    throw new Error('El archivo no tiene el formato esperado.');
  }

  let posicion = MAGIA.length;
  const sal = buffer.subarray(posicion, posicion + 16);
  posicion += 16;
  const iv = buffer.subarray(posicion, posicion + 12);
  posicion += 12;
  const etiqueta = buffer.subarray(posicion, posicion + 16);
  posicion += 16;

  const clave = derivarClave(frase, sal);
  const descifrador = crypto.createDecipheriv('aes-256-gcm', clave, iv);
  descifrador.setAuthTag(etiqueta);

  return Buffer.concat([
    descifrador.update(buffer.subarray(posicion)),
    descifrador.final(),
  ]).toString('utf8');
}

export function generarFrase() {
  return crypto.randomBytes(18).toString('base64url');
}

/* -----------------------------------------------
   UTILIDADES
----------------------------------------------- */

export function ahoraISO() {
  return new Date().toISOString();
}

export function nombreArchivoSeguro(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

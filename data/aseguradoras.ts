/*
=======================================================
NITRO SYNC - DIRECTORIO DE ASEGURADORAS (COLOMBIA)
=======================================================

Datos de contacto de las aseguradoras de vehículos más
usadas en Colombia.

Cada registro tiene:

  - nombre              : nombre comercial.
  - telefono            : línea principal (marcable).
  - telefonoGratuito    : línea nacional gratuita.
  - whatsapp            : atención por WhatsApp (si tiene).
  - linea               : línea corta desde celular.
  - web                 : portal de atención.
  - color / colorTexto  : identidad visual en la app.
  - especialidad        : para qué sirve cada una.

El archivo Excel con esta misma información está en:

  assets/documentos/aseguradoras.xlsx

Para regenerarlo después de editar esta lista:

  npm run excel:aseguradoras

Los números se guardan en formato internacional para que
`tel:` funcione igual en Android, iOS y web.
=======================================================
*/

export interface Aseguradora {
  id: string;
  /**
   * Clave normalizada que identifica a la aseguradora en todo
   * el sistema multi-tenant (organizations.aseguradoraClave y
   * vehiculos.aseguradoraClave). Es estable: aunque el nombre
   * comercial cambie, la clave no.
   */
  clave: string;
  /**
   * Nombres alternativos con los que la gente escribe la
   * aseguradora ("SURA", "Suramericana", "Colpatria"...).
   * `claveAseguradora` los usa para reconocer el catálogo sin
   * obligar a nadie a asignar la clave a mano.
   */
  alias?: string[];
  nombre: string;
  telefono: string;
  telefonoGratuito?: string;
  whatsapp?: string;
  linea?: string;
  web: string;
  color: string;
  colorTexto: string;
  especialidad: string;
}

export const ASEGURADORAS: Aseguradora[] = [
  {
    id: 'sura',
    clave: 'sura',
    alias: [
      'SURA',
      'Seguros SURA',
      'SURA Seguros',
      'Suramericana',
      'Seguros Suramericana',
    ],
    nombre: 'SURA',
    telefono: '+576014378888',
    telefonoGratuito: '018000518888',
    whatsapp: '+573152757888',
    linea: '#888',
    web: 'https://www.sura.com',
    color: '#0033A0',
    colorTexto: '#FFFFFF',
    especialidad: 'Autos, motos y todo riesgo',
  },
  {
    id: 'bolivar',
    clave: 'seguros_bolivar',
    alias: ['Seguros Bolívar', 'Bolívar', 'Bolivar', 'Seguros Bolivar'],
    nombre: 'Seguros Bolívar',
    telefono: '+576013122122',
    telefonoGratuito: '018000123322',
    linea: '#322',
    web: 'https://www.segurosbolivar.com',
    color: '#00A94F',
    colorTexto: '#04220F',
    especialidad: 'Autos y motos',
  },
  {
    id: 'axa',
    clave: 'axa_colpatria',
    alias: [
      'AXA Colpatria',
      'Colpatria',
      'AXA',
      'AXA Colpatria Seguros',
      'Seguros Colpatria',
    ],
    nombre: 'AXA Colpatria',
    telefono: '+576014235757',
    telefonoGratuito: '018000512620',
    linea: '#247',
    web: 'https://www.axacolpatria.co',
    color: '#00008F',
    colorTexto: '#FFFFFF',
    especialidad: 'Autos, motos y asistencia',
  },
  {
    id: 'mapfre',
    clave: 'mapfre',
    alias: ['MAPFRE', 'Mapfre Seguros', 'Mapfre Colombia'],
    nombre: 'MAPFRE',
    telefono: '+576013077024',
    telefonoGratuito: '018000519991',
    whatsapp: '+573188030276',
    linea: '#624',
    web: 'https://www.mapfre.com.co',
    color: '#C8102E',
    colorTexto: '#FFFFFF',
    especialidad: 'Autos y motos',
  },
  {
    id: 'allianz',
    clave: 'allianz',
    alias: ['Allianz', 'Allianz Seguros', 'Allianz Colombia'],
    nombre: 'Allianz',
    telefono: '+576015941133',
    telefonoGratuito: '018000513500',
    linea: '#265',
    web: 'https://www.allianz.co',
    color: '#003781',
    colorTexto: '#FFFFFF',
    especialidad: 'Autos y motos',
  },
  {
    id: 'liberty',
    clave: 'liberty',
    alias: ['Liberty', 'Liberty Seguros', 'Liberty Colombia', 'Liberty Seguros Colombia'],
    nombre: 'Liberty Seguros',
    telefono: '+576019181600',
    whatsapp: '+573164821802',
    web: 'https://www.libertycolombia.com',
    color: '#0B3D91',
    colorTexto: '#FFFFFF',
    especialidad: 'Autos y motos',
  },
  {
    id: 'sbs',
    clave: 'sbs',
    alias: ['SBS', 'SBS Seguros', 'SBS Seguros Colombia'],
    nombre: 'SBS Seguros',
    telefono: '+576013138700',
    telefonoGratuito: '018000911360',
    linea: '#360',
    web: 'https://www.sbsseguros.com',
    color: '#E30613',
    colorTexto: '#FFFFFF',
    especialidad: 'Autos y motos',
  },
  {
    id: 'estado',
    clave: 'seguros_del_estado',
    alias: ['Seguros del Estado', 'Seguros Estado', 'Del Estado'],
    nombre: 'Seguros del Estado',
    telefono: '+576017443900',
    telefonoGratuito: '018000123010',
    linea: '#388',
    web: 'https://www.segurosdelestado.com',
    color: '#00539B',
    colorTexto: '#FFFFFF',
    especialidad: 'Autos, motos y SOAT',
  },
  {
    id: 'hdi',
    clave: 'hdi',
    alias: ['HDI', 'HDI Seguros', 'HDI Colombia'],
    nombre: 'HDI Seguros',
    telefono: '+576013077050',
    telefonoGratuito: '018000113390',
    whatsapp: '+573164821802',
    linea: '#224',
    web: 'https://www.hdi.com.co',
    color: '#00A3E0',
    colorTexto: '#04222B',
    especialidad: 'Autos y motos',
  },
  {
    id: 'equidad',
    clave: 'la_equidad',
    alias: ['La Equidad', 'Equidad', 'La Equidad Seguros'],
    nombre: 'La Equidad Seguros',
    telefono: '+576019172127',
    telefonoGratuito: '018000919538',
    whatsapp: '+573185884515',
    linea: '#324',
    web: 'https://www.laequidadseguros.coop',
    color: '#00693E',
    colorTexto: '#FFFFFF',
    especialidad: 'Autos y motos',
  },
  {
    id: 'positiva',
    clave: 'positiva',
    alias: ['Positiva', 'Positiva Seguros', 'Positiva Compañía de Seguros'],
    nombre: 'Positiva',
    telefono: '+576013307000',
    telefonoGratuito: '018000111170',
    web: 'https://www.positivacolombia.com',
    color: '#FFD100',
    colorTexto: '#231A00',
    especialidad: 'SOAT y riesgos laborales',
  },
];

/**
 * Busca una aseguradora por nombre, id, clave o alias.
 *
 * La comparación normaliza el texto (minúsculas, sin tildes
 * ni signos), así que "Seguros Bolivar", "Bolívar" o
 * "SEGUROS BOLÍVAR" encuentran la misma aseguradora.
 */
export function buscarAseguradora(
  nombre: string | null | undefined
): Aseguradora | undefined {
  if (!nombre) {
    return undefined;
  }

  const buscado = normalizarClave(nombre);

  if (!buscado) {
    return undefined;
  }

  return ASEGURADORAS.find(
    (aseguradora) =>
      normalizarClave(aseguradora.id) === buscado ||
      normalizarClave(aseguradora.clave) === buscado ||
      normalizarClave(aseguradora.nombre) === buscado ||
      (aseguradora.alias ?? []).some(
        (alias) => normalizarClave(alias) === buscado
      )
  );
}

/**
 * Normaliza un texto a clave: minúsculas, sin tildes y con
 * guion bajo entre palabras ("Seguros Bolívar" -> "seguros_bolivar").
 */
export function normalizarClave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Clave normalizada de una aseguradora a partir de su nombre.
 *
 *   claveAseguradora('SURA')           -> 'sura'
 *   claveAseguradora('AXA Colpatria')  -> 'axa_colpatria'
 *   claveAseguradora('Seguros Bolívar')-> 'seguros_bolivar'
 *
 * Si el nombre está en el directorio se usa su `clave`; si no,
 * se normaliza el texto para no perder el valor. Devuelve '' si
 * no hay aseguradora (vehículo sin seguro).
 */
export function claveAseguradora(nombre: string | null | undefined): string {
  const limpio = (nombre ?? '').trim();

  if (!limpio) {
    return '';
  }

  return buscarAseguradora(limpio)?.clave ?? normalizarClave(limpio);
}

/** Quita todo lo que no sea dígito o "+" para usar en `tel:`. */
export function telefonoMarcable(telefono: string | null | undefined): string {
  return (telefono ?? '').replace(/[^\d+]/g, '');
}

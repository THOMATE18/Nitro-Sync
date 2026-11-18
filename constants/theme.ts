/**
 * ========================================================
 * NITRO SYNC - SISTEMA DE DISEÑO (TEMA)
 * ========================================================
 *
 * Fuente única de colores, gradientes y sombras para TODA
 * la aplicación. Cambiando estos valores se rediseña la
 * app sin tocar las pantallas.
 *
 * Concepto: "Nitro" — retro-moderno inspirado en el R5.
 *
 *   - Tinta     : Azul noche (#0B1030)  -> base y bordes
 *   - Primario  : Azul eléctrico (#2B4BFF) -> marca/acción
 *   - Acento    : Lima nitro (#C8FF3D) -> botones y detalles
 *   - Coral     : (#FF5A5F) -> alertas y energía
 *   - Fondo     : Blanco frío (#EEF1FA) -> descanso visual
 *
 * Los botones "R5" usan:
 *   - borde grueso de tinta
 *   - radio generoso
 *   - sombra DURA sin difuminado (offset 0,0,0)
 *   - mayúsculas y espaciado amplio
 *
 * Gradientes (expo-linear-gradient):
 *   - marca  : azul noche -> azul eléctrico
 *   - boton  : azul eléctrico -> azul profundo
 *   - nitro  : lima -> verde lima
 *   - suave  : azul hielo -> lima pálido
 * ========================================================
 */

import { Platform } from 'react-native';

import type { EstadoDocumento, EstadoRecordatorio } from '@/types/models';

/* -------------------------------------------------------
   PALETA DE COLORES
   ------------------------------------------------------- */

export const Paleta = {
  // Fondo y superficies
  fondo: '#EEF1FA',
  fondoAlterno: '#E3E8F6',
  tarjeta: '#FFFFFF',
  borde: '#DCE3F5',

  // Texto
  texto: '#0B1030',
  textoSecundario: '#5A6489',
  textoSuave: '#8E98B8',

  // Tinta (bordes duros y textos sobre lima)
  tinta: '#0B1030',
  /** Borde "duro" tipo sticker (cambia con el tema). */
  bordeDuro: '#0B1030',
  blanco: '#FFFFFF',

  // Marca / acción
  primario: '#2B4BFF',
  primarioOscuro: '#1B31C9',
  primarioClaro: '#E4EAFF',
  acento: '#C8FF3D',
  acentoOscuro: '#9BE000',
  acentoClaro: '#EFFFCB',
  coral: '#FF5A5F',
  coralClaro: '#FFE3E3',

  // Estados
  exito: '#0E9F6E',
  exitoFondo: '#D7F7E9',
  advertencia: '#D97706',
  advertenciaFondo: '#FEF0C7',
  peligro: '#E11D48',
  peligroFondo: '#FFE3E3',

  /*
  Texto legible SOBRE los fondos de estado (píldoras, avisos,
  banners). En claro son tonos oscuros; en oscuro se aclaran
  para mantener el contraste mínimo de 4.5:1.
  */
  textoExito: '#067A55',
  textoAdvertencia: '#9A5B00',
  textoPeligro: '#B3123E',
  /** Texto legible sobre `acentoClaro`. */
  textoAcento: '#3E5A08',
} as const;

/**
 * Tipo de la paleta. Es un mapa con las MISMAS claves que
 * `Paleta` pero con valores de color libres, para que
 * `PaletaOscura` pueda declararse sin chocar con los tipos
 * literales de `Paleta` (`as const`).
 */
export type TipoPaleta = { [Clave in keyof typeof Paleta]: string };

/* -------------------------------------------------------
   PALETA OSCURA

   Misma estructura que `Paleta` pero con superficies
   oscuras y textos claros. Los acentos de marca (lima y
   azul) se aclaran lo justo para mantener contraste sobre
   fondo oscuro. `tinta` se mantiene oscura porque se usa
   como texto sobre el lima y como fondo de botones oscuros.
   ------------------------------------------------------- */

export const PaletaOscura: TipoPaleta = {
  // Fondo y superficies
  fondo: '#0A0F26',
  fondoAlterno: '#10173A',
  tarjeta: '#151B42',
  /* Bordes y separadores con contraste >= 3:1 sobre tarjeta/fondo. */
  borde: '#5A6BB5',

  // Texto
  texto: '#F2F4FF',
  textoSecundario: '#AEB7DA',
  textoSuave: '#8B95BD',

  // Tinta (se mantiene oscura: texto sobre lima / fondos oscuros)
  tinta: '#0B1030',
  /** Borde "duro" claro para que resalte sobre fondo oscuro. */
  bordeDuro: '#C9D2F5',
  blanco: '#FFFFFF',

  // Marca / acción
  primario: '#6E8BFF',
  /* Texto de chips sobre `primarioClaro` (contraste >= 4.5:1). */
  primarioOscuro: '#93A8FF',
  primarioClaro: '#1B2551',
  acento: '#C8FF3D',
  acentoOscuro: '#9BE000',
  acentoClaro: '#243012',
  coral: '#FF7A80',
  coralClaro: '#3A1F26',

  // Estados
  exito: '#4ADE9E',
  exitoFondo: '#0F3324',
  advertencia: '#F6B23E',
  advertenciaFondo: '#33260A',
  peligro: '#FF7085',
  peligroFondo: '#3A1420',

  /* Texto legible sobre los fondos de estado (oscuro: tonos claros). */
  textoExito: '#4ADE9E',
  textoAdvertencia: '#F6B23E',
  textoPeligro: '#FF7085',
  textoAcento: '#C8FF3D',
};

/* -------------------------------------------------------
   GRADIENTES (expo-linear-gradient)
   ------------------------------------------------------- */

export const Gradientes = {
  /** Azul noche -> azul eléctrico: encabezados y banners. */
  marca: ['#0B1030', '#27379C'] as const,

  /** Variante con más chispa para portadas. */
  marcaViva: ['#0B1030', '#2B4BFF'] as const,

  /** Fondo sutil: tarjetas decorativas y badges suaves. */
  suave: ['#E4EAFF', '#EFFFCB'] as const,

  /** Botones de acción principal. */
  boton: ['#2B4BFF', '#1B31C9'] as const,

  /** Acento lima (botones Nitro). */
  nitro: ['#C8FF3D', '#A6F000'] as const,

  /** Coral (alertas, eliminar). */
  coral: ['#FF7A6E', '#FF5A5F'] as const,
} as const;

/* -------------------------------------------------------
   SOMBRAS REUTILIZABLES
   -------------------------------------------------------

   En web, react-native-web deprecó las propiedades
   "shadow*" (mostraba el aviso: «"shadow*" style props
   are deprecated. Use "boxShadow"»).

   Por eso:
     - Web            -> boxShadow (CSS)
     - Android/iOS    -> sombras nativas + elevation

   Además se incluye la sombra DURA del estilo Nitro:
   sin difuminado y desplazada, como un sticker.
   ------------------------------------------------------- */

function crearSombra(
  desplazamientoY: number,
  difuminado: number,
  opacidad: number,
  elevacion: number,
) {
  if (Platform.OS === 'web') {
    return {
      boxShadow: `0px ${desplazamientoY}px ${difuminado}px rgba(11, 16, 48, ${opacidad})`,
    };
  }

  return {
    shadowColor: '#0B1030',
    shadowOffset: { width: 0, height: desplazamientoY },
    shadowOpacity: opacidad,
    shadowRadius: difuminado,
    elevation: elevacion,
  };
}

/**
 * Sombra dura (sin blur): el sello visual del estilo R5.
 * `x` e `y` son el desplazamiento en píxeles.
 */
export function sombraDura(x = 4, y = 4, color = '#0B1030') {
  if (Platform.OS === 'web') {
    return { boxShadow: `${x}px ${y}px 0px ${color}` };
  }

  return {
    shadowColor: color,
    shadowOffset: { width: x, height: y },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  };
}

export const Sombras = {
  tarjeta: crearSombra(6, 16, 0.08, 2),

  flotante: crearSombra(12, 26, 0.16, 6),

  /** Sombra mínima para píldoras y chips. */
  suave: crearSombra(2, 6, 0.06, 1),

  /** Botón chunky pequeño. */
  duro: sombraDura(4, 4),

  /** Botón chunky grande (CTA principal). */
  duroGrande: sombraDura(6, 6),

  /** Igual pero en azul eléctrico (para stickers de color). */
  duroAzul: sombraDura(4, 4, '#2B4BFF'),
} as const;

/* -------------------------------------------------------
   RADIOS DE ESQUINA
   ------------------------------------------------------- */

export const Radios = {
  suave: 14,
  tarjeta: 20,
  grande: 30,
  pastilla: 999,
} as const;

/* -------------------------------------------------------
   ESPACIADO ESTÁNDAR
   ------------------------------------------------------- */

export const Espaciado = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/* -------------------------------------------------------
   LAYOUT (adaptación a pantallas grandes / web)
   -------------------------------------------------------

   En el navegador la ventana suele ser muy ancha y las
   pantallas se estiraban de lado a lado. Aquí se define
   un ancho máximo para centrar el contenido y que la app
   se vea ordenada y profesional, tipo aplicación de
   escritorio.

   En Android/iOS no cambia nada (objeto vacío).
   ------------------------------------------------------- */

export const ANCHO_CONTENIDO = 940;

export const Layout = {
  anchoContenido: ANCHO_CONTENIDO,

  /** Se aplica al contenedor raíz de la app para centrarla en web. */
  appWeb:
    Platform.OS === 'web'
      ? ({
          width: '100%',
          maxWidth: ANCHO_CONTENIDO,
          alignSelf: 'center',
        } as const)
      : ({} as const),
} as const;

/** Fondo de la página cuando la app corre en un navegador. */
export const FondoWeb = '#DCE2F4';

/* -------------------------------------------------------
   COLORES DE ESTADO (píldoras de documentos)

   El estado se calcula con utils/fechas.ts y aquí se
   traduce a color: verde = vigente, ámbar = próximo a
   vencer, rojo = vencido.
   ------------------------------------------------------- */

export const ColoresEstado = {
  Vigente: { texto: '#067A55', fondo: '#D7F7E9', borde: '#A9EBD2' },
  'Proximo a vencer': { texto: '#9A5B00', fondo: '#FEF0C7', borde: '#FADB8A' },
  Vencido: { texto: '#B3123E', fondo: '#FFE3E3', borde: '#FFC2C2' },
} as const satisfies Record<
  EstadoDocumento,
  { texto: string; fondo: string; borde: string }
>;

/* -------------------------------------------------------
   COLORES POR TIPO DE VEHÍCULO
   ------------------------------------------------------- */

export const ColoresTipo = {
  Carro: { texto: '#16205C', fondo: '#E4EAFF', borde: '#C3CFFF' },
  Moto: { texto: '#33520A', fondo: '#EFFFCB', borde: '#D2F57A' },
} as const;

/* -------------------------------------------------------
   COLORES DE ESTADO (recordatorios)
   ------------------------------------------------------- */

export const ColoresRecordatorio = {
  Pendiente: { texto: '#1B31C9', fondo: '#E4EAFF', borde: '#C3CFFF' },
  Proximo: { texto: '#9A5B00', fondo: '#FEF0C7', borde: '#FADB8A' },
  Vencido: { texto: '#B3123E', fondo: '#FFE3E3', borde: '#FFC2C2' },
  Completado: { texto: '#067A55', fondo: '#D7F7E9', borde: '#A9EBD2' },
} as const satisfies Record<
  EstadoRecordatorio,
  { texto: string; fondo: string; borde: string }
>;

/* =======================================================
   TEMAS DE CLARO/OSCURO (compatibilidad con navegación)
   ======================================================= */

export const Colors = {
  light: {
    text: Paleta.texto,
    background: Paleta.fondo,
    card: Paleta.tarjeta,
    border: Paleta.borde,
    primary: Paleta.primario,
    tint: Paleta.primario,
    icon: Paleta.textoSuave,
    tabIconDefault: Paleta.textoSuave,
    tabIconSelected: Paleta.primario,
  },
  dark: {
    text: PaletaOscura.texto,
    background: PaletaOscura.fondo,
    card: PaletaOscura.tarjeta,
    border: PaletaOscura.borde,
    primary: PaletaOscura.acento,
    tint: PaletaOscura.acento,
    icon: PaletaOscura.textoSuave,
    tabIconDefault: PaletaOscura.textoSuave,
    tabIconSelected: PaletaOscura.acento,
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

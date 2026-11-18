/*
=======================================================
NITRO SYNC - CONTACTO (TELÉFONO Y WHATSAPP)
=======================================================

CONSTRUCTOR ÚNICO de enlaces de contacto (WhatsApp y
llamada) para toda la app. Antes había dos lógicas
distintas (una en `utils/contacto.ts` y otra en
`services/whatsapp.ts`), lo que producía enlaces distintos
según la pantalla. Ahora TODO pasa por `enlaceWhatsApp()`
y `enlaceLlamada()`.

Regla de normalización (Colombia):

  - Se dejan solo los dígitos.
  - A un celular de 10 dígitos se le antepone `57`
    (indicativo del país) para que `wa.me` funcione.
  - Si ya viene con indicativo (12 dígitos, `57...`) se
    usa tal cual.
  - Si el número no alcanza un mínimo razonable (8 dígitos)
    se devuelve `null`: no hay enlace.
=======================================================
*/

import { Platform } from 'react-native';
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { nombreAseguradora, textoVencimiento } from '@/utils/admin';

import type { Organizacion } from '@/types/negocio';
import type { Vehiculo } from '@/types/models';

export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/**
 * LÍNEA DE ATENCIÓN — fuente única del número oficial.
 *
 * Prioridad (no se inventa ningún número):
 *   1. `organizations.telefonoContacto` (editable por la aseguradora)
 *   2. `organizations.whatsapp`
 *   3. `organizations.telefono`
 *   4. `fallback` del directorio (solo mientras Firestore no tenga dato)
 *
 * El botón de WhatsApp y la línea de atención usan SIEMPRE
 * esta función, por lo que nunca pueden diferir.
 */
export function lineaAtencion(
  organizacion: Pick<Organizacion, 'telefonoContacto' | 'whatsapp' | 'telefono'> | null,
  fallback: string | null | undefined = null
): string | null {
  return (
    organizacion?.telefonoContacto ||
    organizacion?.whatsapp ||
    organizacion?.telefono ||
    fallback ||
    null
  );
}

/**
 * Valida un número internacional (E.164) para Colombia:
 * `+57` seguido de 10 dígitos, o `57` seguido de 10 dígitos,
 * o un celular local de 10 dígitos que empiece por 3.
 * Las líneas fijas de 7 dígitos también se aceptan como
 * número de atención (no para WhatsApp).
 */
export function esNumeroInternacionalValido(texto: string | null | undefined): boolean {
  const digitos = soloDigitos(texto ?? '');

  if (digitos.length === 12 && digitos.startsWith('57')) return true;
  if (digitos.length === 10 && digitos.startsWith('3')) return true;
  if (digitos.length === 7) return true;

  return false;
}

/**
 * Abre un enlace externo (wa.me / tel:) en móvil y en web.
 * En navegador se usa el browser del sistema para no salir
 * de la app; en nativo se usa Linking.
 */
export async function abrirEnlace(enlace: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      await WebBrowser.openBrowserAsync(enlace);
      return true;
    }

    const soportado = await Linking.canOpenURL(enlace);
    if (!soportado) return false;

    await Linking.openURL(enlace);
    return true;
  } catch {
    return false;
  }
}

export function esCelularValido(texto: string): boolean {
  const digitos = soloDigitos(texto);

  return (
    (digitos.length === 10 && digitos.startsWith('3')) ||
    (digitos.length === 12 && digitos.startsWith('573'))
  );
}

/**
 * Valida un teléfono de atención de una aseguradora: acepta
 * fijos y celulares, entre 7 y 13 dígitos.
 */
export function esTelefonoValido(texto: string): boolean {
  const digitos = soloDigitos(texto);

  return digitos.length >= 7 && digitos.length <= 13;
}

/** Normaliza a formato internacional: antepone 57 a celulares de 10 dígitos. */
export function telefonoInternacional(texto: string | null | undefined): string {
  const digitos = soloDigitos(texto ?? '');

  return digitos.length === 10 ? `57${digitos}` : digitos;
}

/**
 * Constructor ÚNICO de enlaces `wa.me` con mensaje prellenado.
 * Devuelve `null` si el número no es válido.
 */
export function enlaceWhatsApp(
  telefono: string | null | undefined,
  mensaje: string
): string | null {
  const destino = telefonoInternacional(telefono);

  /* wa.me solo funciona con celulares: 57 + 10 dígitos. */
  if (destino.length !== 12 || !destino.startsWith('57')) return null;

  return `https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Constructor ÚNICO de enlaces `tel:` (misma normalización que
 * WhatsApp: antepone 57 a celulares de 10 dígitos). Devuelve
 * `null` si el número no es válido. Lo usan por igual el panel
 * de administrador y el panel de aseguradora.
 */
export function enlaceLlamada(telefono: string | null | undefined): string | null {
  const destino = telefonoInternacional(telefono);

  if (destino.length < 8) return null;

  return `tel:+${destino}`;
}

export function mensajeContacto(vehiculo: Vehiculo): string {
  const nombre = vehiculo.nombre || `${vehiculo.marca} ${vehiculo.modelo}`;
  const placa = vehiculo.placa ? ` (${vehiculo.placa})` : '';
  const aseguradora = nombreAseguradora(vehiculo);

  if (!aseguradora) {
    return `Hola, soy tu agente de seguros en Nitro Sync. Vi que tu ${nombre}${placa} no tiene seguro registrado. ¿Te cotizo una opción?`;
  }

  const vence = textoVencimiento(vehiculo).toLowerCase();

  return `Hola, soy tu agente de seguros en Nitro Sync. El seguro de ${aseguradora} de tu ${nombre}${placa} ${vence}. ¿Quieres que te ayude a renovarlo?`;
}

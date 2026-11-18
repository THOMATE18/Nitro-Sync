/*
=======================================================
NITRO SYNC - CONTACTO (TELÉFONO Y WHATSAPP)
=======================================================

CONSTRUCTOR ÚNICO de enlaces de WhatsApp para toda la
app. Antes había dos lógicas distintas (una en
`utils/contacto.ts` y otra en `services/whatsapp.ts`), lo
que producía enlaces distintos según la pantalla. Ahora
TODO pasa por `enlaceWhatsApp()`.

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

import { nombreAseguradora, textoVencimiento } from '@/utils/admin';

import type { Vehiculo } from '@/types/models';

export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

export function esCelularValido(texto: string): boolean {
  const digitos = soloDigitos(texto);

  return (
    (digitos.length === 10 && digitos.startsWith('3')) ||
    (digitos.length === 12 && digitos.startsWith('573'))
  );
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

  if (destino.length < 8) return null;

  return `https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`;
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

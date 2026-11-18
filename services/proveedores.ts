/*
=======================================================
NITRO SYNC - PROVEEDORES SIMULADOS (PAGOS Y MENSAJES)
=======================================================

Toda la Fase 7 pasa por DOS interfaces:

  ProveedorPagos     -> registrar un cobro SIN cobrar nada.
  ProveedorMensajes  -> preparar un enlace wa.me SIN API externa.

La implementación entregada es SIMULADA. No hay pasarela,
no hay Meta Cloud API, no hay credenciales y no se hace
ninguna llamada de red de pago. Cada resultado lleva
`simulado: true` y la interfaz expone `etiqueta = 'Simulado'`
para que la UI lo muestre siempre que aparezca un pago.

Más adelante se puede cambiar `proveedorPagos` por una
implementación real SIN tocar pantallas ni servicios: basta
con respetar la interfaz.
=======================================================
*/

import { abrirWhatsapp } from '@/services/whatsapp';
import { ETIQUETA_SIMULADO } from '@/types/negocio';
import { enlaceWhatsApp } from '@/utils/contacto';

/* -------------------------------------------------------
   PAGOS
----------------------------------------------- */

export interface SolicitudPago {
  /** Identificador del documento que origina el pago. */
  referencia: string;
  montoCop: number;
  descripcion: string;
}

export interface ResultadoPago {
  exito: boolean;
  referencia: string;
  simulado: true;
  mensaje: string;
  procesadoEn: number;
}

export interface ProveedorPagos {
  readonly nombre: string;
  readonly etiqueta: string;
  readonly simulado: true;
  cobrar(solicitud: SolicitudPago): Promise<ResultadoPago>;
}

export class ProveedorPagosSimulado implements ProveedorPagos {
  readonly nombre = 'Cobros simulados Nitro Sync';
  readonly etiqueta = ETIQUETA_SIMULADO;
  readonly simulado = true as const;

  async cobrar(solicitud: SolicitudPago): Promise<ResultadoPago> {
    /*
    No se contacta a ningún banco ni pasarela: solo se
    devuelve una referencia con prefijo SIM- para que quede
    claro en el documento y en la auditoría.
    */
    return {
      exito: true,
      referencia: `SIM-${solicitud.referencia}`,
      simulado: true,
      mensaje: `Pago simulado por ${solicitud.montoCop} COP registrado. No se realizó ningún cobro real.`,
      procesadoEn: Date.now(),
    };
  }
}

/* -------------------------------------------------------
   MENSAJES (WA.ME)
----------------------------------------------- */

export interface SolicitudMensaje {
  destino: string | null;
  mensaje: string;
  referencia: string;
}

export interface ResultadoMensaje {
  exito: boolean;
  enlace: string | null;
  estado: 'manual' | 'omitido';
  motivo: string | null;
  simulado: true;
  mensaje: string;
}

export interface ProveedorMensajes {
  readonly nombre: string;
  readonly etiqueta: string;
  readonly simulado: true;
  preparar(solicitud: SolicitudMensaje): Promise<ResultadoMensaje>;
  abrir(enlace: string): Promise<boolean>;
}

export class ProveedorMensajesSimulado implements ProveedorMensajes {
  readonly nombre = 'Mensajes simulados Nitro Sync (wa.me)';
  readonly etiqueta = ETIQUETA_SIMULADO;
  readonly simulado = true as const;

  async preparar(solicitud: SolicitudMensaje): Promise<ResultadoMensaje> {
    const enlace = enlaceWhatsApp(solicitud.destino, solicitud.mensaje);

    if (!enlace) {
      return {
        exito: false,
        enlace: null,
        estado: 'omitido',
        motivo: 'sin_telefono',
        simulado: true,
        mensaje: 'El propietario no tiene un teléfono válido; no se preparó ningún mensaje.',
      };
    }

    return {
      exito: true,
      enlace,
      estado: 'manual',
      motivo: null,
      simulado: true,
      mensaje: 'Enlace wa.me preparado. El agente debe enviar el mensaje desde su WhatsApp.',
    };
  }

  async abrir(enlace: string): Promise<boolean> {
    return abrirWhatsapp(enlace);
  }
}

/* -------------------------------------------------------
   INSTANCIAS ÚNICAS
----------------------------------------------- */

export const proveedorPagos: ProveedorPagos = new ProveedorPagosSimulado();
export const proveedorMensajes: ProveedorMensajes = new ProveedorMensajesSimulado();

/** Texto listo para badges y avisos de la UI. */
export function textoSimulado(): string {
  return `${ETIQUETA_SIMULADO} · sin cobro real`;
}

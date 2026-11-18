/*
=======================================================
NITRO SYNC - PROVEEDOR DE CORREO (MOCK)
=======================================================

La app NO tiene credenciales de un proveedor de correo
(SendGrid, Resend, Amazon SES...). Para no bloquear la
función de avisos de renovación:

  1. Se redacta el correo (asunto + cuerpo).
  2. Se "envía" con un PROVEEDOR MOCK que NO entrega nada:
     solo valida la dirección y devuelve un identificador
     de prueba.
  3. El aviso queda registrado en `notificationLogs` con
     estado `manual` y motivo `mock_sin_credenciales`, de
     modo que la app NUNCA afirma que el correo se entregó.

Cuando existan credenciales reales, basta con implementar
la interfaz `ProveedorCorreo` y sustituir
`proveedorCorreoActivo`; el resto del flujo no cambia.
=======================================================
*/

export interface MensajeCorreo {
  para: string;
  asunto: string;
  cuerpo: string;
}

export interface ResultadoCorreo {
  /** true si el proveedor aceptó el mensaje (el mock también). */
  aceptado: boolean;
  /** Nombre del proveedor usado. */
  proveedor: string;
  /** Identificador devuelto por el proveedor. */
  idMensaje: string | null;
  /** Motivo cuando no se pudo enviar o cuando es un mock. */
  motivo: string | null;
}

export interface ProveedorCorreo {
  nombre: string;
  enviar(mensaje: MensajeCorreo): Promise<ResultadoCorreo>;
}

/** Validación mínima de una dirección de correo. */
export function correoValido(
  correo: string | null | undefined
): correo is string {
  return !!correo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim());
}

/*
Proveedor MOCK: no entrega correos. Devuelve `motivo:
'mock_sin_credenciales'` para que el llamador registre el
aviso como `manual` y no como `enviado`.
*/
const proveedorMock: ProveedorCorreo = {
  nombre: 'mock',

  async enviar(mensaje) {
    if (!correoValido(mensaje.para)) {
      return {
        aceptado: false,
        proveedor: 'mock',
        idMensaje: null,
        motivo: 'correo_invalido',
      };
    }

    return {
      aceptado: true,
      proveedor: 'mock',
      idMensaje: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      motivo: 'mock_sin_credenciales',
    };
  },
};

/** Proveedor en uso. Cambiar aquí al integrar uno real. */
export const proveedorCorreoActivo: ProveedorCorreo = proveedorMock;

export function enviarCorreo(mensaje: MensajeCorreo): Promise<ResultadoCorreo> {
  return proveedorCorreoActivo.enviar(mensaje);
}

/* -----------------------------------------------
   PLANTILLA DE RENOVACIÓN
----------------------------------------------- */

export function redactarCorreoRenovacion(variables: {
  propietario?: string;
  aseguradora?: string;
  vehiculo?: string;
  fecha?: string;
}): { asunto: string; cuerpo: string } {
  const nombre = variables.propietario ?? 'estimado cliente';
  const aseguradora = variables.aseguradora ?? 'tu aseguradora';
  const vehiculo = variables.vehiculo ?? 'tu vehículo';
  const fecha = variables.fecha ?? 'pronto';

  return {
    asunto: `${aseguradora}: tu póliza vence el ${fecha}`,
    cuerpo: [
      `Hola ${nombre},`,
      '',
      `Te escribimos de ${aseguradora} para recordarte que la póliza de ${vehiculo} vence el ${fecha}.`,
      'Renueva a tiempo para no quedarte sin cobertura.',
      '',
      'Si deseas la propuesta de renovación, responde a este correo.',
      '',
      `— ${aseguradora}`,
    ].join('\n'),
  };
}

/*
=======================================================
NITRO SYNC - MODELO DE DATOS (FIRESTORE)
=======================================================

ESTRUCTURA EN FIRESTORE

  usuarios/{uid}
  │
  ├── perfil del usuario (documento raíz)
  │
  └── vehiculos/{vehiculoId}
        │
        ├── documentos/{documentoId}     (SOAT, tecnomecánica, seguro...)
        ├── mantenimientos/{mantenimientoId}
        ├── recordatorios/{recordatorioId}
        └── gastos/{gastoId}

Cada usuario solo tiene datos bajo su propio uid, lo que
permite reglas de seguridad simples basadas en
request.auth.uid.

CONVENCIONES DE FECHAS

- Las fechas visibles (expedición, vencimiento, fecha de
  mantenimiento, etc.) se guardan como texto ISO:
  "AAAA-MM-DD". Así se comparan con orden alfabético y no
  necesitan conversiones de Timestamp.

- El estado de un documento NO se guarda: se calcula a
  partir de la fecha de vencimiento con la función
  calcularEstado() de utils/fechas.ts, para que nunca
  quede desactualizado.

=======================================================
*/

/* -------------------------------------------------------
   PERFIL DEL USUARIO
   ------------------------------------------------------- */

export interface Perfil {
  uid: string;
  email: string;
  fechaRegistro: string; // "AAAA-MM-DD"
  telefono?: string;
  /** Nombre del propietario (opcional). Se copia a sus vehículos. */
  nombre?: string;
}

/* -------------------------------------------------------
   VEHÍCULOS
   ------------------------------------------------------- */

export type TipoVehiculo = 'Carro' | 'Moto';

export interface Vehiculo {
  id: string; // id del documento en Firestore
  uid: string; // propietario (dueño del documento)

  nombre: string;
  marca: string;
  modelo: string;
  year: number;
  tipo: TipoVehiculo;
  placa: string;
  color: string;
  kilometraje: number;
  imagen: string;
  fechaRegistro: string; // "AAAA-MM-DD"

  /*
  Documento de identidad del propietario (solo números).
  Se pide al registrar el vehículo para poder vincularlo
  después con una aseguradora.
  */
  documentoPropietario?: string;

  /*
  Autorización del propietario para tratar los datos de
  ESTE vehículo (Ley 1581 de 2012). Guarda quién, cuándo
  y qué versión del texto se aceptó. Se exige en el
  formulario de registro antes de poder guardar.
  */
  autorizacionVehiculo?: {
    version: string;
    aceptadoEn: string; // ISO
    aceptadoPor: string; // uid
  };

  /*
  SEGURO DEL VEHÍCULO (opcional).

  Se guardan juntos para no obligar al usuario a crear un
  documento aparte: la aseguradora, su teléfono de atención,
  el número de póliza y la fecha de vencimiento. El detalle
  del vehículo muestra una tarjeta con botón de llamada.
  */
  aseguradora?: string;
  telefonoAseguradora?: string;
  numeroPoliza?: string;
  vencimientoSeguro?: string; // "AAAA-MM-DD"
  seguroAsignadoPor?: string;
  seguroAsignadoFecha?: string; // "AAAA-MM-DD"

  /*
  Clave normalizada de la aseguradora (ver
  `data/aseguradoras.ts` -> `claveAseguradora`). Es la que
  usa el panel de aseguradora para leer SOLO sus vehículos:

    where('aseguradoraClave', '==', claveDeMiOrganizacion)

  Queda vacía ('') cuando el vehículo no tiene seguro. Se
  recalcula cada vez que se guarda el seguro, así que al
  cambiar de aseguradora deja de ser visible para la anterior
  de inmediato.
  */
  aseguradoraClave?: string;

  /*
  Copia de SOLO nombre y teléfono del propietario, para que su
  aseguradora pueda contactarlo por WhatsApp sin abrir la
  lectura de los perfiles (`usuarios/{uid}`). Se mantiene
  actualizada al guardar el vehículo/seguro.
  */
  contactoPropietario?: {
    nombre: string;
    telefono: string;
  };

  /*
  RACHA DE KILOMETRAJE (estilo Duolingo).

  Premia actualizar el kilometraje día tras día. Son campos
  OPCIONALES: los vehículos que ya existían siguen funcionando
  y la racha empieza a contarse con la primera actualización.

  - rachaActual: días seguidos actualizando (0 = sin racha).
  - mejorRacha: la mejor racha histórica (nunca baja).
  - ultimaRachaFecha: último día que contó ("AAAA-MM-DD").
  - ultimaActualizacionKm: kilometraje de esa actualización.
  */
  rachaActual?: number;
  mejorRacha?: number;
  ultimaRachaFecha?: string;
  ultimaActualizacionKm?: number;
}

export type VehiculoAdmin = Vehiculo & { propietarioUid: string };

/*
Datos necesarios para crear un vehículo:
todo menos el id, que lo genera Firestore.
*/
export type NuevoVehiculo = Omit<Vehiculo, 'id'>;

/* -------------------------------------------------------
   DOCUMENTOS DEL VEHÍCULO
   (SOAT, tecnomecánica, seguro, licencia, otros)
   ------------------------------------------------------- */

export type TipoDocumento =
  | 'SOAT'
  | 'Tecnomecanica'
  | 'Seguro'
  | 'Licencia'
  | 'Otro';

export interface Documento {
  id: string;
  tipo: TipoDocumento;
  numero: string; // número de póliza, soat, etc. (si aplica)
  descripcion: string; // ej: "Seguros SURA", "SOAT 2026"
  expedicion: string; // "AAAA-MM-DD"
  vencimiento: string; // "AAAA-MM-DD"

  /*
  El estado NO se guarda en Firestore: se calcula en
  cada consulta con calcularEstado(vencimiento),
  para que nunca quede desactualizado.
  */
}

/*
Datos necesarios para crear un documento:
todo menos el id, que lo genera Firestore.
*/
export type NuevoDocumento = Omit<Documento, 'id'>;

/* -------------------------------------------------------
   ESTADOS DE DOCUMENTO (conceptuales)
   ------------------------------------------------------- */

export type EstadoDocumento =
  | 'Vigente' // aún tiene tiempo
  | 'Proximo a vencer' // dentro del umbral (30 días)
  | 'Vencido'; // ya venció

/* -------------------------------------------------------
   MANTENIMIENTOS
   ------------------------------------------------------- */

export type TipoMantenimiento =
  | 'Cambio de aceite'
  | 'Filtro de aceite'
  | 'Filtro de aire'
  | 'Frenos'
  | 'Llantas'
  | 'Batería'
  | 'Kit de arrastre'
  | 'Cadena'
  | 'Refrigerante'
  | 'Bujías'
  | 'Mantenimiento general'
  | 'Otro';

/*
Clase de aceite usada en un "Cambio de aceite". Es
OPCIONAL: los mantenimientos que no son cambios de aceite
no lo llevan.
*/
export type TipoAceite = 'Mineral' | 'Semisintético' | 'Sintético';

export interface Mantenimiento {
  id: string;
  tipo: TipoMantenimiento;
  fecha: string; // "AAAA-MM-DD"
  kilometraje: number;
  costo: number;
  descripcion: string;
  taller: string;
  observaciones: string;

  /*
  Campos OPCIONALES del CAMBIO DE ACEITE (los demás
  mantenimientos no los llevan, por eso son opcionales y no
  hace falta migrar nada):

  - tipoAceite: clase de aceite usado ('' si no se eligió).
  - intervaloAceite: cada cuántos km se repite el cambio.
    Se guarda 0 cuando se quiere usar el intervalo por
    defecto del vehículo (Carro 5.000 km / Moto 3.000 km).
  */
  tipoAceite?: TipoAceite | '';
  intervaloAceite?: number;
}

export type NuevoMantenimiento = Omit<Mantenimiento, 'id'>;

/* -------------------------------------------------------
   RECORDATORIOS
   ------------------------------------------------------- */

export type EstadoRecordatorio =
  | 'Pendiente'
  | 'Proximo'
  | 'Vencido'
  | 'Completado';

export interface Recordatorio {
  id: string;
  titulo: string;
  descripcion: string;
  fecha: string; // "AAAA-MM-DD"
  estado: EstadoRecordatorio;
}

export type NuevoRecordatorio = Omit<Recordatorio, 'id'>;

/* -------------------------------------------------------
   GASTOS
   ------------------------------------------------------- */

export type CategoriaGasto =
  | 'Mantenimiento'
  | 'Combustible'
  | 'Repuestos'
  | 'SOAT'
  | 'Seguro'
  | 'Tecnomecanica'
  | 'Lavado'
  | 'Otros';

export interface Gasto {
  id: string;
  fecha: string; // "AAAA-MM-DD"
  categoria: CategoriaGasto;
  descripcion: string;
  valor: number;

  /*
  Campos de los GASTOS MENSUALES automáticos (opcionales:
  los gastos escritos a mano no los llevan).

  - concepto: clave del costo (soat, combustible, ...).
  - mes: mes al que pertenece en formato "AAAA-MM".
  - estado: 'pendiente' (aún no confirmado por el usuario)
            o 'pagado' (confirmado con el visto a la
            derecha en la pantalla del vehículo).
  */
  concepto?: string;
  mes?: string;
  estado?: 'pendiente' | 'pagado';
}

export type NuevoGasto = Omit<Gasto, 'id'>;


export type CaracteristicaFavorita =
  | 'Garaje'
  | 'Documentos'
  | 'Recordatorios'
  | 'Gastos'
  | 'Seguros'
  | 'Carga masiva';

export interface Opinion {
  uid: string;
  email: string;
  calificacion: number;
  facilidad: number;
  diseno: number;
  utilidad: number;
  recomienda: boolean;
  favorita: CaracteristicaFavorita | '';
  comentario: string;
  fecha: string; // "AAAA-MM-DD"
}

export type NuevaOpinion = Omit<Opinion, 'uid' | 'email' | 'fecha'>;

/*
=======================================================
RESEÑAS DE VEHÍCULOS
=======================================================

Además de la encuesta general (una por usuario), cada
propietario puede reseñar SUS vehículos: de 1 a 5
estrellas más un título y un comentario.

- Una reseña por vehículo y propietario: el id es
  determinista (uid_vehiculoId), así que editar la reseña
  no crea documentos nuevos.
- `leida` la controla el administrador desde la bandeja
  de opiniones: marca la reseña como leída o no leída.
  Cuando el propietario la edita vuelve a quedar sin leer.
=======================================================
*/

export interface Resena {
  id: string; // uid_vehiculoId
  uid: string;
  email: string;
  vehiculoId: string;
  vehiculoNombre: string;
  placa: string;
  tipoVehiculo: TipoVehiculo;
  calificacion: number; // 1..5
  titulo: string;
  comentario: string;
  leida: boolean;
  fecha: string; // "AAAA-MM-DD"
  creadaEn: number;
  actualizadaEn: number;
}

export type NuevaResena = Pick<
  Resena,
  | 'vehiculoId'
  | 'vehiculoNombre'
  | 'placa'
  | 'tipoVehiculo'
  | 'calificacion'
  | 'titulo'
  | 'comentario'
>;

/** Id determinista de una reseña: una por vehículo y propietario. */
export function idResena(uid: string, vehiculoId: string): string {
  return `${uid}_${vehiculoId}`;
}


export type TipoSolicitud = 'Cotización' | 'Renovación';

export type EstadoSolicitud = 'Pendiente' | 'Atendida';

export interface Solicitud {
  id: string;
  uid: string;
  email: string;
  vehiculoId: string;
  vehiculoNombre: string;
  placa: string;
  tipoVehiculo: TipoVehiculo;
  tipo: TipoSolicitud;
  aseguradoraPreferida: string;
  telefono: string;
  nota: string;
  estado: EstadoSolicitud;
  fecha: string; // "AAAA-MM-DD"
  creadaEn: number;
  atendidaPor?: string;
  atendidaFecha?: string;
}

export type NuevaSolicitud = Omit<
  Solicitud,
  'id' | 'estado' | 'fecha' | 'creadaEn' | 'atendidaPor' | 'atendidaFecha'
>;

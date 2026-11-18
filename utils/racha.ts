/*
=======================================================
NITRO SYNC - RACHA DE KILOMETRAJE (ESTILO DUOLINGO)
=======================================================

Premia mantener el kilometraje actualizado día tras día.

Reglas:

- Cada día que el propietario actualiza el kilometraje de
  un vehículo cuenta como un día de racha.
- Días seguidos  -> la racha sube.
- Un hueco de más de un día -> la racha se reinicia (pero
  la MEJOR racha se conserva).
- Varias actualizaciones el MISMO día cuentan una sola vez.

Todo el cálculo es PURO (no toca Firestore ni las
notificaciones) para poder probarlo y reutilizarlo en la
pantalla de kilometraje y en el resumen de Inicio.
=======================================================
*/

/** Fechas en formato "AAAA-MM-DD" (convención del proyecto). */

export interface EstadoRacha {
  /** Días seguidos actualizando el kilometraje. */
  rachaActual: number;
  /** Mejor racha histórica (nunca baja). */
  mejorRacha: number;
  /** Último día que contó ("AAAA-MM-DD" o '' si nunca). */
  ultimaRachaFecha: string;
  /** Kilometraje de esa última actualización. */
  ultimaActualizacionKm: number;
}

export interface ResultadoRacha extends EstadoRacha {
  /** La racha subió con esta actualización. */
  subio: boolean;
  /** Se rompió una racha anterior (venía de > 0). */
  seReinicio: boolean;
  /** Ya se había contado hoy; no vuelve a sumar. */
  yaContabaHoy: boolean;
}

export interface DiaRacha {
  fecha: string;
  /** Inicial del día de la semana (D, L, M, M, J, V, S). */
  inicial: string;
  /** El día forma parte de la racha actual. */
  activo: boolean;
  esHoy: boolean;
}

const INICIALES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/* Milisegundos de un día. */
const DIA_MS = 86400000;

/* Convierte "AAAA-MM-DD" a milisegundos UTC (sin zona horaria). */
function aUTC(fechaISO: string): number {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);

  return Date.UTC(anio ?? 1970, (mes ?? 1) - 1, dia ?? 1);
}

/** Días enteros entre dos fechas ISO (positivo si `hasta` es después). */
export function diasEntre(desdeISO: string, hastaISO: string): number {
  return Math.round((aUTC(hastaISO) - aUTC(desdeISO)) / DIA_MS);
}

/** Suma (o resta, con números negativos) días a una fecha ISO. */
export function sumarDias(fechaISO: string, dias: number): string {
  const fecha = new Date(aUTC(fechaISO) + dias * DIA_MS);

  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');

  return `${anio}-${mes}-${dia}`;
}

/** Lee el estado de racha guardado en un vehículo (con valores seguros). */
export function leerRacha(vehiculo: {
  rachaActual?: number;
  mejorRacha?: number;
  ultimaRachaFecha?: string;
  ultimaActualizacionKm?: number;
}): EstadoRacha {
  return {
    rachaActual: Math.max(0, vehiculo.rachaActual ?? 0),
    mejorRacha: Math.max(0, vehiculo.mejorRacha ?? 0),
    ultimaRachaFecha: vehiculo.ultimaRachaFecha ?? '',
    ultimaActualizacionKm: vehiculo.ultimaActualizacionKm ?? 0,
  };
}

/*
=======================================================
CÁLCULO PRINCIPAL
=======================================================

Recibe el estado anterior y la actualización de hoy
(fecha + kilometraje) y devuelve la racha resultante.
=======================================================
*/
export function calcularRacha(
  anterior: Partial<EstadoRacha> | undefined,
  opciones: { fecha: string; kilometraje: number }
): ResultadoRacha {
  const rachaPrevia = Math.max(0, anterior?.rachaActual ?? 0);
  const mejorPrevio = Math.max(0, anterior?.mejorRacha ?? 0);
  const ultimaFecha = anterior?.ultimaRachaFecha ?? '';

  const { fecha, kilometraje } = opciones;

  let rachaActual = rachaPrevia;
  let subio = false;
  let seReinicio = false;
  let yaContabaHoy = false;

  if (!ultimaFecha) {
    /* Primera actualización registrada. */
    rachaActual = 1;
    subio = true;
  } else {
    const diferencia = diasEntre(ultimaFecha, fecha);

    if (diferencia <= 0) {
      /* Misma fecha (o anterior): no vuelve a contar. */
      yaContabaHoy = true;
      rachaActual = Math.max(1, rachaPrevia);
    } else if (diferencia === 1) {
      /* Día siguiente: la racha sube. */
      rachaActual = rachaPrevia + 1;
      subio = true;
    } else {
      /* Pasó más de un día: la racha se reinicia. */
      seReinicio = rachaPrevia > 0;
      rachaActual = 1;
      subio = true;
    }
  }

  return {
    rachaActual,
    mejorRacha: Math.max(mejorPrevio, rachaActual),
    ultimaRachaFecha: fecha,
    ultimaActualizacionKm: kilometraje,
    subio,
    seReinicio,
    yaContabaHoy,
  };
}

/*
=======================================================
RACHA VIGENTE
=======================================================

Devuelve la racha que sigue "viva" a día de hoy:

- Si la última actualización fue HOY o AYER, la racha
  continúa.
- Si pasó más de un día, la racha se considera rota (0),
  aunque `rachaActual` guardado siga teniendo el número
  anterior (se conserva para el historial, pero no se
  muestra como racha activa).
=======================================================
*/
export function rachaVigente(
  estado: Partial<EstadoRacha> | undefined,
  hoy: string
): number {
  const ultima = estado?.ultimaRachaFecha ?? '';
  const racha = Math.max(0, estado?.rachaActual ?? 0);

  if (!ultima) {
    return 0;
  }

  const diferencia = diasEntre(ultima, hoy);

  /* Fecha de hoy o de ayer: sigue viva. */
  if (diferencia >= 0 && diferencia <= 1) {
    return racha;
  }

  /* Fecha futura (reloj adelantado): se respeta el valor. */
  if (diferencia < 0) {
    return racha;
  }

  return 0;
}

/*
=======================================================
CALENDARIO DE LOS ÚLTIMOS 7 DÍAS
=======================================================

Marca como "activos" los días que forman parte de la racha
actual, contando hacia atrás desde la última fecha. Si la
racha ya está rota (pasó más de un día), no se marca ningún
día para no mostrar una racha que ya no existe.
=======================================================
*/
export function calendarioRacha(opciones: {
  rachaActual: number;
  ultimaRachaFecha: string;
  hoy: string;
  dias?: number;
}): DiaRacha[] {
  const { rachaActual, ultimaRachaFecha, hoy } = opciones;
  const total = opciones.dias ?? 7;

  const diasActivos = rachaVigente(
    { rachaActual, ultimaRachaFecha },
    hoy
  );

  const resultado: DiaRacha[] = [];

  for (let i = total - 1; i >= 0; i--) {
    const fecha = sumarDias(hoy, -i);

    const desdeUltima = ultimaRachaFecha
      ? diasEntre(fecha, ultimaRachaFecha)
      : -1;

    const dentro = diasActivos > 0 && desdeUltima >= 0 && desdeUltima < diasActivos;
    const noFuturo = diasEntre(fecha, hoy) >= 0;

    resultado.push({
      fecha,
      inicial: INICIALES[new Date(aUTC(fecha)).getUTCDay()] ?? '·',
      activo: dentro && noFuturo,
      esHoy: fecha === hoy,
    });
  }

  return resultado;
}

/** Texto corto: "1 día" / "5 días". */
export function textoRacha(dias: number): string {
  return `${dias} ${dias === 1 ? 'día' : 'días'}`;
}

/*
=======================================================
NITRO SYNC - REFERENCIA DE PRIMAS SOAT 2026
=======================================================

Tabla editable desde el panel de plataforma. Los valores
iniciales son los entregados para el ejercicio:

  Motos < 100 cc       -> $256.200
  Motos 100 - 200 cc   -> $343.300
  Motos > 200 cc       -> $761.400
  Carros               -> TODO (sin valor cargado)

"TODO" se representa con `valorCop: null`. La UI lo muestra
como "TODO" y NUNCA inventa un número para carros.

Esta tabla es solo ORIENTATIVA: no calcula una prima real ni
sustituye la cotización de la aseguradora.
=======================================================
*/

import type { ReferenciaPrima } from '@/types/negocio';
import type { TipoVehiculo } from '@/types/models';

export const ANIO_REFERENCIA_PRIMAS = 2026;
export const PRODUCTO_REFERENCIA_PRIMAS = 'SOAT';

export const REFERENCIA_PRIMAS_SOAT_2026: ReferenciaPrima[] = [
  {
    id: 'SOAT_2026_MOTO_MENOS_100',
    producto: PRODUCTO_REFERENCIA_PRIMAS,
    anio: ANIO_REFERENCIA_PRIMAS,
    tipoVehiculo: 'Moto',
    rango: 'Menos de 100 cc',
    cilindradaMin: null,
    cilindradaMax: 99,
    valorCop: 256200,
    nota: 'Tarifa de referencia 2026.',
    actualizadaEn: 0,
  },
  {
    id: 'SOAT_2026_MOTO_100_200',
    producto: PRODUCTO_REFERENCIA_PRIMAS,
    anio: ANIO_REFERENCIA_PRIMAS,
    tipoVehiculo: 'Moto',
    rango: '100 a 200 cc',
    cilindradaMin: 100,
    cilindradaMax: 200,
    valorCop: 343300,
    nota: 'Tarifa de referencia 2026.',
    actualizadaEn: 0,
  },
  {
    id: 'SOAT_2026_MOTO_MAS_200',
    producto: PRODUCTO_REFERENCIA_PRIMAS,
    anio: ANIO_REFERENCIA_PRIMAS,
    tipoVehiculo: 'Moto',
    rango: 'Más de 200 cc',
    cilindradaMin: 201,
    cilindradaMax: null,
    valorCop: 761400,
    nota: 'Tarifa de referencia 2026.',
    actualizadaEn: 0,
  },
  {
    id: 'SOAT_2026_CARRO_TODO',
    producto: PRODUCTO_REFERENCIA_PRIMAS,
    anio: ANIO_REFERENCIA_PRIMAS,
    tipoVehiculo: 'Carro',
    rango: 'Todos',
    cilindradaMin: null,
    cilindradaMax: null,
    valorCop: null,
    nota: 'TODO: pendiente de cargar la tarifa de carros.',
    actualizadaEn: 0,
  },
];

/** Etiqueta que se muestra cuando no hay valor cargado. */
export const TEXTO_PRIMA_PENDIENTE = 'TODO';

/**
 * Prima de referencia para una moto según su cilindrada.
 * Devuelve null si la cilindrada no es válida.
 */
export function primaMotoPorCilindrada(cilindrada: number): number | null {
  if (!Number.isFinite(cilindrada) || cilindrada <= 0) return null;

  if (cilindrada < 100) return 256200;
  if (cilindrada <= 200) return 343300;
  return 761400;
}

/**
 * Prima sugerida para el vehículo. Los carros quedan como
 * TODO (null) hasta que se cargue la tarifa oficial.
 */
export function primaSugerida(
  tipo: TipoVehiculo,
  cilindrada?: number | null
): number | null {
  if (tipo !== 'Moto') return null;
  return primaMotoPorCilindrada(Number(cilindrada ?? 0));
}

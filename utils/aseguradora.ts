/*
=======================================================
NITRO SYNC - AYUDAS DEL PANEL DE ASEGURADORA
=======================================================

Filtros y contadores que se calculan SOLO sobre los
vehículos de la aseguradora (los que llegan por
`aseguradoraClave`). Nada se descarga de más.
=======================================================
*/

import { estadoSeguro } from '@/utils/admin';

import type { VehiculoAdmin } from '@/types/models';

export type FiltroVehiculosAseguradora = 'todos' | 'por-renovar' | 'vencidos';

export const FILTROS_VEHICULOS_ASEGURADORA: {
  id: FiltroVehiculosAseguradora;
  etiqueta: string;
}[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'por-renovar', etiqueta: 'Por renovar' },
  { id: 'vencidos', etiqueta: 'Vencidos' },
];

/** Un vehículo "por renovar" está próximo a vencer o ya venció. */
export function estaPorRenovar(vehiculo: VehiculoAdmin): boolean {
  const estado = estadoSeguro(vehiculo);

  return estado === 'Proximo a vencer' || estado === 'Vencido';
}

export function estaVencido(vehiculo: VehiculoAdmin): boolean {
  return estadoSeguro(vehiculo) === 'Vencido';
}

export function filtrarVehiculosAseguradora(
  vehiculos: VehiculoAdmin[],
  filtro: FiltroVehiculosAseguradora
): VehiculoAdmin[] {
  switch (filtro) {
    case 'por-renovar':
      return vehiculos.filter(estaPorRenovar);
    case 'vencidos':
      return vehiculos.filter(estaVencido);
    default:
      return vehiculos;
  }
}

export interface ResumenVehiculosAseguradora {
  total: number;
  vigentes: number;
  porRenovar: number;
  vencidos: number;
}

export function resumirVehiculosAseguradora(
  vehiculos: VehiculoAdmin[]
): ResumenVehiculosAseguradora {
  let vigentes = 0;
  let porRenovar = 0;
  let vencidos = 0;

  vehiculos.forEach((vehiculo) => {
    const estado = estadoSeguro(vehiculo);

    if (estado === 'Vigente') {
      vigentes += 1;
    } else if (estado === 'Vencido') {
      vencidos += 1;
      porRenovar += 1;
    } else if (estado === 'Proximo a vencer') {
      porRenovar += 1;
    }
  });

  return { total: vehiculos.length, vigentes, porRenovar, vencidos };
}

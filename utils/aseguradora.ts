/*
=======================================================
NITRO SYNC - AYUDAS DEL PANEL DE ASEGURADORA
=======================================================

Filtros y contadores que se calculan SOLO sobre los
vehículos de la aseguradora (los que llegan por
`aseguradoraClave`). Nada se descarga de más.

Los filtros (Todos / Vigentes / Por renovar / Vencidos) se
combinan con la búsqueda por placa, marca, modelo, nombre,
póliza o aseguradora.
=======================================================
*/

import { estadoSeguro, nombreAseguradora } from '@/utils/admin';

import type { VehiculoAdmin } from '@/types/models';

export type FiltroVehiculosAseguradora =
  | 'todos'
  | 'vigentes'
  | 'por-renovar'
  | 'vencidos';

export const FILTROS_VEHICULOS_ASEGURADORA: {
  id: FiltroVehiculosAseguradora;
  etiqueta: string;
}[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'vigentes', etiqueta: 'Vigentes' },
  { id: 'por-renovar', etiqueta: 'Por renovar' },
  { id: 'vencidos', etiqueta: 'Vencidos' },
];

export function estaVigente(vehiculo: VehiculoAdmin): boolean {
  return estadoSeguro(vehiculo) === 'Vigente';
}

/** Un vehículo "por renovar" está próximo a vencer o ya venció. */
export function estaPorRenovar(vehiculo: VehiculoAdmin): boolean {
  const estado = estadoSeguro(vehiculo);

  return estado === 'Proximo a vencer' || estado === 'Vencido';
}

export function estaVencido(vehiculo: VehiculoAdmin): boolean {
  return estadoSeguro(vehiculo) === 'Vencido';
}

/** ¿El vehículo coincide con el texto de búsqueda? */
export function coincideBusqueda(
  vehiculo: VehiculoAdmin,
  texto: string
): boolean {
  const buscado = texto.trim().toLowerCase();

  if (!buscado) return true;

  return [
    vehiculo.placa,
    vehiculo.marca,
    vehiculo.modelo,
    vehiculo.nombre,
    vehiculo.numeroPoliza,
    nombreAseguradora(vehiculo),
  ]
    .filter(Boolean)
    .some((campo) => String(campo).toLowerCase().includes(buscado));
}

export function filtrarVehiculosAseguradora(
  vehiculos: VehiculoAdmin[],
  filtro: FiltroVehiculosAseguradora,
  busqueda = ''
): VehiculoAdmin[] {
  return vehiculos.filter((vehiculo) => {
    if (!coincideBusqueda(vehiculo, busqueda)) {
      return false;
    }

    switch (filtro) {
      case 'vigentes':
        return estaVigente(vehiculo);
      case 'por-renovar':
        return estaPorRenovar(vehiculo);
      case 'vencidos':
        return estaVencido(vehiculo);
      default:
        return true;
    }
  });
}

/** Contador de cada filtro para mostrarlo en los chips. */
export function contarVehiculosAseguradora(
  vehiculos: VehiculoAdmin[]
): Record<FiltroVehiculosAseguradora, number> {
  return {
    todos: vehiculos.length,
    vigentes: vehiculos.filter(estaVigente).length,
    'por-renovar': vehiculos.filter(estaPorRenovar).length,
    vencidos: vehiculos.filter(estaVencido).length,
  };
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

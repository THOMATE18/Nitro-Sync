/*
=======================================================
NITRO SYNC - MEMBRESÍA DE LA ASEGURADORA ACTIVA
=======================================================

Expone en un solo lugar el estado efectivo de la suscripción
de la organización de la aseguradora.

Con el bloqueo por membresía activo, solo una suscripción
`active` y no vencida permite operar. El hook se usa en el
panel de la aseguradora para mostrar un aviso limpio cuando
la membresía no está vigente, en lugar de errores de permisos.
=======================================================
*/

import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { suscribirSuscripcionOrg } from '@/services/facturacion';
import {
  estadoEfectivoSuscripcion,
  type EstadoSuscripcion,
  type Suscripcion,
} from '@/types/negocio';

export interface MembresiaAseguradora {
  /** true solo si la suscripción está activa y no vencida. */
  activa: boolean;
  /** Mientras se lee el documento (evita mostrar el aviso antes de tiempo). */
  cargando: boolean;
  suscripcion: Suscripcion | null;
  estado: EstadoSuscripcion | null;
}

export function useMembresiaAseguradora(): MembresiaAseguradora {
  const { orgId } = useAuth();

  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setSuscripcion(null);
      setCargando(false);
      return;
    }

    setCargando(true);
    const parar = suscribirSuscripcionOrg(orgId, (datos) => {
      setSuscripcion(datos);
      setCargando(false);
    });

    return parar;
  }, [orgId]);

  const estado = suscripcion ? estadoEfectivoSuscripcion(suscripcion) : null;

  return {
    activa: estado === 'active',
    cargando,
    suscripcion,
    estado,
  };
}

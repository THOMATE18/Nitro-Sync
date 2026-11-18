/*
=======================================================
NITRO SYNC - LÍNEA DE ATENCIÓN (HOOK ÚNICO)
=======================================================

Lee el número oficial de la aseguradora directamente de
`organizations/{orgId}` en Firestore, en tiempo real. Cuando
la aseguradora cambia su número desde su panel, TODAS las
pantallas de sus clientes se actualizan solas.

La clave normalizada (`aseguradoraClave`) permite encontrarlo
sin conocer el id del documento. Como respaldo se acepta el
id de organización directamente.
*/

import { useEffect, useState } from 'react';

import { buscarAseguradora } from '@/data/aseguradoras';
import {
  suscribirOrganizacion,
  suscribirOrganizacionPorClave,
} from '@/services/organizaciones';
import { lineaAtencion as resolverLinea } from '@/utils/contacto';

import type { Organizacion } from '@/types/negocio';

export interface LineaAtencion {
  /** Número canónico que debe mostrar la UI y usar wa.me. */
  telefono: string | null;
  organizacion: Organizacion | null;
  cargando: boolean;
}

/**
 * @param clave clave normalizada de la aseguradora (p. ej. `sura`)
 * @param orgId id del documento organizations (opcional, alternativa)
 */
export function useLineaAtencion(
  clave: string | null,
  orgId: string | null = null
): LineaAtencion {
  const [organizacion, setOrganizacion] = useState<Organizacion | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);

    /* Se prefiere el id exacto cuando está disponible. */
    if (orgId) {
      return suscribirOrganizacion(
        orgId,
        (org) => {
          setOrganizacion(org);
          setCargando(false);
        },
        () => setCargando(false)
      );
    }

    if (!clave) {
      setOrganizacion(null);
      setCargando(false);
      return;
    }

    return suscribirOrganizacionPorClave(
      clave,
      (org) => {
        setOrganizacion(org);
        setCargando(false);
      },
      () => setCargando(false)
    );
  }, [clave, orgId]);

  return {
    telefono: resolverLinea(organizacion, buscarAseguradora(clave ?? '')?.telefono),
    organizacion,
    cargando,
  };
}

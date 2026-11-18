import { useEffect, useState } from 'react';

import { suscribirCotizacionesAseguradora } from '@/services/cotizaciones';

/**
 * Cuenta las cotizaciones NUEVAS de la aseguradora activa para
 * el globo (badge) de la pestaña. Solo lee las suyas.
 */
export function useCotizacionesNuevas(clave: string): number {
  const [nuevas, setNuevas] = useState(0);

  useEffect(() => {
    if (!clave) {
      return;
    }

    return suscribirCotizacionesAseguradora(
      clave,
      (lista) => setNuevas(lista.filter((c) => c.estado === 'nueva').length),
      () => setNuevas(0)
    );
  }, [clave]);

  return clave ? nuevas : 0;
}

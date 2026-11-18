/*
=======================================================
NITRO SYNC - TEMA CLARO / OSCURO
=======================================================

La aplicación respeta la apariencia del sistema
(`useColorScheme`) y además permite forzar un tema desde
Ajustes.

Modos:

  'auto'   -> sigue al sistema (claro u oscuro)
  'claro'  -> siempre claro
  'oscuro' -> siempre oscuro

La elección se guarda en AsyncStorage (clave
`nitro.tema`) para conservarla entre sesiones y en web se
respalda en localStorage a través del mismo paquete.

Uso en pantallas:

  const styles = useEstilos(crearEstilos);

Donde `crearEstilos` es una fábrica definida a nivel de
módulo:

  const crearEstilos = (Paleta: TipoPaleta) =>
    StyleSheet.create({ ... });

Así los estilos se recalculan cuando cambia el tema sin
romper el estilo estático de `StyleSheet.create`.
=======================================================
*/

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  Paleta as PaletaClara,
  PaletaOscura,
  type TipoPaleta,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/* Preferencia guardada por el usuario. */
export type ModoTema = 'auto' | 'claro' | 'oscuro';

/* Esquema efectivo tras resolver 'auto'. */
export type EsquemaTema = 'claro' | 'oscuro';

const CLAVE_TEMA = 'nitro.tema';

type ValorTema = {
  /** Preferencia elegida por el usuario. */
  modo: ModoTema;
  /** Esquema realmente aplicado (nunca 'auto'). */
  esquema: EsquemaTema;
  /** Paleta de colores vigente. */
  paleta: TipoPaleta;
  /** Atajo: true cuando el esquema es oscuro. */
  esOscuro: boolean;
  /** Cambia y guarda la preferencia. */
  definirModo: (modo: ModoTema) => void;
};

const TemaContext = createContext<ValorTema | null>(null);

function esModoValido(valor: string | null): valor is ModoTema {
  return valor === 'auto' || valor === 'claro' || valor === 'oscuro';
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const sistema = useColorScheme();
  const [modo, setModo] = useState<ModoTema>('auto');

  /*
  Se lee la preferencia guardada. El setState ocurre dentro
  de un callback asíncrono (no síncrono en el efecto).
  */
  useEffect(() => {
    let activo = true;

    AsyncStorage.getItem(CLAVE_TEMA)
      .then((guardado) => {
        if (activo && esModoValido(guardado)) {
          setModo(guardado);
        }
      })
      .catch(() => {
        /* Si falla la lectura se conserva el modo automático. */
      });

    return () => {
      activo = false;
    };
  }, []);

  const definirModo = useCallback((nuevo: ModoTema) => {
    setModo(nuevo);
    AsyncStorage.setItem(CLAVE_TEMA, nuevo).catch(() => {
      /* La preferencia no se pudo guardar; se mantiene en memoria. */
    });
  }, []);

  const valor = useMemo<ValorTema>(() => {
    const esquema: EsquemaTema =
      modo === 'auto' ? (sistema === 'dark' ? 'oscuro' : 'claro') : modo;

    return {
      modo,
      esquema,
      paleta: esquema === 'oscuro' ? PaletaOscura : PaletaClara,
      esOscuro: esquema === 'oscuro',
      definirModo,
    };
  }, [modo, sistema, definirModo]);

  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}

export function useTema(): ValorTema {
  const valor = useContext(TemaContext);

  if (!valor) {
    throw new Error('useTema debe usarse dentro de <TemaProvider>.');
  }

  return valor;
}

/**
 * Devuelve los estilos de una pantalla recalculados según el
 * tema vigente. La fábrica debe definirse a nivel de módulo
 * para que su referencia sea estable entre renders.
 */
export function useEstilos<T>(fabrica: (paleta: TipoPaleta) => T): T {
  const { paleta } = useTema();
  return useMemo(() => fabrica(paleta), [fabrica, paleta]);
}

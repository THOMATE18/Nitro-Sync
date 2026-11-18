/*
=======================================================
NITRO SYNC - CONTEXTO DE VEHÍCULOS
=======================================================

Este contexto mantiene los vehículos del usuario
autenticado en tiempo real mediante Firestore.

Permite:

- Escuchar los vehículos con onSnapshot().
- Limpiar el listener al desmontar o al cerrar sesión.
- Crear, editar y eliminar vehículos.
- Consultar un vehículo por su id.
- Crear automáticamente el perfil del usuario.
- Mostrar errores claros (reglas / base de datos).

FLUJO:

 Firestore
    ↓ onSnapshot
 Estado de React (VehiculosProvider)
    ↓ useVehiculos()
 Interfaz (Inicio, Explorar, Detalle)

=======================================================
*/

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useAuth } from './AuthContext';

import { completarClavesVehiculos } from '@/services/admin';
import { crearPerfil } from '@/services/perfil';
import {
  actualizarVehiculo as actualizarVehiculoFirestore,
  crearVehiculo as crearVehiculoFirestore,
  eliminarVehiculoConDatos,
  suscribirVehiculos,
} from '@/services/vehiculos';

import { cancelarNotificacionesVehiculo } from '@/services/notificationService';

import type { Vehiculo } from '@/types/models';

import { describirErrorFirestore } from '@/utils/errorFirestore';

/*
=======================================================
TIPOS
=======================================================

DatosVehiculo: todo lo que se ingresa en el formulario.
(Falta el id, que genera Firestore, y el uid, que
agrega este contexto desde la sesión.)

=======================================================
*/

export type DatosVehiculo = Omit<Vehiculo, 'id' | 'uid'>;

interface VehiculosContextType {
  vehiculos: Vehiculo[];
  cargando: boolean;
  error: string | null;

  crear: (datos: DatosVehiculo) => Promise<string>;
  actualizar: (
    vehiculoId: string,
    cambios: Partial<DatosVehiculo>
  ) => Promise<void>;
  eliminar: (vehiculoId: string) => Promise<void>;
  obtenerVehiculo: (vehiculoId: string) => Vehiculo | undefined;
}

const VehiculosContext = createContext<VehiculosContextType>({
  vehiculos: [],
  cargando: true,
  error: null,
  crear: async () => '',
  actualizar: async () => {},
  eliminar: async () => {},
  obtenerVehiculo: () => undefined,
});

/*
=======================================================
PROVEEDOR
=======================================================
*/

export function VehiculosProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: cargandoAuth } = useAuth();

  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
  Autorreparación del propietario: una vez por sesión se
  completan `aseguradoraClave` y `contactoPropietario` de sus
  vehículos. Es idempotente y no bloquea la interfaz.
  */
  const reparadoRef = useRef<string | null>(null);

  /*
  ======================================================
  SUSCRIPCIÓN EN TIEMPO REAL
  ======================================================

  Se suscribe cuando existe sesión y se limpia cuando:

  - El componente se desmonta.
  - El usuario cierra sesión.
  ======================================================
  */

  useEffect(() => {
    if (cargandoAuth) {
      return;
    }

    if (!user) {
      setVehiculos([]);
      setError(null);
      setCargando(false);
      return;
    }

    setCargando(true);

    /*
    Crea el perfil del usuario de forma idempotente.
    Si falla no bloquea la aplicación (solo Firestore
    vehículos es lo esencial).
    */

    crearPerfil(user.uid, user.email ?? '').catch(() => {});

    const limpiar = suscribirVehiculos(
      user.uid,
      (lista) => {
        setVehiculos(lista);
        setError(null);
        setCargando(false);
      },
      (err) => {
        setError(describirErrorFirestore(err));
        setCargando(false);
      }
    );

    return limpiar;
  }, [user, cargandoAuth]);

  /*
  ======================================================
  AUTORREPARACIÓN DE CLAVES (UNA VEZ POR SESIÓN)
  ======================================================

  Cuando los vehículos ya están cargados se completa, en
  segundo plano, la clave de aseguradora y el contacto del
  propietario que falten. No bloquea la interfaz y no repite
  el trabajo en cada cambio: la marca `reparadoRef` lo limita
  a una vez por usuario.
  ======================================================
  */

  useEffect(() => {
    if (cargandoAuth || !user || cargando) {
      return;
    }

    if (reparadoRef.current === user.uid) {
      return;
    }

    reparadoRef.current = user.uid;

    completarClavesVehiculos(user.uid, vehiculos)
      .then((actualizados) => {
        if (actualizados > 0) {
          console.log(
            `Claves de seguro puestas al día: ${actualizados} vehículo(s).`
          );
        }
      })
      .catch((err: unknown) => {
        const mensaje = err instanceof Error ? err.message : err;
        console.warn('No se pudieron poner al día las claves de seguro:', mensaje);
      });
  }, [user, cargandoAuth, cargando, vehiculos]);

  /*
  ======================================================
  OPERACIONES CRUD
  ======================================================
  */

  const crear = async (datos: DatosVehiculo): Promise<string> => {
    if (!user) {
      throw new Error('Debes iniciar sesión para registrar un vehículo.');
    }

    return crearVehiculoFirestore(user.uid, {
      ...datos,
      uid: user.uid,
    });
  };

  const actualizar = async (
    vehiculoId: string,
    cambios: Partial<DatosVehiculo>
  ): Promise<void> => {
    if (!user) {
      throw new Error('Debes iniciar sesión para editar un vehículo.');
    }

    await actualizarVehiculoFirestore(user.uid, vehiculoId, cambios);
  };

  const eliminar = async (vehiculoId: string): Promise<void> => {
    if (!user) {
      throw new Error('Debes iniciar sesión para eliminar un vehículo.');
    }

    /*
    Elimina el vehículo Y sus subcolecciones (documentos,
    mantenimientos, recordatorios y gastos) y luego
    cancela las notificaciones locales asociadas.
    */

    await eliminarVehiculoConDatos(user.uid, vehiculoId);
    await cancelarNotificacionesVehiculo(vehiculoId);
  };

  const obtenerVehiculo = (vehiculoId: string): Vehiculo | undefined =>
    vehiculos.find((vehiculo) => vehiculo.id === vehiculoId);

  /*
  ======================================================
  PROVEER INFORMACIÓN
  ======================================================
  */

  return (
    <VehiculosContext.Provider
      value={{
        vehiculos,
        cargando,
        error,
        crear,
        actualizar,
        eliminar,
        obtenerVehiculo,
      }}
    >
      {children}
    </VehiculosContext.Provider>
  );
}

/*
=======================================================
HOOK
=======================================================

  const { vehiculos, cargando, error } = useVehiculos();

=======================================================
*/

export function useVehiculos() {
  return useContext(VehiculosContext);
}

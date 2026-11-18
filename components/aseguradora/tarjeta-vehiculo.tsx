/*
=======================================================
NITRO SYNC - TARJETA DE VEHÍCULO (ASEGURADORA)
=======================================================

Tarjeta reutilizable que muestra SOLO los datos que la
aseguradora puede ver de sus vehículos:

  foto, placa, marca, modelo, año, tipo, estado del seguro,
  fecha de vencimiento, días para el vencimiento y el nombre
  y teléfono del propietario.

No muestra gastos, mantenimientos, documentos, ubicación ni
correo: esos datos no están disponibles para la aseguradora.

Incluye los botones "Contactar por WhatsApp" y "Llamar"
(misma lógica del panel admin, con el constructor único
`enlaceWhatsApp` / `enlaceLlamada`) y avisa al contenedor
con `onContactar` / `onLlamar` para que registre la acción
en auditoría.
=======================================================
*/

import { useState } from 'react';

import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Radios, Sombras, coloresEstado, type TipoPaleta } from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';
import ImagenVehiculo from '@/components/ui/imagen-vehiculo';
import { estadoSeguro, textoVencimiento, type EstadoSeguro } from '@/utils/admin';
import { enlaceLlamada, enlaceWhatsApp, mensajeContacto } from '@/utils/contacto';

import type { VehiculoAdmin } from '@/types/models';

export function etiquetaEstadoSeguro(estado: EstadoSeguro): string {
  switch (estado) {
    case 'Vigente':
      return 'Vigente';
    case 'Proximo a vencer':
      return 'Próximo a vencer';
    case 'Vencido':
      return 'Vencido';
    case 'Sin fecha':
      return 'Sin fecha';
    default:
      return 'Sin seguro';
  }
}

interface Props {
  vehiculo: VehiculoAdmin;
  /** Se llama al abrir WhatsApp (para auditoría). */
  onContactar?: (vehiculo: VehiculoAdmin) => void;
  /** Se llama al abrir la llamada telefónica (para auditoría). */
  onLlamar?: (vehiculo: VehiculoAdmin) => void;
  /** Se llama al abrir la ficha/detalle (para auditoría). */
  onAbrir?: (vehiculo: VehiculoAdmin) => void;
  /** Se llama al pedir la renovación (para auditoría). */
  onRenovar?: (vehiculo: VehiculoAdmin) => void;
}

export default function TarjetaVehiculoAseguradora({
  vehiculo,
  onContactar,
  onLlamar,
  onAbrir,
  onRenovar,
}: Props) {
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [detalle, setDetalle] = useState(false);

  const estado = estadoSeguro(vehiculo);
  const color =
    estado === 'Vigente' || estado === 'Proximo a vencer' || estado === 'Vencido'
      ? coloresEstado(paleta)[estado]
      : null;

  const contacto = vehiculo.contactoPropietario;
  const telefono = contacto?.telefono ?? '';
  const nombre = contacto?.nombre ?? '';

  const alternarDetalle = () => {
    setDetalle((valor) => !valor);
    onAbrir?.(vehiculo);
  };

  const contactar = () => {
    const enlace = enlaceWhatsApp(telefono, mensajeContacto(vehiculo));

    if (!enlace) return;

    onContactar?.(vehiculo);
    Linking.openURL(enlace);
  };

  const llamar = () => {
    const enlace = enlaceLlamada(telefono);

    if (!enlace) return;

    onLlamar?.(vehiculo);
    Linking.openURL(enlace);
  };

  const renovar = () => {
    onRenovar?.(vehiculo);
  };

  return (
    <View style={styles.tarjeta}>
      <ImagenVehiculo
        uri={vehiculo.imagen}
        tipo={vehiculo.tipo}
        style={styles.foto}
        accessibilityLabel={`Foto de ${vehiculo.marca} ${vehiculo.modelo}`}
      />

      <View style={styles.cuerpo}>
        <View style={styles.cabecera}>
          <View style={styles.placaCaja}>
            <Text style={styles.placa}>{vehiculo.placa || 'S/P'}</Text>
          </View>

          {color ? (
            <View
              style={[
                styles.estadoPill,
                { backgroundColor: color.fondo, borderColor: color.borde },
              ]}
            >
              <Text style={[styles.estadoTexto, { color: color.texto }]}>
                {etiquetaEstadoSeguro(estado)}
              </Text>
            </View>
          ) : (
            <View style={[styles.estadoPill, { borderColor: paleta.borde }]}>
              <Text style={[styles.estadoTexto, { color: paleta.textoSecundario }]}>
                {etiquetaEstadoSeguro(estado)}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.vehiculo} numberOfLines={1}>
          {vehiculo.marca} {vehiculo.modelo}
          {vehiculo.year ? ` · ${vehiculo.year}` : ''}
        </Text>

        <Text style={styles.tipo}>{vehiculo.tipo}</Text>

        {vehiculo.vencimientoSeguro ? (
          <View style={styles.datosFila}>
            <Ionicons name="calendar-outline" size={14} color={paleta.textoSuave} />
            <Text style={styles.datosTexto}>
              Vence {vehiculo.vencimientoSeguro}
              {textoVencimiento(vehiculo)
                ? ` · ${textoVencimiento(vehiculo)}`
                : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.datosFila}>
          <Ionicons name="person-outline" size={14} color={paleta.textoSuave} />
          <Text style={styles.datosTexto} numberOfLines={1}>
            {nombre || 'Propietario sin nombre'}
            {telefono ? ` · ${telefono}` : ''}
          </Text>
        </View>

        {detalle ? (
          <View style={styles.detalle}>
            <View style={styles.datosFila}>
              <Ionicons name="shield-outline" size={14} color={paleta.textoSuave} />
              <Text style={styles.datosTexto}>
                {vehiculo.aseguradora || 'Sin aseguradora'}
              </Text>
            </View>

            <View style={styles.datosFila}>
              <Ionicons
                name="document-text-outline"
                size={14}
                color={paleta.textoSuave}
              />
              <Text style={styles.datosTexto}>
                {vehiculo.numeroPoliza
                  ? `Póliza ${vehiculo.numeroPoliza}`
                  : 'Sin número de póliza'}
              </Text>
            </View>
          </View>
        ) : null}

        <Pressable
          style={styles.detalleBoton}
          onPress={alternarDetalle}
          accessibilityRole="button"
          accessibilityLabel={detalle ? 'Ocultar detalle' : 'Ver detalle'}
        >
          <Text style={styles.detalleTexto}>
            {detalle ? 'Ocultar detalle' : 'Ver detalle'}
          </Text>
          <Ionicons
            name={detalle ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={paleta.primario}
          />
        </Pressable>

        <View style={styles.acciones}>
          <Pressable
            style={[styles.botonAccion, !telefono && styles.botonInactivo]}
            onPress={contactar}
            disabled={!telefono}
            accessibilityRole="button"
            accessibilityLabel="Contactar por WhatsApp"
          >
            <Ionicons name="logo-whatsapp" size={16} color={paleta.primario} />
            <Text style={styles.botonAccionTexto}>WhatsApp</Text>
          </Pressable>

          <Pressable
            style={[styles.botonAccion, !telefono && styles.botonInactivo]}
            onPress={llamar}
            disabled={!telefono}
            accessibilityRole="button"
            accessibilityLabel="Llamar al propietario"
          >
            <Ionicons name="call" size={16} color={paleta.primario} />
            <Text style={styles.botonAccionTexto}>Llamar</Text>
          </Pressable>

          <Pressable
            style={styles.botonAccion}
            onPress={renovar}
            accessibilityRole="button"
            accessibilityLabel="Renovar seguro"
          >
            <Ionicons name="refresh" size={16} color={paleta.primario} />
            <Text style={styles.botonAccionTexto}>Renovar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    tarjeta: {
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.tarjeta,
      borderWidth: 2,
      borderColor: Paleta.bordeDuro,
      overflow: 'hidden',
      ...Sombras.suave,
    },
    foto: { width: '100%', height: 150 },
    cuerpo: { padding: 14, gap: 8 },
    cabecera: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    placaCaja: {
      backgroundColor: Paleta.tinta,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    placa: {
      color: Paleta.acento,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 1,
    },
    estadoPill: {
      borderWidth: 1.5,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    estadoTexto: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
    vehiculo: { fontSize: 15.5, fontWeight: '800', color: Paleta.texto },
    tipo: { fontSize: 12, color: Paleta.textoSecundario, marginTop: -4 },
    datosFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    datosTexto: { fontSize: 12.5, color: Paleta.textoSecundario, flexShrink: 1 },
    detalle: { gap: 6, paddingTop: 2 },
    detalleBoton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
    },
    detalleTexto: { fontSize: 12, fontWeight: '800', color: Paleta.primario },
    acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    botonAccion: {
      flexGrow: 1,
      flexBasis: 92,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: Paleta.primario,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    botonInactivo: { opacity: 0.55 },
    botonAccionTexto: {
      fontSize: 12.5,
      fontWeight: '800',
      color: Paleta.primario,
    },
  });

/*
=======================================================
NITRO SYNC - TARJETA DE RACHA DE KILOMETRAJE
=======================================================

Tarjeta animada (estilo Duolingo) que muestra:

  - La racha actual de días seguidos actualizando el
    kilometraje (con una llama que "late").
  - La mejor racha histórica.
  - Un calendario de los últimos 7 días.

Cuando la racha acaba de subir (`celebrar`) la tarjeta hace
un pequeño rebote para festejarlo.

Se usa tanto en la pantalla de kilometraje como en el
resumen compacto de Inicio.
=======================================================
*/

import { useEffect, useState } from 'react';

import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Radios, sombraDura, type TipoPaleta } from '@/constants/theme';

import { useEstilos, useTema } from '@/context/TemaContext';

import { calendarioRacha, rachaVigente, textoRacha } from '@/utils/racha';

/* En web react-native-web no admite el driver nativo. */
const USAR_NATIVO = Platform.OS !== 'web';

interface TarjetaRachaProps {
  /** Racha guardada en el vehículo (puede estar "rota"). */
  rachaActual: number;
  mejorRacha: number;
  ultimaRachaFecha: string;
  /** Fecha de hoy en formato "AAAA-MM-DD". */
  hoy: string;
  /** La racha acaba de subir: anima la celebración. */
  celebrar?: boolean;
  /** Versión reducida para el resumen de Inicio. */
  compacta?: boolean;
}

export default function TarjetaRacha({
  rachaActual,
  mejorRacha,
  ultimaRachaFecha,
  hoy,
  celebrar = false,
  compacta = false,
}: TarjetaRachaProps) {
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  /*
  Se crean con useState (no useRef) para no leer refs durante
  el render: cada valor se construye una sola vez.
  */
  const [entrada] = useState(() => new Animated.Value(0));
  const [pulso] = useState(() => new Animated.Value(1));
  const [festejo] = useState(() => new Animated.Value(1));

  /* Racha que sigue viva a día de hoy. */
  const vigente = rachaVigente({ rachaActual, ultimaRachaFecha }, hoy);

  const dias = calendarioRacha({ rachaActual, ultimaRachaFecha, hoy });

  /* Entrada suave al montar. */
  useEffect(() => {
    Animated.timing(entrada, {
      toValue: 1,
      duration: 420,
      useNativeDriver: USAR_NATIVO,
    }).start();
  }, [entrada]);

  /* La llama "late" mientras haya racha. */
  useEffect(() => {
    if (vigente <= 0) {
      return;
    }

    const animacion = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, {
          toValue: 1.12,
          duration: 700,
          useNativeDriver: USAR_NATIVO,
        }),
        Animated.timing(pulso, {
          toValue: 1,
          duration: 700,
          useNativeDriver: USAR_NATIVO,
        }),
      ])
    );

    animacion.start();

    return () => animacion.stop();
  }, [vigente, pulso]);

  /* Rebote de celebración cuando la racha sube. */
  useEffect(() => {
    if (!celebrar) {
      return;
    }

    Animated.sequence([
      Animated.spring(festejo, {
        toValue: 1.12,
        friction: 3,
        tension: 120,
        useNativeDriver: USAR_NATIVO,
      }),
      Animated.spring(festejo, {
        toValue: 1,
        friction: 4,
        tension: 90,
        useNativeDriver: USAR_NATIVO,
      }),
    ]).start();
  }, [celebrar, festejo]);

  const mensaje =
    vigente <= 0
      ? 'Actualiza hoy tu kilometraje para empezar (o retomar) la racha.'
      : vigente === 1
        ? '¡Buen comienzo! Vuelve mañana para mantener la racha.'
        : '¡Sigue así! Mantén la racha actualizando cada día.';

  /* -------------------------------------------------
     VERSIÓN COMPACTA (Inicio)
     ------------------------------------------------- */

  if (compacta) {
    return (
      <Animated.View
        style={[
          styles.compacta,
          {
            opacity: entrada,
            transform: [{ scale: festejo }],
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: pulso }] }}>
          <View style={styles.compactaIcono}>
            <Ionicons name="flame" size={20} color={paleta.coral} />
          </View>
        </Animated.View>

        <View style={styles.compactaTextos}>
          <Text style={styles.compactaTitulo}>
            {vigente > 0
              ? `Racha de ${textoRacha(vigente)}`
              : 'Sin racha activa'}
          </Text>

          <Text style={styles.compactaDetalle}>
            {vigente > 0
              ? 'Kilometraje al día. ¡No la pierdas!'
              : 'Actualiza el kilometraje para empezar'}
          </Text>
        </View>

        <View style={styles.compactaCalendario}>
          {dias.map((dia) => (
            <View
              key={dia.fecha}
              style={[
                styles.compactaDia,
                dia.activo && styles.compactaDiaActivo,
                dia.esHoy && styles.compactaDiaHoy,
              ]}
            >
              <Text
                style={[
                  styles.compactaDiaTexto,
                  dia.activo && styles.compactaDiaTextoActivo,
                ]}
              >
                {dia.inicial}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>
    );
  }

  /* -------------------------------------------------
     VERSIÓN COMPLETA
     ------------------------------------------------- */

  return (
    <Animated.View
      style={[
        styles.tarjeta,
        {
          opacity: entrada,
          transform: [
            {
              translateY: entrada.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.fila}>
        <Animated.View style={{ transform: [{ scale: pulso }] }}>
          <View style={styles.llama}>
            <Ionicons name="flame" size={30} color={paleta.coral} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.textos, { transform: [{ scale: festejo }] }]}>
          <Text style={styles.titulo}>Racha de kilometraje</Text>

          <Text style={styles.numero}>
            {vigente > 0 ? textoRacha(vigente) : 'Sin racha activa'}
          </Text>

          {mejorRacha > 0 && (
            <Text style={styles.mejor}>
              Mejor racha: {textoRacha(mejorRacha)}
            </Text>
          )}
        </Animated.View>
      </View>

      {/* Calendario de los últimos 7 días */}
      <View style={styles.calendario}>
        {dias.map((dia, indice) => {
          /* Aparición escalonada de cada día. */
          const opacidad = entrada.interpolate({
            inputRange: [0, (indice + 1) / 8, 1],
            outputRange: [0, 1, 1],
            extrapolate: 'clamp',
          });

          const subida = entrada.interpolate({
            inputRange: [0, (indice + 1) / 8, 1],
            outputRange: [8, 0, 0],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={dia.fecha}
              style={[
                styles.dia,
                dia.activo && styles.diaActivo,
                dia.esHoy && styles.diaHoy,
                { opacity: opacidad, transform: [{ translateY: subida }] },
              ]}
            >
              <Text
                style={[
                  styles.diaTexto,
                  dia.activo && styles.diaTextoActivo,
                ]}
              >
                {dia.inicial}
              </Text>

              {dia.activo && (
                <Ionicons
                  name="checkmark"
                  size={12}
                  color={paleta.tinta}
                />
              )}
            </Animated.View>
          );
        })}
      </View>

      <Text style={styles.mensaje}>{mensaje}</Text>
    </Animated.View>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    /* -------------------- Completa -------------------- */

    tarjeta: {
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.tarjeta,
      borderWidth: 2,
      borderColor: Paleta.bordeDuro,
      padding: 16,
      ...sombraDura(4, 4, Paleta.bordeDuro),
    },

    fila: { flexDirection: 'row', alignItems: 'center', gap: 14 },

    llama: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: Paleta.coralClaro,
      borderWidth: 2,
      borderColor: Paleta.coral,
      alignItems: 'center',
      justifyContent: 'center',
    },

    textos: { flex: 1 },
    titulo: { fontSize: 14, fontWeight: '800', color: Paleta.textoSecundario },
    numero: {
      fontSize: 26,
      fontWeight: '900',
      color: Paleta.texto,
      marginTop: 2,
    },
    mejor: { fontSize: 12, fontWeight: '700', color: Paleta.textoSuave, marginTop: 2 },

    calendario: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 6,
      marginTop: 16,
    },
    dia: {
      flex: 1,
      height: 46,
      borderRadius: Radios.suave,
      backgroundColor: Paleta.fondoAlterno,
      borderWidth: 1,
      borderColor: Paleta.borde,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    diaActivo: {
      backgroundColor: Paleta.acento,
      borderColor: Paleta.bordeDuro,
    },
    diaHoy: {
      borderColor: Paleta.primario,
      borderWidth: 2,
    },
    diaTexto: { fontSize: 12, fontWeight: '800', color: Paleta.textoSecundario },
    diaTextoActivo: { color: Paleta.tinta },

    mensaje: {
      fontSize: 12,
      color: Paleta.textoSecundario,
      lineHeight: 18,
      marginTop: 14,
    },

    /* -------------------- Compacta -------------------- */

    compacta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.tarjeta,
      borderWidth: 2,
      borderColor: Paleta.bordeDuro,
      padding: 12,
      ...sombraDura(3, 3, Paleta.bordeDuro),
    },
    compactaIcono: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: Paleta.coralClaro,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactaTextos: { flex: 1 },
    compactaTitulo: { fontSize: 14, fontWeight: '900', color: Paleta.texto },
    compactaDetalle: {
      fontSize: 11,
      fontWeight: '700',
      color: Paleta.textoSecundario,
      marginTop: 2,
    },
    compactaCalendario: { flexDirection: 'row', gap: 3 },
    compactaDia: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: Paleta.fondoAlterno,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactaDiaActivo: { backgroundColor: Paleta.acento },
    compactaDiaHoy: { borderWidth: 2, borderColor: Paleta.primario },
    compactaDiaTexto: {
      fontSize: 9,
      fontWeight: '800',
      color: Paleta.textoSecundario,
    },
    compactaDiaTextoActivo: { color: Paleta.tinta },
  });

import { useEffect, useMemo, useState } from 'react';

import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta } from '@/components/ui/confirm-dialog';
import Estrellas from '@/components/ui/estrellas';
import {
  coloresTipo,
  Gradientes,
  Radios,
  sombraDura,
  type TipoPaleta,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import { useVehiculos } from '@/context/VehiculosContext';
import {
  guardarOpinion,
  guardarResena,
  leerMiOpinion,
  suscribirMisResenas,
} from '@/services/opiniones';
import { CARACTERISTICAS } from '@/utils/opiniones';

import type {
  CaracteristicaFavorita,
  Resena,
  Vehiculo,
} from '@/types/models';

function Pregunta({
  titulo,
  valor,
  onChange,
}: {
  titulo: string;
  valor: number;
  onChange: (valor: number) => void;
}) {
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.pregunta}>
      <Text style={styles.preguntaTitulo}>{titulo}</Text>
      <Estrellas valor={valor} onChange={onChange} />
    </View>
  );
}

/*
=======================================================
RESEÑA DE UN VEHÍCULO
=======================================================

Cada vehículo del propietario tiene su propia tarjeta.
Si ya existe una reseña se muestra con estrellas y textos;
al pulsar "Escribir" o "Editar" se abre el formulario y,
al guardar, los campos se limpian.
=======================================================
*/
function ResenaVehiculo({
  vehiculo,
  resena,
}: {
  vehiculo: Vehiculo;
  resena: Resena | undefined;
}) {
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const { user } = useAuth();
  const alerta = useAlerta();

  const [abierto, setAbierto] = useState(false);
  const [calificacion, setCalificacion] = useState(0);
  const [titulo, setTitulo] = useState('');
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);

  const colorTipo = coloresTipo(paleta)[vehiculo.tipo];

  const abrir = () => {
    setCalificacion(resena?.calificacion ?? 0);
    setTitulo(resena?.titulo ?? '');
    setComentario(resena?.comentario ?? '');
    setAbierto(true);
  };

  const limpiar = () => {
    setCalificacion(0);
    setTitulo('');
    setComentario('');
  };

  const enviar = async () => {
    if (!user) {
      return;
    }

    if (!calificacion) {
      await alerta({
        titulo: 'Falta la calificación',
        mensaje: 'Elige de 1 a 5 estrellas para tu vehículo.',
        tipo: 'advertencia',
      });
      return;
    }

    if (!titulo.trim()) {
      await alerta({
        titulo: 'Falta el título',
        mensaje: 'Escribe un título corto para tu reseña.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      await guardarResena(user.uid, user.email ?? '', {
        vehiculoId: vehiculo.id,
        vehiculoNombre: vehiculo.nombre,
        placa: vehiculo.placa,
        tipoVehiculo: vehiculo.tipo,
        calificacion,
        titulo: titulo.trim(),
        comentario: comentario.trim(),
      });

      setAbierto(false);
      limpiar();

      await alerta({
        titulo: resena ? 'Reseña actualizada' : '¡Gracias por tu reseña!',
        mensaje: 'Tu opinión sobre este vehículo quedó registrada.',
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo enviar',
        mensaje: 'Revisa tu conexión e inténtalo de nuevo.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View style={styles.resenaTarjeta}>
      <View style={styles.resenaCabecera}>
        <View style={styles.resenaInfo}>
          <Text style={styles.resenaNombre} numberOfLines={1}>
            {vehiculo.nombre}
          </Text>
          <View
            style={[
              styles.resenaPill,
              { backgroundColor: colorTipo.fondo, borderColor: colorTipo.borde },
            ]}
          >
            <Text style={[styles.resenaPillTexto, { color: colorTipo.texto }]}>
              {vehiculo.tipo} • {vehiculo.placa || 'Sin placa'}
            </Text>
          </View>
        </View>

        {!abierto && (
          <BotonNitro
            titulo={resena ? 'Editar' : 'Escribir'}
            icono={resena ? 'create' : 'star'}
            variante="secundario"
            tamano="pequeno"
            onPress={abrir}
          />
        )}
      </View>

      {abierto ? (
        <View style={styles.resenaForm}>
          <Text style={styles.preguntaTitulo}>Tu calificación</Text>
          <Estrellas valor={calificacion} onChange={setCalificacion} />

          <Text style={styles.preguntaTitulo}>Título</Text>
          <TextInput
            style={styles.input}
            value={titulo}
            onChangeText={setTitulo}
            placeholder="Ej: Excelente para la ciudad"
            placeholderTextColor="#94A3B8"
            maxLength={80}
          />

          <Text style={styles.preguntaTitulo}>Comentario (opcional)</Text>
          <TextInput
            style={[styles.input, styles.comentarioInput]}
            value={comentario}
            onChangeText={setComentario}
            placeholder="Cuéntanos cómo te ha ido con este vehículo"
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={600}
            textAlignVertical="top"
          />

          <BotonNitro
            titulo={resena ? 'Actualizar reseña' : 'Enviar reseña'}
            icono="send"
            tamano="mediano"
            onPress={enviar}
            cargando={guardando}
          />

          <BotonNitro
            titulo="Cancelar"
            variante="fantasma"
            tamano="pequeno"
            onPress={() => {
              setAbierto(false);
              limpiar();
            }}
          />
        </View>
      ) : resena ? (
        <View style={styles.resenaContenido}>
          <View style={styles.resenaFilaEstrellas}>
            <Estrellas valor={resena.calificacion} tamano={18} />
            <Text style={styles.resenaFecha}>{resena.fecha}</Text>
          </View>
          <Text style={styles.resenaTitulo}>{resena.titulo}</Text>
          {resena.comentario ? (
            <Text style={styles.resenaComentario}>{resena.comentario}</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.resenaVacia}>
          <Ionicons name="star-outline" size={18} color={paleta.textoSuave} />
          <Text style={styles.resenaVaciaTexto}>
            Todavía no has reseñado este vehículo.
          </Text>
        </View>
      )}
    </View>
  );
}

export default function OpinionScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const alerta = useAlerta();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const { vehiculos, cargando: cargandoVehiculos } = useVehiculos();

  const [calificacion, setCalificacion] = useState(0);
  const [facilidad, setFacilidad] = useState(0);
  const [diseno, setDiseno] = useState(0);
  const [utilidad, setUtilidad] = useState(0);
  const [recomienda, setRecomienda] = useState<boolean | null>(null);
  const [favorita, setFavorita] = useState<CaracteristicaFavorita | ''>('');
  const [comentario, setComentario] = useState('');
  const [yaRespondio, setYaRespondio] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [resenas, setResenas] = useState<Resena[]>([]);

  useEffect(() => {
    if (!user) {
      return;
    }

    leerMiOpinion(user.uid)
      .then((opinion) => {
        if (!opinion) {
          return;
        }

        setCalificacion(opinion.calificacion);
        setFacilidad(opinion.facilidad);
        setDiseno(opinion.diseno);
        setUtilidad(opinion.utilidad);
        setRecomienda(opinion.recomienda);
        setFavorita(opinion.favorita);
        setComentario(opinion.comentario);
        setYaRespondio(true);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    return suscribirMisResenas(user.uid, setResenas, () => {});
  }, [user]);

  /* Reseñas indexadas por vehículo para pintarlas junto a cada uno. */
  const resenasPorVehiculo = useMemo(() => {
    const mapa = new Map<string, Resena>();

    resenas.forEach((resena) => mapa.set(resena.vehiculoId, resena));

    return mapa;
  }, [resenas]);

  const enviar = async () => {
    if (!user) {
      return;
    }

    if (
      !calificacion ||
      !facilidad ||
      !diseno ||
      !utilidad ||
      recomienda === null
    ) {
      await alerta({
        titulo: 'Encuesta incompleta',
        mensaje:
          'Califica todas las preguntas con estrellas y responde si recomendarías la app.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      await guardarOpinion(user.uid, user.email ?? '', {
        calificacion,
        facilidad,
        diseno,
        utilidad,
        recomienda,
        favorita,
        comentario: comentario.trim(),
      });

      setYaRespondio(true);

      await alerta({
        titulo: '¡Gracias por tu opinión!',
        mensaje: 'Tus respuestas nos ayudan a mejorar Nitro Sync.',
        tipo: 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo enviar',
        mensaje: 'Revisa tu conexión e inténtalo de nuevo.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={Gradientes.marca}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 20 }]}
        >
          <Text style={styles.heroTitulo}>Danos tu opinión</Text>
          <Text style={styles.heroSubtitulo}>
            Responde esta breve encuesta y reseña tus vehículos.
          </Text>
        </LinearGradient>

        <View style={styles.tarjeta}>
          <Pregunta
            titulo="Calificación general de la app"
            valor={calificacion}
            onChange={setCalificacion}
          />
          <Pregunta
            titulo="Facilidad de uso"
            valor={facilidad}
            onChange={setFacilidad}
          />
          <Pregunta
            titulo="Diseño y apariencia"
            valor={diseno}
            onChange={setDiseno}
          />
          <Pregunta
            titulo="Utilidad de documentos, recordatorios y seguros"
            valor={utilidad}
            onChange={setUtilidad}
          />

          <Text style={styles.preguntaTitulo}>¿Recomendarías Nitro Sync?</Text>
          <View style={styles.opciones}>
            {[
              { texto: 'Sí', valor: true, icono: 'thumbs-up' as const },
              { texto: 'No', valor: false, icono: 'thumbs-down' as const },
            ].map((opcion) => {
              const activa = recomienda === opcion.valor;

              return (
                <Pressable
                  key={opcion.texto}
                  onPress={() => setRecomienda(opcion.valor)}
                  style={[styles.opcion, activa && styles.opcionActiva]}
                >
                  <Ionicons
                    name={opcion.icono}
                    size={18}
                    color={activa ? paleta.acento : paleta.textoSecundario}
                  />
                  <Text
                    style={[styles.opcionTexto, activa && styles.opcionTextoActiva]}
                  >
                    {opcion.texto}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.preguntaTitulo}>¿Qué función te gustó más?</Text>
          <View style={styles.chips}>
            {CARACTERISTICAS.map((nombre) => {
              const activa = favorita === nombre;

              return (
                <Pressable
                  key={nombre}
                  onPress={() => setFavorita(activa ? '' : nombre)}
                  style={[styles.chip, activa && styles.chipActivo]}
                >
                  <Text style={[styles.chipTexto, activa && styles.chipTextoActivo]}>
                    {nombre}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.preguntaTitulo}>Comentarios (opcional)</Text>
          <TextInput
            style={styles.comentario}
            value={comentario}
            onChangeText={setComentario}
            placeholder="¿Qué mejorarías o qué te gustaría ver en la app?"
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={500}
            textAlignVertical="top"
          />

          <BotonNitro
            titulo={yaRespondio ? 'Actualizar opinión' : 'Enviar opinión'}
            icono="send"
            onPress={enviar}
            cargando={guardando}
          />
        </View>

        <View style={styles.seccionResenas}>
          <Text style={styles.seccionTitulo}>Reseñas de tus vehículos</Text>
          <Text style={styles.seccionSubtitulo}>
            Califica de 1 a 5 estrellas cada vehículo y cuenta tu experiencia.
          </Text>

          {!cargandoVehiculos && vehiculos.length === 0 && (
            <Text style={styles.resenaVaciaTexto}>
              Registra un vehículo para poder reseñarlo.
            </Text>
          )}

          {vehiculos.map((vehiculo) => (
            <ResenaVehiculo
              key={vehiculo.id}
              vehiculo={vehiculo}
              resena={resenasPorVehiculo.get(vehiculo.id)}
            />
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: Paleta.fondo },
  contenido: { paddingBottom: 40 },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 56,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  heroTitulo: { color: '#FFFFFF', fontSize: 26, fontWeight: '900' },
  heroSubtitulo: { color: 'rgba(255,255,255,0.92)', fontSize: 14, marginTop: 6 },
  tarjeta: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    padding: 18,
    marginHorizontal: 16,
    marginTop: -36,
    gap: 14,
    ...sombraDura(5, 5),
  },
  pregunta: { gap: 8 },
  preguntaTitulo: { fontSize: 14, fontWeight: '800', color: Paleta.texto },
  opciones: { flexDirection: 'row', gap: 10 },
  opcion: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radios.suave,
    borderWidth: 1.5,
    borderColor: Paleta.borde,
    backgroundColor: Paleta.fondo,
  },
  opcionActiva: { backgroundColor: Paleta.tinta, borderColor: Paleta.bordeDuro },
  opcionTexto: { fontSize: 14, fontWeight: '800', color: Paleta.textoSecundario },
  opcionTextoActiva: { color: Paleta.acento },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radios.pastilla,
    backgroundColor: Paleta.fondo,
    borderWidth: 1.5,
    borderColor: Paleta.borde,
  },
  chipActivo: { backgroundColor: Paleta.primario, borderColor: Paleta.bordeDuro },
  chipTexto: { fontSize: 12, fontWeight: '800', color: Paleta.textoSecundario },
  chipTextoActivo: { color: '#FFFFFF' },
  comentario: {
    minHeight: 100,
    backgroundColor: Paleta.fondo,
    borderWidth: 1,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    padding: 14,
    fontSize: 14,
    color: Paleta.texto,
  },
  seccionResenas: {
    marginTop: 22,
    paddingHorizontal: 16,
    gap: 10,
  },
  seccionTitulo: { fontSize: 18, fontWeight: '900', color: Paleta.texto },
  seccionSubtitulo: {
    fontSize: 13,
    color: Paleta.textoSecundario,
    marginTop: -4,
    marginBottom: 4,
  },
  resenaTarjeta: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    padding: 14,
    gap: 10,
    ...sombraDura(3, 3),
  },
  resenaCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  resenaInfo: { flex: 1, gap: 6 },
  resenaNombre: { fontSize: 16, fontWeight: '900', color: Paleta.texto },
  resenaPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radios.pastilla,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  resenaPillTexto: { fontSize: 11, fontWeight: '800' },
  resenaForm: { gap: 10 },
  input: {
    backgroundColor: Paleta.fondo,
    borderWidth: 1,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    color: Paleta.texto,
  },
  comentarioInput: { height: 90, paddingTop: 12 },
  resenaContenido: { gap: 6 },
  resenaFilaEstrellas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resenaFecha: { fontSize: 11, color: Paleta.textoSuave },
  resenaTitulo: { fontSize: 15, fontWeight: '800', color: Paleta.texto },
  resenaComentario: { fontSize: 14, color: Paleta.texto, lineHeight: 20 },
  resenaVacia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  resenaVaciaTexto: { fontSize: 13, color: Paleta.textoSecundario },
});

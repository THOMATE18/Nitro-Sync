import { useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChipsFiltro from '@/components/aseguradora/chips-filtro';
import BotonNitro from '@/components/ui/boton-nitro';
import Buscador from '@/components/ui/buscador';
import { useAlerta } from '@/components/ui/confirm-dialog';
import Estrellas from '@/components/ui/estrellas';
import {
  Gradientes,
  Radios,
  Sombras,
  sombraDura,
  type TipoPaleta,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import {
  marcarResenaLeida,
  suscribirOpiniones,
  suscribirResenas,
} from '@/services/opiniones';
import { describirErrorFirestore } from '@/utils/errorFirestore';
import { resumirOpiniones } from '@/utils/opiniones';

import type { Opinion, Resena } from '@/types/models';

type Seccion = 'encuesta' | 'resenas';
type FiltroEstadoResena = 'todas' | 'sin_leer' | 'leidas';
type FiltroCalificacion = 'todas' | '5' | '4' | '3' | '2' | '1';

function Barra({
  etiqueta,
  proporcion,
  valor,
}: {
  etiqueta: string;
  proporcion: number;
  valor: string;
}) {
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.barraFila}>
      <Text style={styles.barraEtiqueta}>{etiqueta}</Text>
      <View style={styles.barraFondo}>
        <View
          style={[
            styles.barraRelleno,
            { width: `${Math.max(0, Math.min(1, proporcion)) * 100}%` },
          ]}
        />
      </View>
      <Text style={styles.barraValor}>{valor}</Text>
    </View>
  );
}

/* -------------------------------------------------------
   ENCUESTA (resultados agregados)
   ------------------------------------------------------- */

function ResultadosOpiniones() {
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [opiniones, setOpiniones] = useState<Opinion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return suscribirOpiniones(
      (lista) => {
        setOpiniones(lista);
        setError(null);
        setCargando(false);
      },
      (err) => {
        setError(describirErrorFirestore(err));
        setCargando(false);
      }
    );
  }, []);

  const resumen = useMemo(() => resumirOpiniones(opiniones), [opiniones]);

  const recientes = useMemo(
    () => [...opiniones].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [opiniones]
  );

  const maximoFavorita = Math.max(1, ...resumen.favoritas.map((f) => f.cantidad));

  if (cargando) {
    return (
      <ActivityIndicator
        size="large"
        color={paleta.primario}
        style={styles.cargando}
      />
    );
  }

  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }

  if (resumen.total === 0) {
    return <Text style={styles.vacio}>Aún no hay opiniones registradas.</Text>;
  }

  return (
    <>
      <View style={[styles.tarjeta, styles.tarjetaPrincipal]}>
        <Text style={styles.promedio}>{resumen.general.toFixed(1)}</Text>
        <Estrellas valor={resumen.general} tamano={26} />
        <Text style={styles.recomiendan}>
          {resumen.recomiendan}% recomienda la app
        </Text>
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.seccion}>Promedio por criterio</Text>
        <Barra
          etiqueta="Facilidad"
          proporcion={resumen.facilidad / 5}
          valor={resumen.facilidad.toFixed(1)}
        />
        <Barra
          etiqueta="Diseño"
          proporcion={resumen.diseno / 5}
          valor={resumen.diseno.toFixed(1)}
        />
        <Barra
          etiqueta="Utilidad"
          proporcion={resumen.utilidad / 5}
          valor={resumen.utilidad.toFixed(1)}
        />
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.seccion}>Distribución de calificaciones</Text>
        {resumen.distribucion.map((item) => (
          <Barra
            key={item.estrellas}
            etiqueta={`${item.estrellas} ★`}
            proporcion={item.cantidad / resumen.total}
            valor={String(item.cantidad)}
          />
        ))}
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.seccion}>Función favorita</Text>
        {resumen.favoritas.map((item) => (
          <Barra
            key={item.nombre}
            etiqueta={item.nombre}
            proporcion={item.cantidad / maximoFavorita}
            valor={String(item.cantidad)}
          />
        ))}
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.seccion}>Comentarios</Text>
        {recientes.map((opinion) => (
          <View key={opinion.uid} style={styles.comentario}>
            <View style={styles.comentarioCabecera}>
              <Estrellas valor={opinion.calificacion} tamano={16} />
              <Text style={styles.comentarioFecha}>{opinion.fecha}</Text>
            </View>
            <Text style={styles.comentarioCorreo}>{opinion.email}</Text>
            <Text style={styles.comentarioTexto}>
              {opinion.comentario || 'Sin comentario.'}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

/* -------------------------------------------------------
   RESEÑAS (bandeja del administrador)
   ------------------------------------------------------- */

function BandejaResenas({ resenas }: { resenas: Resena[] }) {
  const styles = useEstilos(crearEstilos);
  const alerta = useAlerta();

  const [filtroEstado, setFiltroEstado] =
    useState<FiltroEstadoResena>('todas');
  const [filtroCalificacion, setFiltroCalificacion] =
    useState<FiltroCalificacion>('todas');
  const [busqueda, setBusqueda] = useState('');

  const sinLeer = resenas.filter((r) => !r.leida).length;

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return resenas
      .filter((resena) => {
        if (filtroEstado === 'sin_leer' && resena.leida) {
          return false;
        }

        if (filtroEstado === 'leidas' && !resena.leida) {
          return false;
        }

        if (
          filtroCalificacion !== 'todas' &&
          resena.calificacion !== Number(filtroCalificacion)
        ) {
          return false;
        }

        if (!texto) {
          return true;
        }

        return (
          resena.vehiculoNombre.toLowerCase().includes(texto) ||
          resena.placa.toLowerCase().includes(texto) ||
          resena.email.toLowerCase().includes(texto) ||
          resena.titulo.toLowerCase().includes(texto) ||
          resena.comentario.toLowerCase().includes(texto)
        );
      })
      .sort((a, b) => {
        if (a.leida !== b.leida) {
          return a.leida ? 1 : -1;
        }

        return b.creadaEn - a.creadaEn;
      });
  }, [resenas, filtroEstado, filtroCalificacion, busqueda]);

  const cambiarLeida = async (resena: Resena) => {
    try {
      await marcarResenaLeida(resena.id, !resena.leida);
    } catch {
      await alerta({
        titulo: 'No se pudo actualizar',
        mensaje: 'Revisa tu conexión e inténtalo de nuevo.',
        tipo: 'error',
      });
    }
  };

  return (
    <>
      <View style={styles.filtrosResenas}>
        <Buscador
          valor={busqueda}
          onCambiar={setBusqueda}
          placeholder="Buscar por vehículo, placa o correo"
        />

        <ChipsFiltro<FiltroEstadoResena>
          activo={filtroEstado}
          onCambiar={setFiltroEstado}
          opciones={[
            { id: 'todas', etiqueta: 'Todas', contador: resenas.length },
            { id: 'sin_leer', etiqueta: 'Sin leer', contador: sinLeer },
            {
              id: 'leidas',
              etiqueta: 'Leídas',
              contador: resenas.length - sinLeer,
            },
          ]}
        />

        <ChipsFiltro<FiltroCalificacion>
          activo={filtroCalificacion}
          onCambiar={setFiltroCalificacion}
          opciones={[
            { id: 'todas', etiqueta: 'Todas ★' },
            { id: '5', etiqueta: '5 ★' },
            { id: '4', etiqueta: '4 ★' },
            { id: '3', etiqueta: '3 ★' },
            { id: '2', etiqueta: '2 ★' },
            { id: '1', etiqueta: '1 ★' },
          ]}
        />
      </View>

      {resenas.length === 0 && (
        <Text style={styles.vacio}>Aún no hay reseñas de vehículos.</Text>
      )}

      {resenas.length > 0 && filtradas.length === 0 && (
        <Text style={styles.vacio}>
          Sin resultados. Prueba con otro filtro o cambia la búsqueda.
        </Text>
      )}

      {filtradas.map((resena, indice) => (
        <View
          key={resena.id}
          style={[
            styles.resenaTarjeta,
            indice === 0 && styles.tarjetaPrimera,
            !resena.leida && styles.resenaSinLeer,
          ]}
        >
          <View style={styles.resenaCabecera}>
            <View style={styles.resenaInfo}>
              <Text style={styles.resenaNombre} numberOfLines={1}>
                {resena.vehiculoNombre}
              </Text>
              <Text style={styles.resenaPlaca}>
                {resena.placa || 'Sin placa'} • {resena.tipoVehiculo}
              </Text>
            </View>

            {!resena.leida && (
              <View style={styles.pillNueva}>
                <Text style={styles.pillNuevaTexto}>Sin leer</Text>
              </View>
            )}
          </View>

          <View style={styles.resenaFilaEstrellas}>
            <Estrellas valor={resena.calificacion} tamano={18} />
            <Text style={styles.comentarioFecha}>{resena.fecha}</Text>
          </View>

          <Text style={styles.resenaTitulo}>{resena.titulo}</Text>
          {resena.comentario ? (
            <Text style={styles.comentarioTexto}>{resena.comentario}</Text>
          ) : null}

          <Text style={styles.resenaCorreo}>{resena.email}</Text>

          <View style={styles.resenaBotones}>
            <BotonNitro
              titulo={resena.leida ? 'Marcar sin leer' : 'Marcar leída'}
              icono={resena.leida ? 'mail-unread-outline' : 'checkmark-done'}
              variante={resena.leida ? 'fantasma' : 'secundario'}
              tamano="pequeno"
              onPress={() => cambiarLeida(resena)}
            />
          </View>
        </View>
      ))}
    </>
  );
}

/* -------------------------------------------------------
   PANTALLA
   ------------------------------------------------------- */

function OpinionesAdmin() {
  const insets = useSafeAreaInsets();
  const styles = useEstilos(crearEstilos);

  const [seccion, setSeccion] = useState<Seccion>('resenas');
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [errorResenas, setErrorResenas] = useState<string | null>(null);

  useEffect(() => {
    return suscribirResenas(setResenas, (err) =>
      setErrorResenas(describirErrorFirestore(err))
    );
  }, []);

  const sinLeer = resenas.filter((r) => !r.leida).length;

  return (
    <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido}>
      <LinearGradient
        colors={Gradientes.marca}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 20 }]}
      >
        <Text style={styles.heroEtiqueta}>OPINIONES</Text>
        <Text style={styles.heroTitulo}>Opiniones y reseñas</Text>
        <Text style={styles.heroSubtitulo}>
          {sinLeer > 0
            ? `${sinLeer} ${sinLeer === 1 ? 'reseña sin leer' : 'reseñas sin leer'}`
            : 'Todo al día'}
        </Text>
      </LinearGradient>

      <View style={styles.segmentos}>
        <Pressable
          style={[styles.segmento, seccion === 'resenas' && styles.segmentoActivo]}
          onPress={() => setSeccion('resenas')}
        >
          <Text
            style={[
              styles.segmentoTexto,
              seccion === 'resenas' && styles.segmentoTextoActivo,
            ]}
          >
            Reseñas{resenas.length > 0 ? ` (${resenas.length})` : ''}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.segmento, seccion === 'encuesta' && styles.segmentoActivo]}
          onPress={() => setSeccion('encuesta')}
        >
          <Text
            style={[
              styles.segmentoTexto,
              seccion === 'encuesta' && styles.segmentoTextoActivo,
            ]}
          >
            Encuesta
          </Text>
        </Pressable>
      </View>

      {seccion === 'resenas' && (
        <>
          {errorResenas && <Text style={styles.error}>{errorResenas}</Text>}
          {!errorResenas && <BandejaResenas resenas={resenas} />}
        </>
      )}

      {seccion === 'encuesta' && <ResultadosOpiniones />}
    </ScrollView>
  );
}

export default function OpinionesRoute() {
  const { esAdmin } = useAuth();

  if (!esAdmin) {
    return <Redirect href="/" />;
  }

  return <OpinionesAdmin />;
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
  heroEtiqueta: {
    color: Paleta.acento,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  heroTitulo: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginTop: 4 },
  heroSubtitulo: { color: 'rgba(255,255,255,0.92)', fontSize: 14, marginTop: 4 },
  segmentos: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: -34,
    marginBottom: 6,
  },
  segmento: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: Radios.pastilla,
    backgroundColor: Paleta.tarjeta,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
  },
  segmentoActivo: { backgroundColor: Paleta.tinta },
  segmentoTexto: {
    fontSize: 13,
    fontWeight: '800',
    color: Paleta.textoSecundario,
  },
  segmentoTextoActivo: { color: Paleta.acento },
  cargando: { marginTop: 30 },
  error: {
    margin: 16,
    padding: 12,
    borderRadius: Radios.suave,
    backgroundColor: Paleta.peligroFondo,
    color: Paleta.textoPeligro,
    fontSize: 13,
  },
  vacio: {
    textAlign: 'center',
    color: Paleta.textoSecundario,
    marginTop: 40,
    fontSize: 14,
    paddingHorizontal: 16,
  },
  filtrosResenas: {
    marginHorizontal: 16,
    marginTop: 12,
    gap: 10,
  },
  tarjeta: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    gap: 10,
    ...Sombras.tarjeta,
  },
  tarjetaPrincipal: {
    alignItems: 'center',
    marginTop: -34,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    ...sombraDura(5, 5),
  },
  promedio: { fontSize: 54, fontWeight: '900', color: Paleta.texto },
  recomiendan: { fontSize: 14, fontWeight: '800', color: Paleta.exito },
  seccion: { fontSize: 16, fontWeight: '900', color: Paleta.texto },
  barraFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barraEtiqueta: {
    width: 84,
    fontSize: 12,
    fontWeight: '700',
    color: Paleta.textoSecundario,
  },
  barraFondo: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: Paleta.fondoAlterno,
    overflow: 'hidden',
  },
  barraRelleno: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: Paleta.primario,
  },
  barraValor: {
    width: 32,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '800',
    color: Paleta.texto,
  },
  comentario: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Paleta.borde,
    gap: 4,
  },
  comentarioCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  comentarioFecha: { fontSize: 11, color: Paleta.textoSuave },
  comentarioCorreo: { fontSize: 12, fontWeight: '700', color: Paleta.textoSecundario },
  comentarioTexto: { fontSize: 14, color: Paleta.texto, lineHeight: 20 },
  resenaTarjeta: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 14,
    gap: 8,
    ...sombraDura(4, 4),
  },
  tarjetaPrimera: { marginTop: 16 },
  resenaSinLeer: { borderColor: Paleta.primario },
  resenaCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  resenaInfo: { flex: 1, gap: 2 },
  resenaNombre: { fontSize: 17, fontWeight: '900', color: Paleta.texto },
  resenaPlaca: { fontSize: 12, color: Paleta.textoSecundario },
  resenaFilaEstrellas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resenaTitulo: { fontSize: 15, fontWeight: '800', color: Paleta.texto },
  resenaCorreo: { fontSize: 12, color: Paleta.textoSuave },
  resenaBotones: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  pillNueva: {
    borderRadius: Radios.pastilla,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: Paleta.primarioClaro,
    borderWidth: 1,
    borderColor: Paleta.primario,
  },
  pillNuevaTexto: { fontSize: 11, fontWeight: '800', color: Paleta.primarioOscuro },
});

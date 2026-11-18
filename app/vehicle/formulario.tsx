/*
=======================================================
NITRO SYNC - FORMULARIO DE VEHÍCULO
=======================================================

Sirve para DOS tareas:

  /vehicle/formulario               -> registrar
  /vehicle/formulario?vehiculoId=X  -> editar

Datos guardados en Firestore (subcolección vehiculos):

  nombre, tipo, marca, modelo, year,
  placa, color, kilometraje, imagen,
  fechaRegistro y uid (agrega el contexto).
  Además: documentoPropietario (solo números), el celular
  del propietario (si su perfil no lo tenía) y la
  autorización de tratamiento de datos del vehículo.

El diseño se organiza en tarjetas con secciones:
  1. Información principal
  2. Especificaciones
  3. Identificación y uso
  4. Imagen

VALIDACIONES
  - Placa con formato válido (mayúsculas, 3 letras +
    números) y SIN duplicados en el garaje.
  - Documento del propietario solo numérico.
  - Casilla de autorización OBLIGATORIA: el botón de
    guardar permanece deshabilitado hasta marcarla.

=======================================================
*/

import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
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
import { router, Stack, useLocalSearchParams } from 'expo-router';

import {
  coloresTipo,
  Gradientes,
  Radios,
  Sombras,
  sombraDura,
  type TipoPaleta,
} from '@/constants/theme';

import { ASEGURADORAS, claveAseguradora } from '@/data/aseguradoras';

import BotonNitro from '@/components/ui/boton-nitro';
import ImagenVehiculo from '@/components/ui/imagen-vehiculo';
import SelectorFecha from '@/components/ui/selector-fecha';
import { useAlerta } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import { useVehiculos, type DatosVehiculo } from '@/context/VehiculosContext';
import {
  buscarImagenVehiculo,
  imagenPorDefecto,
} from '@/services/imagenVehiculo';
import { VERSION_AUTORIZACION_DATOS } from '@/services/autorizacionDatos';
import { suscribirPerfil, guardarTelefono } from '@/services/perfil';
import type { Perfil, TipoVehiculo } from '@/types/models';
import { formatoKm, formatoPlaca } from '@/utils/formato';
import { esCelularValido, soloDigitos } from '@/utils/contacto';
import {
  AYUDA_PLACA,
  EJEMPLO_PLACA,
  formatearPlaca,
  esPlacaValida,
  LARGO_PLACA,
  limpiarPlaca,
  progresoPlaca,
} from '@/utils/placa';

/*
=======================================================
AÑO ACTUAL (para validar el campo "Año")
=======================================================
*/

const ANIO_ACTUAL = new Date().getFullYear();

export default function FormularioVehiculoScreen() {
  const { vehiculoId } = useLocalSearchParams<{ vehiculoId?: string }>();

  const { obtenerVehiculo, crear, actualizar, vehiculos } = useVehiculos();

  const { user } = useAuth();

  const alerta = useAlerta();

  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const vehiculoOriginal = vehiculoId
    ? obtenerVehiculo(vehiculoId)
    : undefined;

  const modo: 'crear' | 'editar' = vehiculoId ? 'editar' : 'crear';

  /*
  ======================================================
  ESTADOS DEL FORMULARIO
  ======================================================

  Se inicializan con los datos del vehículo cuando la
  pantalla está en modo edición.
  ======================================================
  */

  const [nombre, setNombre] = useState(vehiculoOriginal?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoVehiculo>(
    vehiculoOriginal?.tipo ?? 'Carro'
  );
  const [marca, setMarca] = useState(vehiculoOriginal?.marca ?? '');
  const [modelo, setModelo] = useState(vehiculoOriginal?.modelo ?? '');
  const [year, setYear] = useState(
    vehiculoOriginal ? String(vehiculoOriginal.year) : ''
  );
  const [placa, setPlaca] = useState(() =>
    vehiculoOriginal
      ? formatearPlaca(vehiculoOriginal.placa, vehiculoOriginal.tipo)
      : ''
  );
  const [color, setColor] = useState(vehiculoOriginal?.color ?? '');
  const [kilometraje, setKilometraje] = useState(
    vehiculoOriginal ? String(vehiculoOriginal.kilometraje) : ''
  );

  /*
  ======================================================
  DOCUMENTO DEL PROPIETARIO

  Solo números (cédula / NIT). Sirve para vincular el
  vehículo con una aseguradora más adelante.
  ======================================================
  */

  const [documentoPropietario, setDocumentoPropietario] = useState(
    vehiculoOriginal?.documentoPropietario ?? ''
  );

  /*
  ======================================================
  AUTORIZACIÓN DE TRATAMIENTO DE DATOS (VEHÍCULO)

  Casilla OBLIGATORIA: el botón de guardar permanece
  deshabilitado hasta marcarla. En edición, si el vehículo
  ya venía autorizado, arranca marcada.
  ======================================================
  */

  const [autorizaDatos, setAutorizaDatos] = useState(
    Boolean(vehiculoOriginal?.autorizacionVehiculo)
  );

  /*
  ======================================================
  SEGURO (opcional)

  Se guarda junto al vehículo para que el detalle muestre
  la aseguradora, la póliza y un botón de llamada directa.
  ======================================================
  */

  const [aseguradora, setAseguradora] = useState(
    vehiculoOriginal?.aseguradora ?? ''
  );

  const [telefonoAseguradora, setTelefonoAseguradora] = useState(
    vehiculoOriginal?.telefonoAseguradora ?? ''
  );

  const [numeroPoliza, setNumeroPoliza] = useState(
    vehiculoOriginal?.numeroPoliza ?? ''
  );

  const [vencimientoSeguro, setVencimientoSeguro] = useState(
    vehiculoOriginal?.vencimientoSeguro ?? ''
  );

  /*
  ======================================================
  CONTACTO DEL PROPIETARIO

  El nombre y el teléfono del propietario se copian al
  documento del vehículo (`contactoPropietario`) para que
  su aseguradora pueda contactarlo por WhatsApp sin leer
  el perfil (`usuarios/{uid}`). El teléfono viene del
  perfil; si el perfil aún no lo tiene, se pide aquí y se
  guarda en el perfil. El nombre se puede escribir aquí
  (opcional).
  ======================================================
  */

  const [perfil, setPerfil] = useState<Perfil | null>(null);

  /*
  Marca cuando llegó el primer dato del perfil. Sirve para
  no pedir el celular mientras el perfil aún está cargando.
  */
  const [perfilListo, setPerfilListo] = useState(false);

  const [nombrePropietario, setNombrePropietario] = useState(
    vehiculoOriginal?.contactoPropietario?.nombre ?? ''
  );

  /*
  Celular del propietario. Solo se pide cuando el perfil NO
  lo tiene; en ese caso se guarda en el perfil y se copia al
  vehículo para que la aseguradora pueda escribir por
  WhatsApp.
  */
  const [telefonoPropietario, setTelefonoPropietario] = useState(
    vehiculoOriginal?.contactoPropietario?.telefono ?? ''
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    const limpiar = suscribirPerfil(user.uid, (datos) => {
      setPerfil(datos);
      setPerfilListo(true);
    });

    return limpiar;
  }, [user]);

  /* Celular ya guardado en el perfil (si existe). */
  const telefonoPerfil = (perfil?.telefono ?? '').trim();

  /* Hay que pedirlo solo cuando el perfil cargó y no lo tiene. */
  const requiereTelefono = perfilListo && !telefonoPerfil;

  /*
  ======================================================
  IMAGEN DEL VEHÍCULO

  Ya NO existe el campo de enlace de la foto: la imagen
  se genera sola a partir de marca + modelo.

  imagenActual guarda la foto que se está mostrando; si el
  vehículo ya existía, arranca con la que tenía guardada.
  ======================================================
  */

  const imagenGuardada = vehiculoOriginal?.imagen ?? '';

  const [imagenActual, setImagenActual] = useState<string | null>(
    imagenGuardada || null
  );

  const [buscandoImagen, setBuscandoImagen] = useState(false);

  const [guardando, setGuardando] = useState(false);

  /*
  ======================================================
  IMAGEN AUTOMÁTICA (marca + modelo)
  ======================================================

  Se busca una foto real del vehículo a partir de la marca
  y el modelo (por ejemplo: "McLaren 720S" -> foto de un
  McLaren). Se espera un poco entre teclas para no lanzar
  una consulta por cada letra.

  También se ejecuta al ABRIR un vehículo ya guardado: así
  una foto equivocada (por ejemplo un McLaren con imagen
  de BMW) se corrige sola. Si la búsqueda no encuentra una
  foto real, se conserva la que el vehículo ya tenía.
  ======================================================
  */

  useEffect(() => {
    if (!marca.trim() && !modelo.trim()) {
      return;
    }

    let activo = true;

    const temporizador = setTimeout(() => {
      if (!activo) {
        return;
      }

      setBuscandoImagen(true);

      buscarImagenVehiculo({
        marca,
        modelo,
        tipo,
        year: Number(year) || ANIO_ACTUAL,
      }).then((url) => {
        if (!activo) {
          return;
        }

        const generica = imagenPorDefecto(tipo);

        /*
        Si la búsqueda solo devolvió la imagen genérica y el
        vehículo ya tenía una foto propia, se conserva la que
        ya estaba (búsqueda fallida o sin internet).
        */
        if (url === generica && imagenGuardada) {
          setImagenActual(imagenGuardada);
        } else {
          setImagenActual(url);
        }

        setBuscandoImagen(false);
      });
    }, 650);

    return () => {
      activo = false;
      clearTimeout(temporizador);
    };
  }, [marca, modelo, tipo, year, imagenGuardada]);

  /*
  El aviso "buscando…" solo se muestra cuando de verdad
  hay datos con los que buscar (así nunca queda encendido
  si el usuario borra la marca o el modelo).
  */
  const mostrandoBusqueda =
    buscandoImagen && (!!marca.trim() || !!modelo.trim());

  /*
  ======================================================
  VEHÍCULO NO ENCONTRADO (modo edición)
  ======================================================
  */

  if (vehiculoId && !vehiculoOriginal) {
    return (
      <View style={styles.avisoContenedor}>
        <Text style={styles.avisoTitulo}>Vehículo no encontrado</Text>

        <Text style={styles.avisoTexto}>
          No se encontró el vehículo solicitado. Vuelve a la lista e
          inténtalo de nuevo.
        </Text>

        <Pressable
          style={styles.avisoBoton}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/explore');
          }}
        >
          <Text style={styles.avisoBotonTexto}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  /*
  ======================================================
  VALIDACIÓN
  ======================================================
  */

  /*
  Placa duplicada: se compara contra los vehículos del
  garaje ignorando el propio vehículo cuando se edita.
  Se deriva en el render (no en un efecto).
  */
  const placaNormalizada = limpiarPlaca(placa);

  const placaDuplicada =
    placaNormalizada.length > 0 &&
    vehiculos.some(
      (item) =>
        item.id !== vehiculoId &&
        limpiarPlaca(item.placa) === placaNormalizada
    );

  const validar = async (): Promise<boolean> => {
    if (!nombre.trim()) {
      await alerta({
        titulo: 'Falta el nombre',
        mensaje: 'Escribe el nombre del vehículo.',
        tipo: 'advertencia',
      });
      return false;
    }

    const anio = Number(year);

    if (
      !year.trim() ||
      Number.isNaN(anio) ||
      anio < 1950 ||
      anio > ANIO_ACTUAL + 1
    ) {
      await alerta({
        titulo: 'Año inválido',
        mensaje: `Escribe un año entre 1950 y ${ANIO_ACTUAL + 1}.`,
        tipo: 'advertencia',
      });
      return false;
    }

    if (!documentoPropietario.trim()) {
      await alerta({
        titulo: 'Falta el documento',
        mensaje: 'Escribe el número de documento del propietario.',
        tipo: 'advertencia',
      });
      return false;
    }

    if (!/^[0-9]+$/.test(documentoPropietario.trim())) {
      await alerta({
        titulo: 'Documento inválido',
        mensaje: 'El documento del propietario solo debe tener números.',
        tipo: 'advertencia',
      });
      return false;
    }

    if (requiereTelefono && !esCelularValido(telefonoPropietario)) {
      await alerta({
        titulo: 'Falta tu celular',
        mensaje:
          'Escribe tu número de celular (10 dígitos y empieza por 3). Lo usamos para que tu aseguradora pueda escribirte por WhatsApp.',
        tipo: 'advertencia',
      });
      return false;
    }

    if (placa.trim() && !esPlacaValida(placa, tipo)) {
      await alerta({
        titulo: 'Placa incompleta',
        mensaje: `La placa de ${
          tipo === 'Carro' ? 'un carro' : 'una moto'
        } debe tener ${AYUDA_PLACA[tipo]}.`,
        tipo: 'advertencia',
      });
      return false;
    }

    if (placa.trim() && placaDuplicada) {
      await alerta({
        titulo: 'Placa repetida',
        mensaje:
          'Ya tienes un vehículo registrado con esa placa. Revisa tu garaje antes de continuar.',
        tipo: 'advertencia',
      });
      return false;
    }

    if (!autorizaDatos) {
      await alerta({
        titulo: 'Autorización requerida',
        mensaje:
          'Debes autorizar el tratamiento de los datos del vehículo para guardarlo.',
        tipo: 'advertencia',
      });
      return false;
    }

    return true;
  };

  /*
  ======================================================
  GUARDAR
  ======================================================
  */

  const guardar = async () => {
    if (!(await validar())) {
      return;
    }

    const kilometrajeNumerico = Number(
      kilometraje.replace(/[^0-9]/g, '') || '0'
    );

    /*
    La foto: la que ya se sugirió automáticamente por
    marca/modelo y, si aún no hay ninguna, se busca ahora.
    Ya no existe enlace escrito a mano.
    */
    const imagenFinal =
      imagenActual ||
      (await buscarImagenVehiculo({
        marca,
        modelo,
        tipo,
        year: Number(year) || ANIO_ACTUAL,
      }));

    /*
    Contacto del propietario: SOLO nombre y teléfono. El
    teléfono viene del perfil; el nombre, del campo opcional
    de este formulario (o del perfil si algún día lo tiene).
    Se omite por completo si no hay ninguno de los dos.
    */
    const contactoNombre = (
      nombrePropietario.trim() ||
      perfil?.nombre?.trim() ||
      ''
    ).trim();

    /*
    Teléfono: el del perfil si ya lo tiene; si no, el que se
    escribió aquí (y que se guardará en el perfil).
    */
    const telefonoIngresado = soloDigitos(telefonoPropietario);
    const contactoTelefono = telefonoPerfil || telefonoIngresado;

    const contactoPropietario =
      contactoNombre || contactoTelefono
        ? { nombre: contactoNombre, telefono: contactoTelefono }
        : undefined;

    const datos: DatosVehiculo = {
      nombre: nombre.trim(),
      tipo,
      marca: marca.trim(),
      modelo: modelo.trim(),
      year: Number(year),
      placa,
      color: color.trim(),
      kilometraje: kilometrajeNumerico,
      imagen: imagenFinal,
      fechaRegistro:
        vehiculoOriginal?.fechaRegistro ??
        new Date().toISOString().slice(0, 10),
      aseguradora: aseguradora.trim(),
      telefonoAseguradora: telefonoAseguradora.trim(),
      numeroPoliza: numeroPoliza.trim(),
      vencimientoSeguro: vencimientoSeguro || '',
      /*
      Clave normalizada de la aseguradora: la usa el panel de
      la aseguradora para leer SOLO sus vehículos. Se recalcula
      en cada guardado, así que al cambiar de aseguradora deja
      de ser visible para la anterior. Vacía si no hay seguro.
      */
      aseguradoraClave: claveAseguradora(aseguradora.trim()),
      contactoPropietario,
      documentoPropietario: documentoPropietario.trim(),
      /*
      Autorización del vehículo: se conserva la evidencia
      original si ya existía; si es la primera vez, se
      registra quién y cuándo con la versión vigente.
      */
      autorizacionVehiculo:
        vehiculoOriginal?.autorizacionVehiculo ??
        (autorizaDatos
          ? {
              version: VERSION_AUTORIZACION_DATOS,
              aceptadoEn: new Date().toISOString(),
              aceptadoPor: user?.uid ?? '',
            }
          : undefined),
    };

    try {
      setGuardando(true);

      /*
      Si el perfil no tenía celular, se guarda el que se
      escribió para no volver a pedirlo en el próximo
      vehículo.
      */
      if (user && !telefonoPerfil && telefonoIngresado) {
        await guardarTelefono(user.uid, telefonoIngresado);
      }

      if (modo === 'editar' && vehiculoId) {
        await actualizar(vehiculoId, datos);
      } else {
        await crear(datos);
      }

      await alerta({
        titulo:
          modo === 'editar' ? 'Vehículo actualizado' : 'Vehículo registrado',
        mensaje:
          modo === 'editar'
            ? 'Los cambios se guardaron correctamente.'
            : 'Tu vehículo quedó guardado en tu garaje.',
        tipo: 'exito',
        textoAceptar: 'Continuar',
      });

      router.back();
    } catch (error: any) {
      await alerta({
        titulo: 'No se pudo guardar',
        mensaje: error?.message ?? 'Ocurrió un error inesperado.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  /*
  ======================================================
  INTERFAZ
  ======================================================
  */

  return (
    <KeyboardAvoidingView
      style={styles.contenedor}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Título dinámico según el modo */}
      <Stack.Screen
        options={{
          title: modo === 'editar' ? 'Editar vehículo' : 'Registrar vehículo',
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={true} persistentScrollbar
        keyboardShouldPersistTaps="handled"
      >
        {/* =================================================
            PORTADA DEL FORMULARIO
            ================================================= */}

        <LinearGradient
          colors={Gradientes.marca}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <Text style={styles.bannerMarca}>
            NITRO <Text style={styles.bannerAcento}>SYNC</Text>
          </Text>

          <Text style={styles.bannerTitulo}>
            {modo === 'editar' ? 'Afina tu vehículo' : 'Suma un vehículo'}
          </Text>

          <Text style={styles.bannerTexto}>
            Estos datos alimentan tu garaje, el seguro y los recordatorios.
          </Text>
        </LinearGradient>

        {/* =================================================
            SECCIÓN 1: INFORMACIÓN PRINCIPAL
            ================================================= */}

        <View style={styles.tarjeta}>
          <Text style={styles.seccionTitulo}>Información principal</Text>

          <Text style={styles.etiqueta}>Nombre *</Text>

          <TextInput
            style={styles.input}
            placeholder="Ej: Mazda 3"
            placeholderTextColor={paleta.textoSuave}
            value={nombre}
            onChangeText={setNombre}
            maxLength={40}
          />

          <Text style={styles.etiqueta}>Tipo de vehículo</Text>

          {/* Selector Carro / Moto */}

          <View style={styles.segmento}>
            {(['Carro', 'Moto'] as TipoVehiculo[]).map((opcion) => {
              const activo = tipo === opcion;

              return (
                <Pressable
                  key={opcion}
                  style={[
                    styles.segmentoOpcion,
                    activo && styles.segmentoActivo,
                  ]}
                  onPress={() => {
                    setTipo(opcion);
                    setPlaca((actual) => formatearPlaca(actual, opcion));
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: activo }}
                >
                  <Text
                    style={[
                      styles.segmentoTexto,
                      activo && styles.segmentoTextoActivo,
                    ]}
                  >
                    {opcion === 'Carro' ? '🚗 ' : '🏍️ '}
                    {opcion}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* =================================================
            SECCIÓN 2: ESPECIFICACIONES
            ================================================= */}

        <View style={styles.tarjeta}>
          <Text style={styles.seccionTitulo}>Especificaciones</Text>

          <Text style={styles.etiqueta}>Marca</Text>

          <TextInput
            style={styles.input}
            placeholder="Ej: Mazda, Yamaha"
            placeholderTextColor={paleta.textoSuave}
            value={marca}
            onChangeText={setMarca}
            maxLength={30}
          />

          <View style={styles.fila}>
            <View style={styles.mitad}>
              <Text style={styles.etiqueta}>Modelo</Text>

              <TextInput
                style={styles.input}
                placeholder="Ej: 3, FZ 2.0"
                placeholderTextColor={paleta.textoSuave}
                value={modelo}
                onChangeText={setModelo}
                maxLength={30}
              />
            </View>

            <View style={styles.mitad}>
              <Text style={styles.etiqueta}>Año *</Text>

              <TextInput
                style={styles.input}
                placeholder="Ej: 2022"
                placeholderTextColor={paleta.textoSuave}
                keyboardType="number-pad"
                value={year}
                onChangeText={setYear}
                maxLength={4}
              />
            </View>
          </View>

          <Text style={styles.etiqueta}>Color</Text>

          <TextInput
            style={styles.input}
            placeholder="Ej: Gris"
            placeholderTextColor={paleta.textoSuave}
            value={color}
            onChangeText={setColor}
            maxLength={30}
          />
        </View>

        {/* =================================================
            SECCIÓN 3: IDENTIFICACIÓN Y USO
            ================================================= */}

        <View style={styles.tarjeta}>
          <Text style={styles.seccionTitulo}>Identificación y uso</Text>

          <Text style={styles.etiqueta}>Documento del propietario *</Text>

          <TextInput
            style={styles.input}
            placeholder="Ej: 1023456789"
            placeholderTextColor={paleta.textoSuave}
            keyboardType="number-pad"
            value={documentoPropietario}
            onChangeText={(texto) =>
              setDocumentoPropietario(texto.replace(/[^0-9]/g, ''))
            }
            maxLength={15}
          />

          <Text style={styles.ayudaPlaca}>
            Solo números. Se usa para vincular el vehículo con una aseguradora.
          </Text>

          <Text style={[styles.etiqueta, styles.filaConMargen]}>
            Nombre del propietario
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Ej: Juan Pérez"
            placeholderTextColor={paleta.textoSuave}
            value={nombrePropietario}
            onChangeText={setNombrePropietario}
            maxLength={60}
          />

          <Text style={styles.ayudaPlaca}>
            Se comparte con tu aseguradora para contactarte por WhatsApp.
          </Text>

          {requiereTelefono ? (
            <>
              <Text style={[styles.etiqueta, styles.filaConMargen]}>
                Celular del propietario *
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Ej: 3001234567"
                placeholderTextColor={paleta.textoSuave}
                keyboardType="phone-pad"
                value={telefonoPropietario}
                onChangeText={(texto) =>
                  setTelefonoPropietario(texto.replace(/[^0-9]/g, ''))
                }
                maxLength={10}
              />

              <Text style={styles.ayudaPlaca}>
                Solo lo usa tu aseguradora para escribirte por WhatsApp.
              </Text>
            </>
          ) : telefonoPerfil ? (
            <Text style={[styles.ayudaPlaca, styles.filaConMargen]}>
              Celular registrado: {telefonoPerfil}
            </Text>
          ) : null}

          <View style={[styles.fila, styles.filaConMargen]}>
            <View style={styles.mitad}>
              <Text style={styles.etiqueta}>Placa</Text>

              <TextInput
                style={[
                  styles.input,
                  styles.inputPlaca,
                  placaDuplicada && styles.inputError,
                ]}
                placeholder={EJEMPLO_PLACA[tipo]}
                placeholderTextColor={paleta.textoSuave}
                autoCapitalize="characters"
                autoCorrect={false}
                value={placa}
                onChangeText={(texto) =>
                  setPlaca(formatearPlaca(texto, tipo))
                }
                maxLength={LARGO_PLACA}
              />

              <Text
                style={[
                  styles.ayudaPlaca,
                  placaDuplicada
                    ? styles.ayudaPlacaError
                    : esPlacaValida(placa, tipo) && styles.ayudaPlacaOk,
                ]}
              >
                {placaDuplicada
                  ? '✗ Ya tienes un vehículo con esta placa'
                  : esPlacaValida(placa, tipo)
                    ? '✓ Placa válida'
                    : `${AYUDA_PLACA[tipo]} · ${progresoPlaca(placa, tipo)}/${LARGO_PLACA}`}
              </Text>
            </View>

            <View style={styles.mitad}>
              <Text style={styles.etiqueta}>Kilometraje</Text>

              <TextInput
                style={styles.input}
                placeholder="Ej: 36500"
                placeholderTextColor={paleta.textoSuave}
                keyboardType="number-pad"
                value={kilometraje}
                onChangeText={(texto) =>
                  setKilometraje(texto.replace(/[^0-9]/g, ''))
                }
                maxLength={8}
              />
            </View>
          </View>

          {kilometraje.trim() !== '' && (
            <Text style={styles.vistaPrevia}>
              {formatoKm(Number(kilometraje.replace(/[^0-9]/g, '') || '0'))}
            </Text>
          )}
        </View>

        {/* =================================================
            SECCIÓN 3.1: SEGURO (OPCIONAL)
            ================================================= */}

        <View style={styles.tarjeta}>
          <View style={styles.seccionFila}>
            <Text style={styles.seccionTitulo}>Seguro</Text>

            <View style={styles.pillOpcional}>
              <Text style={styles.pillOpcionalTexto}>Opcional</Text>
            </View>
          </View>

          <Text style={styles.ayudaImagen}>
            Guarda la aseguradora y su teléfono de atención para llamar
            directo desde el detalle del vehículo.
          </Text>

          <Text style={styles.etiqueta}>Aseguradora</Text>

          <TextInput
            style={styles.input}
            placeholder="Ej: SURA, Bolívar, AXA..."
            placeholderTextColor={paleta.textoSuave}
            value={aseguradora}
            onChangeText={setAseguradora}
            maxLength={40}
          />

          <Text style={styles.chipsAyuda}>Toca una para autocompletar:</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsFila}
          >
            {ASEGURADORAS.map((item) => {
              const activo = aseguradora === item.nombre;

              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setAseguradora(item.nombre);
                    setTelefonoAseguradora(item.telefono);
                  }}
                  style={[
                    styles.chipSeguro,
                    activo && styles.chipSeguroActivo,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activo }}
                  accessibilityLabel={`Usar ${item.nombre}`}
                >
                  <Text
                    style={[
                      styles.chipSeguroTexto,
                      activo && styles.chipSeguroTextoActivo,
                    ]}
                  >
                    {item.nombre}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.fila}>
            <View style={styles.mitad}>
              <Text style={styles.etiqueta}>Teléfono</Text>

              <TextInput
                style={styles.input}
                placeholder="+57 601 000 0000"
                placeholderTextColor={paleta.textoSuave}
                keyboardType="phone-pad"
                value={telefonoAseguradora}
                onChangeText={setTelefonoAseguradora}
                maxLength={22}
              />
            </View>

            <View style={styles.mitad}>
              <Text style={styles.etiqueta}>N.º de póliza</Text>

              <TextInput
                style={styles.input}
                placeholder="Ej: 12345678"
                placeholderTextColor={paleta.textoSuave}
                value={numeroPoliza}
                onChangeText={setNumeroPoliza}
                maxLength={30}
              />
            </View>
          </View>

          <SelectorFecha
            etiqueta="Vencimiento del seguro"
            valor={vencimientoSeguro}
            onChange={setVencimientoSeguro}
            placeholder="AAAA-MM-DD"
            ayuda="Se usa para avisarte antes de que venza."
          />
        </View>

        {/* =================================================
            SECCIÓN 4: IMAGEN
            ================================================= */}

        <View style={styles.tarjeta}>
          <Text style={styles.seccionTitulo}>Imagen</Text>

          <Text style={styles.ayudaImagen}>
            Ya no es necesario pegar enlaces: la foto se elige sola según la
            marca y el modelo que escribas.
          </Text>

          <View style={styles.autoFila}>
            {mostrandoBusqueda ? (
              <>
                <ActivityIndicator size="small" color={paleta.primario} />

                <Text style={styles.autoTexto}>
                  Buscando una foto del vehículo…
                </Text>
              </>
            ) : (
              <>
                <Ionicons
                  name="sparkles-outline"
                  size={15}
                  color={paleta.primario}
                />

                <Text style={styles.autoTexto}>
                  Foto automática por marca y modelo
                </Text>
              </>
            )}
          </View>

          <ImagenVehiculo
            uri={imagenActual}
            tipo={tipo}
            style={styles.vistaImagen}
            accessibilityLabel={`Foto de ${
              `${marca} ${modelo}`.trim() || 'un vehículo nuevo'
            }`}
          />
        </View>

        {/* =================================================
            VISTA PREVIA DEL VEHÍCULO
            ================================================= */}

        <View style={styles.tarjeta}>
          <Text style={styles.seccionTitulo}>Vista previa</Text>

          <View style={styles.previewFila}>
            <View
              style={[
                styles.previewTipo,
                {
                  backgroundColor: coloresTipo(paleta)[tipo].fondo,
                  borderColor: coloresTipo(paleta)[tipo].borde,
                },
              ]}
            >
              <Text
                style={[
                  styles.previewTipoTexto,
                  { color: coloresTipo(paleta)[tipo].texto },
                ]}
              >
                {tipo}
              </Text>
            </View>

            <View style={styles.previewInfo}>
              <Text style={styles.previewNombre}>
                {nombre.trim() || 'Nombre del vehículo'}
              </Text>

              <Text style={styles.previewDatos}>
                {year.trim() || 'Año'}
                {placa.trim() ? ` • ${formatoPlaca(placa)}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* =================================================
            AUTORIZACIÓN DE TRATAMIENTO DE DATOS
            ================================================= */}

        <View style={styles.tarjeta}>
          <Pressable
            style={styles.casillaFila}
            onPress={() => setAutorizaDatos((valor) => !valor)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: autorizaDatos }}
            accessibilityLabel="Autorizo el tratamiento de los datos del vehículo"
          >
            <View
              style={[styles.casilla, autorizaDatos && styles.casillaMarcada]}
            >
              {autorizaDatos ? (
                <Ionicons name="checkmark" size={16} color={paleta.tinta} />
              ) : null}
            </View>

            <Text style={styles.casillaTexto}>
              Autorizo el tratamiento de los datos de este vehículo y de sus
              documentos conforme a la política de Nitro Sync (Ley 1581 de
              2012). Es obligatorio para registrarlo.
            </Text>
          </Pressable>
        </View>

        {/* =================================================
            BOTÓN GUARDAR
            ================================================= */}

        <BotonNitro
          titulo={
            guardando
              ? 'Guardando...'
              : modo === 'editar'
                ? 'Guardar cambios'
                : 'Registrar vehículo'
          }
          icono={modo === 'editar' ? 'checkmark' : 'add'}
          onPress={guardar}
          cargando={guardando}
          deshabilitado={!autorizaDatos}
          anchoCompleto
          style={styles.botonGuardar}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/*
=======================================================
ESTILOS
=======================================================
*/

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: Paleta.fondo,
  },

  scroll: {
    padding: 16,
    paddingBottom: 40,
  },

  banner: {
    borderRadius: Radios.grande,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
    ...sombraDura(4, 4),
  },

  bannerMarca: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
    color: Paleta.blanco,
  },

  bannerAcento: {
    color: Paleta.acento,
  },

  bannerTitulo: {
    fontSize: 24,
    fontWeight: '900',
    color: Paleta.blanco,
    marginTop: 8,
    letterSpacing: -0.4,
  },

  bannerTexto: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 6,
    lineHeight: 18,
  },

  tarjeta: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    borderWidth: 1.5,
    borderColor: Paleta.borde,
    padding: 16,
    marginBottom: 14,
    ...Sombras.tarjeta,
  },

  seccionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  pillOpcional: {
    backgroundColor: Paleta.acentoClaro,
    borderWidth: 1,
    borderColor: '#D2F57A',
    borderRadius: Radios.pastilla,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },

  pillOpcionalTexto: {
    fontSize: 10,
    fontWeight: '900',
    color: Paleta.textoAcento,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  chipsAyuda: {
    fontSize: 11,
    color: Paleta.textoSuave,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 8,
  },

  chipsScroll: {
    marginBottom: 10,
    marginHorizontal: -4,
  },

  chipsFila: {
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },

  chipSeguro: {
    backgroundColor: Paleta.fondo,
    borderWidth: 1.5,
    borderColor: Paleta.borde,
    borderRadius: Radios.pastilla,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  chipSeguroActivo: {
    backgroundColor: Paleta.acento,
    borderColor: Paleta.bordeDuro,
    ...sombraDura(2, 2),
  },

  chipSeguroTexto: {
    fontSize: 12,
    fontWeight: '700',
    color: Paleta.textoSecundario,
  },

  chipSeguroTextoActivo: {
    color: Paleta.tinta,
    fontWeight: '900',
  },

  seccionTitulo: {
    fontSize: 16,
    fontWeight: '800',
    color: Paleta.texto,
    marginBottom: 12,
  },

  etiqueta: {
    fontSize: 13,
    fontWeight: '600',
    color: Paleta.textoSecundario,
    marginBottom: 6,
    marginTop: 4,
  },

  input: {
    height: 50,
    backgroundColor: Paleta.fondo,
    borderWidth: 1,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Paleta.texto,
    marginBottom: 6,
  },

  inputPlaca: {
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '800',
  },

  ayudaPlaca: {
    fontSize: 11,
    color: Paleta.textoSuave,
    marginTop: 2,
  },

  ayudaPlacaOk: {
    color: Paleta.exito,
    fontWeight: '700',
  },

  ayudaPlacaError: {
    color: Paleta.peligro,
    fontWeight: '700',
  },

  inputError: {
    borderColor: Paleta.peligro,
    borderWidth: 1.5,
  },

  filaConMargen: {
    marginTop: 14,
  },

  casillaFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  casilla: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    backgroundColor: Paleta.tarjeta,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },

  casillaMarcada: {
    backgroundColor: Paleta.acento,
  },

  casillaTexto: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: Paleta.texto,
    fontWeight: '600',
  },

  ayudaImagen: {
    fontSize: 13,
    color: Paleta.textoSecundario,
    marginTop: 6,
    marginBottom: 6,
    lineHeight: 18,
  },

  autoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 2,
  },

  autoTexto: {
    flex: 1,
    fontSize: 12,
    color: Paleta.textoSecundario,
    fontWeight: '600',
  },

  fila: {
    flexDirection: 'row',
    gap: 12,
  },

  mitad: {
    flex: 1,
  },

  vistaPrevia: {
    fontSize: 13,
    fontWeight: '700',
    color: Paleta.primario,
    marginTop: 4,
  },

  vistaImagen: {
    width: '100%',
    height: 150,
    borderRadius: Radios.suave,
    marginTop: 8,
    backgroundColor: Paleta.fondo,
  },

  segmento: {
    flexDirection: 'row',
    backgroundColor: Paleta.fondo,
    borderRadius: Radios.suave,
    padding: 4,
    gap: 4,
  },

  segmentoOpcion: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  segmentoActivo: {
    backgroundColor: Paleta.primario,
  },

  segmentoTexto: {
    fontSize: 14,
    fontWeight: '700',
    color: Paleta.textoSecundario,
  },

  segmentoTextoActivo: {
    color: '#FFFFFF',
  },

  botonGuardar: {
    marginTop: 6,
    marginBottom: 18,
  },

  /* -----------------------------
     VISTA PREVIA
     ----------------------------- */

  previewFila: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  previewTipo: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radios.pastilla,
    borderWidth: 1,
    marginRight: 10,
  },

  previewTipoTexto: {
    fontSize: 12,
    fontWeight: '800',
  },

  previewInfo: {
    flex: 1,
  },

  previewNombre: {
    fontSize: 15,
    fontWeight: '800',
    color: Paleta.texto,
  },

  previewDatos: {
    fontSize: 13,
    color: Paleta.textoSecundario,
    marginTop: 2,
  },

  /* -----------------------------
     VEHÍCULO NO ENCONTRADO
     ----------------------------- */

  avisoContenedor: {
    flex: 1,
    backgroundColor: Paleta.fondo,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  avisoTitulo: {
    fontSize: 20,
    fontWeight: '800',
    color: Paleta.texto,
    marginBottom: 8,
    textAlign: 'center',
  },

  avisoTexto: {
    fontSize: 14,
    color: Paleta.textoSecundario,
    textAlign: 'center',
    marginBottom: 20,
  },

  avisoBoton: {
    backgroundColor: Paleta.primario,
    borderRadius: Radios.suave,
    paddingHorizontal: 26,
    paddingVertical: 13,
  },

  avisoBotonTexto: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});

/*
=======================================================
NITRO SYNC - DIRECTORIO DE ASEGURADORAS
=======================================================

Lista de las aseguradoras de vehículos más usadas en
Colombia con sus teléfonos de atención.

Cada tarjeta permite:

  - Llamar a la línea principal (`tel:`).
  - Escribir por WhatsApp (si tiene línea).
  - Abrir el portal web de la aseguradora.

Los datos viven en `data/aseguradoras.ts` y el mismo
listado se entrega en Excel:

  assets/documentos/aseguradoras.xlsx

Para regenerar el Excel después de editar la lista:

  npm run excel:aseguradoras
=======================================================
*/

import { useMemo, useState } from 'react';

import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { Asset } from 'expo-asset';

import {
  ASEGURADORAS,
  telefonoMarcable,
  type Aseguradora,
} from '@/data/aseguradoras';

import {
  Gradientes,
  Radios,
  Sombras,
  sombraDura,
  type TipoPaleta,
} from '@/constants/theme';

import { useEstilos, useTema } from '@/context/TemaContext';
import { useLineaAtencion } from '@/hooks/use-linea-atencion';
import { abrirEnlace, enlaceWhatsApp } from '@/utils/contacto';

import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta } from '@/components/ui/confirm-dialog';

/* El Excel viaja con la app (ver metro.config.js). */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EXCEL_ASEGURADORAS = require('../assets/documentos/aseguradoras.xlsx');

/* -------------------------------------------------------
   INICIALES PARA EL BADGE DE COLOR
   ------------------------------------------------------- */

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra.charAt(0).toUpperCase())
    .join('');
}

/* -------------------------------------------------------
   PANTALLA
   ------------------------------------------------------- */

export default function AseguradorasScreen() {
  const alerta = useAlerta();

  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [consulta, setConsulta] = useState('');

  const lista = useMemo(() => {
    const busqueda = consulta.trim().toLowerCase();

    if (!busqueda) {
      return ASEGURADORAS;
    }

    return ASEGURADORAS.filter(
      (aseguradora) =>
        aseguradora.nombre.toLowerCase().includes(busqueda) ||
        aseguradora.especialidad.toLowerCase().includes(busqueda) ||
        aseguradora.telefono.includes(busqueda)
    );
  }, [consulta]);

  const abrirEnlaceExterno = async (url: string) => {
    const abierto = await abrirEnlace(url);
    if (!abierto) {
      await alerta({
        titulo: 'No se pudo abrir',
        mensaje: `Abre manualmente este enlace:\n${url}`,
        tipo: 'advertencia',
      });
    }
  };

  const descargarExcel = async () => {
    try {
      const asset = Asset.fromModule(EXCEL_ASEGURADORAS);

      if (Platform.OS === 'web') {
        await asset.downloadAsync();
        await Linking.openURL(asset.uri);
        return;
      }

      await alerta({
        titulo: 'Excel del proyecto',
        mensaje:
          'El archivo está en assets/documentos/aseguradoras.xlsx. Ábrelo desde la carpeta del proyecto en tu computador.',
        tipo: 'info',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo descargar',
        mensaje:
          'El Excel está en assets/documentos/aseguradoras.xlsx dentro del proyecto.',
        tipo: 'error',
      });
    }
  };

  return (
    <View style={styles.contenedor}>
      <Stack.Screen options={{ title: 'Aseguradoras' }} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={true}
        persistentScrollbar
        keyboardShouldPersistTaps="handled"
      >
        {/* =================================================
            ENCABEZADO
            ================================================= */}

        <LinearGradient
          colors={Gradientes.marcaViva}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroPill}>
            <Ionicons name="shield-checkmark" size={14} color={paleta.acento} />

            <Text style={styles.heroPillTexto}>Directorio 2026</Text>
          </View>

          <Text style={styles.heroTitulo}>Aseguradoras</Text>

          <Text style={styles.heroTexto}>
            Teléfonos de asistencia y grúas para tu carro o moto. Toca “Llamar”
            y marca al instante.
          </Text>

          <View style={styles.heroDato}>
            <Text style={styles.heroDatoNumero}>{ASEGURADORAS.length}</Text>

            <Text style={styles.heroDatoTexto}>aseguradoras verificadas</Text>
          </View>
        </LinearGradient>

        {/* =================================================
            BUSCADOR
            ================================================= */}

        <View style={styles.buscador}>
          <Ionicons name="search" size={18} color={paleta.textoSuave} />

          <TextInput
            style={styles.buscadorInput}
            placeholder="Buscar aseguradora o especialidad"
            placeholderTextColor={paleta.textoSuave}
            value={consulta}
            onChangeText={setConsulta}
            autoCorrect={false}
            accessibilityLabel="Buscar aseguradora"
          />

          {consulta.length > 0 && (
            <TouchableOpacity
              onPress={() => setConsulta('')}
              accessibilityRole="button"
              accessibilityLabel="Limpiar búsqueda"
            >
              <Ionicons name="close-circle" size={18} color={paleta.textoSuave} />
            </TouchableOpacity>
          )}
        </View>

        {/* =================================================
            LISTA
            ================================================= */}

        {lista.length === 0 ? (
          <View style={styles.vacio}>
            <Text style={styles.vacioIcono}>🔎</Text>

            <Text style={styles.vacioTitulo}>Sin resultados</Text>

            <Text style={styles.vacioTexto}>
              No encontramos una aseguradora que coincida con “{consulta}”.
            </Text>
          </View>
        ) : (
          lista.map((aseguradora) => (
            <TarjetaAseguradora
              key={aseguradora.id}
              aseguradora={aseguradora}
              abrirEnlace={abrirEnlaceExterno}
            />
          ))
        )}

        {/* =================================================
            EXCEL
            ================================================= */}

        <View style={styles.excelCard}>
          <View style={styles.excelIcono}>
            <Ionicons name="document-text" size={20} color={paleta.primario} />
          </View>

          <View style={styles.excelInfo}>
            <Text style={styles.excelTitulo}>Listado completo en Excel</Text>

            <Text style={styles.excelTexto}>
              Todas las aseguradoras con teléfono, WhatsApp y página web.
            </Text>
          </View>

          <BotonNitro
            titulo="Descargar"
            icono="download-outline"
            variante="secundario"
            tamano="pequeno"
            onPress={descargarExcel}
          />
        </View>

        <Text style={styles.nota}>
          Los teléfonos pueden cambiar. Si una línea no responde, usa el botón
          web para consultar los canales oficiales de la aseguradora.
        </Text>
      </ScrollView>
    </View>
  );
}

/* -------------------------------------------------------
   TARJETA CON LÍNEA DE ATENCIÓN OFICIAL

   El número NO se toma del catálogo local: se lee en tiempo
   real de `organizations` en Firestore. Llamada y WhatsApp
   usan exactamente el mismo valor. Si la aseguradora cambia
   su número desde su panel, esta tarjeta se actualiza sola.
   ------------------------------------------------------- */

function TarjetaAseguradora({
  aseguradora,
  abrirEnlace,
}: {
  aseguradora: Aseguradora;
  abrirEnlace: (url: string) => Promise<void>;
}) {
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();
  const { telefono, cargando } = useLineaAtencion(aseguradora.clave);

  const enlace = enlaceWhatsApp(
    telefono,
    `Hola ${aseguradora.nombre}, quiero información sobre seguros de vehículo.`
  );

  return (
    <View style={styles.tarjeta}>
      <View style={styles.tarjetaFila}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: aseguradora.color,
              borderColor: paleta.bordeDuro,
            },
          ]}
        >
          <Text style={[styles.badgeTexto, { color: aseguradora.colorTexto }]}>
            {iniciales(aseguradora.nombre)}
          </Text>
        </View>

        <View style={styles.tarjetaInfo}>
          <Text style={styles.tarjetaNombre} numberOfLines={1}>
            {aseguradora.nombre}
          </Text>
          <Text style={styles.tarjetaEspecialidad} numberOfLines={1}>
            {aseguradora.especialidad}
          </Text>
        </View>
      </View>

      <View style={styles.telefonos}>
        <View style={styles.telefonoFila}>
          <Ionicons name="call-outline" size={14} color={paleta.primario} />
          <Text style={styles.telefonoTexto}>
            {cargando
              ? 'Consultando línea oficial…'
              : telefono ?? 'Línea de atención no disponible'}
          </Text>
        </View>

        {aseguradora.telefonoGratuito ? (
          <View style={styles.telefonoFila}>
            <Ionicons name="headset-outline" size={14} color={paleta.textoSecundario} />
            <Text style={styles.telefonoTextoSuave}>
              Gratuito {aseguradora.telefonoGratuito}
            </Text>
          </View>
        ) : null}

        {aseguradora.linea ? (
          <View style={styles.telefonoFila}>
            <Ionicons
              name="phone-portrait-outline"
              size={14}
              color={paleta.textoSecundario}
            />
            <Text style={styles.telefonoTextoSuave}>Línea {aseguradora.linea}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.acciones}>
        <BotonNitro
          titulo="Llamar"
          icono="call"
          tamano="pequeno"
          onPress={() => {
            if (telefono) void abrirEnlace(`tel:${telefonoMarcable(telefono)}`);
          }}
          style={styles.accionLlamar}
          deshabilitado={!telefono}
        />

        {enlace ? (
          <TouchableOpacity
            style={styles.accionIcono}
            onPress={() => void abrirEnlace(enlace)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`WhatsApp de ${aseguradora.nombre}`}
          >
            <Ionicons name="logo-whatsapp" size={18} color={paleta.exito} />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.accionIcono}
          onPress={() => void abrirEnlace(aseguradora.web)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Sitio web de ${aseguradora.nombre}`}
        >
          <Ionicons name="globe-outline" size={18} color={paleta.primario} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* -------------------------------------------------------
   ESTILOS
   ------------------------------------------------------- */

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: Paleta.fondo,
  },

  scroll: {
    paddingBottom: 32,
  },

  /* HERO */

  hero: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: Radios.grande,
    padding: 20,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    overflow: 'hidden',
    ...sombraDura(6, 6),
  },

  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(200, 255, 61, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(200, 255, 61, 0.4)',
    borderRadius: Radios.pastilla,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },

  heroPillTexto: {
    color: Paleta.acento,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  heroTitulo: {
    fontSize: 30,
    fontWeight: '900',
    color: Paleta.blanco,
    letterSpacing: 0.4,
  },

  heroTexto: {
    fontSize: 13,
    color: '#C9D2F5',
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 460,
  },

  heroDato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },

  heroDatoNumero: {
    fontSize: 26,
    fontWeight: '900',
    color: Paleta.acento,
  },

  heroDatoTexto: {
    fontSize: 12,
    color: '#C9D2F5',
    fontWeight: '600',
  },

  /* BUSCADOR */

  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Paleta.tarjeta,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    borderRadius: Radios.suave,
    paddingHorizontal: 14,
    height: 50,
    marginHorizontal: 16,
    marginTop: 20,
    ...sombraDura(4, 4),
  },

  buscadorInput: {
    flex: 1,
    fontSize: 14,
    color: Paleta.texto,
  },

  /* TARJETAS */

  tarjeta: {
    backgroundColor: Paleta.tarjeta,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    borderRadius: Radios.tarjeta,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 14,
    ...sombraDura(4, 4),
  },

  tarjetaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  badge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  badgeTexto: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  tarjetaInfo: {
    flex: 1,
  },

  tarjetaNombre: {
    fontSize: 16,
    fontWeight: '800',
    color: Paleta.texto,
  },

  tarjetaEspecialidad: {
    fontSize: 12,
    color: Paleta.textoSecundario,
    marginTop: 2,
  },

  /* TELÉFONOS */

  telefonos: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Paleta.borde,
    gap: 6,
  },

  telefonoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  telefonoTexto: {
    fontSize: 14,
    fontWeight: '800',
    color: Paleta.texto,
  },

  telefonoTextoSuave: {
    fontSize: 12,
    color: Paleta.textoSecundario,
  },

  /* ACCIONES */

  acciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },

  accionLlamar: {
    flex: 1,
  },

  accionIcono: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    backgroundColor: Paleta.tarjeta,
    alignItems: 'center',
    justifyContent: 'center',
    ...sombraDura(2, 2),
  },

  /* VACÍO */

  vacio: {
    alignItems: 'center',
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    ...Sombras.tarjeta,
  },

  vacioIcono: {
    fontSize: 34,
    marginBottom: 8,
  },

  vacioTitulo: {
    fontSize: 16,
    fontWeight: '800',
    color: Paleta.texto,
  },

  vacioTexto: {
    fontSize: 13,
    color: Paleta.textoSecundario,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },

  /* EXCEL */

  excelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Paleta.acentoClaro,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    borderRadius: Radios.tarjeta,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 20,
    ...sombraDura(4, 4),
  },

  excelIcono: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Paleta.tarjeta,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    alignItems: 'center',
    justifyContent: 'center',
  },

  excelInfo: {
    flex: 1,
  },

  excelTitulo: {
    fontSize: 14,
    fontWeight: '800',
    color: Paleta.texto,
  },

  excelTexto: {
    fontSize: 12,
    color: Paleta.textoSecundario,
    marginTop: 2,
    lineHeight: 17,
  },

  nota: {
    fontSize: 11,
    color: Paleta.textoSuave,
    lineHeight: 17,
    marginHorizontal: 20,
    marginTop: 18,
  },
});

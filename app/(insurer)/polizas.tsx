/*
=======================================================
NITRO SYNC - PANEL ASEGURADORA · PÓLIZAS Y OFERTAS
=======================================================

Dos secciones:

  PÓLIZAS  -> pólizas emitidas por la organización. Se
              crean a partir de un vehículo vinculado.
  OFERTAS  -> propuestas de renovación enviadas al
              propietario, que las acepta o rechaza.

Toda creación queda registrada en `auditLogs`.
=======================================================
*/

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

import { Paleta, Radios, Sombras } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta } from '@/components/ui/confirm-dialog';
import { suscribirVinculosOrg } from '@/services/vinculos';
import {
  crearOferta,
  crearPoliza,
  suscribirOfertasOrg,
  suscribirPolizasOrg,
} from '@/services/polizas';
import { registrarAuditoria } from '@/services/auditoria';
import { formatearCop } from '@/services/facturacion';
import {
  ETIQUETA_ESTADO_OFERTA,
  ETIQUETA_ESTADO_POLIZA,
  type EstadoPoliza,
  type Oferta,
  type Poliza,
  type VinculoAseguradora,
} from '@/types/negocio';

type Seccion = 'polizas' | 'ofertas';

function colorPoliza(estado: EstadoPoliza) {
  switch (estado) {
    case 'vigente':
      return Paleta.exito;
    case 'por_vencer':
      return Paleta.advertencia;
    case 'vencida':
      return Paleta.peligro;
    default:
      return Paleta.textoSuave;
  }
}

export default function PolizasAseguradora() {
  const { user, orgId, organizacion } = useAuth();
  const alerta = useAlerta();

  const [seccion, setSeccion] = useState<Seccion>('polizas');
  const [polizas, setPolizas] = useState<Poliza[]>([]);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [vinculos, setVinculos] = useState<VinculoAseguradora[]>([]);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [guardando, setGuardando] = useState(false);

  /* Campos del formulario. */
  const [vinculoId, setVinculoId] = useState<string | null>(null);
  const [producto, setProducto] = useState('Todo riesgo');
  const [numero, setNumero] = useState('');
  const [vigenciaInicio, setVigenciaInicio] = useState('');
  const [vigenciaFin, setVigenciaFin] = useState('');
  const [prima, setPrima] = useState('');
  const [titulo, setTitulo] = useState('Renovación de póliza');
  const [descripcion, setDescripcion] = useState('');

  useEffect(() => {
    if (!orgId) return;

    const pararPolizas = suscribirPolizasOrg(orgId, setPolizas);
    const pararOfertas = suscribirOfertasOrg(orgId, setOfertas);
    const pararVinculos = suscribirVinculosOrg(orgId, (lista) =>
      setVinculos(lista.filter((v) => v.estado === 'activo'))
    );

    return () => {
      pararPolizas();
      pararOfertas();
      pararVinculos();
    };
  }, [orgId]);

  const vinculo = useMemo(
    () => vinculos.find((v) => v.id === vinculoId) ?? null,
    [vinculos, vinculoId]
  );

  const limpiar = () => {
    setVinculoId(null);
    setNumero('');
    setVigenciaInicio('');
    setVigenciaFin('');
    setPrima('');
    setDescripcion('');
    setMostrarFormulario(false);
  };

  const guardarPoliza = async () => {
    if (!orgId || !user) return;

    if (!vinculo) {
      await alerta({
        titulo: 'Falta el vehículo',
        mensaje: 'Selecciona el vehículo vinculado al que pertenece la póliza.',
        tipo: 'advertencia',
      });
      return;
    }

    if (!numero.trim() || !vigenciaInicio.trim() || !vigenciaFin.trim()) {
      await alerta({
        titulo: 'Datos incompletos',
        mensaje: 'Escribe el número de póliza y ambas vigencias (AAAA-MM-DD).',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      const id = await crearPoliza({
        vehiculoId: vinculo.vehiculoId,
        propietarioUid: vinculo.propietarioUid,
        orgId,
        producto: producto.trim() || 'General',
        numero: numero.trim(),
        placa: vinculo.placa,
        vigenciaInicio: vigenciaInicio.trim(),
        vigenciaFin: vigenciaFin.trim(),
        primaCop: prima ? Number(prima.replace(/[^\d]/g, '')) : null,
      });

      await registrarAuditoria({
        actorUid: user.uid,
        actorCorreo: user.email,
        actorRol: 'insurer_admin',
        orgId,
        accion: 'poliza.crear',
        entidad: 'policies',
        entidadId: id,
        detalle: { numero: numero.trim(), placa: vinculo.placa },
      });

      await alerta({
        titulo: 'Póliza guardada',
        mensaje: `La póliza ${numero.trim()} quedó registrada.`,
        tipo: 'exito',
      });

      limpiar();
    } catch {
      await alerta({
        titulo: 'No se pudo guardar',
        mensaje: 'Revisa los datos e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  const guardarOferta = async () => {
    if (!orgId || !user) return;

    if (!vinculo) {
      await alerta({
        titulo: 'Falta el vehículo',
        mensaje: 'Selecciona el vehículo al que se enviará la oferta.',
        tipo: 'advertencia',
      });
      return;
    }

    if (!titulo.trim()) {
      await alerta({
        titulo: 'Falta el título',
        mensaje: 'Escribe un título para la oferta.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      const id = await crearOferta({
        polizaId: vinculo.poliza ?? '',
        vehiculoId: vinculo.vehiculoId,
        propietarioUid: vinculo.propietarioUid,
        orgId,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        primaCop: prima ? Number(prima.replace(/[^\d]/g, '')) : null,
        vigenciaFin: vigenciaFin.trim() || null,
      });

      await registrarAuditoria({
        actorUid: user.uid,
        actorCorreo: user.email,
        actorRol: 'insurer_admin',
        orgId,
        accion: 'oferta.crear',
        entidad: 'offers',
        entidadId: id,
        detalle: { titulo: titulo.trim(), placa: vinculo.placa },
      });

      await alerta({
        titulo: 'Oferta enviada',
        mensaje: 'El propietario la verá en su aplicación.',
        tipo: 'exito',
      });

      limpiar();
    } catch {
      await alerta({
        titulo: 'No se pudo enviar',
        mensaje: 'Revisa los datos e intenta de nuevo.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  const renderSelectorVinculo = () => (
    <View style={styles.selector}>
      <Text style={styles.etiqueta}>Vehículo vinculado</Text>

      {vinculos.length === 0 ? (
        <Text style={styles.ayuda}>
          No hay vehículos activos. Actívalos en la pestaña “Vehículos”.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {vinculos.map((v) => (
            <Pressable
              key={v.id}
              style={[styles.chip, vinculoId === v.id && styles.chipActivo]}
              onPress={() => setVinculoId(v.id)}
            >
              <Text
                style={[
                  styles.chipTexto,
                  vinculoId === v.id && styles.chipTextoActivo,
                ]}
              >
                {v.placa || v.vehiculoId.slice(0, 6)} · {v.marca}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const renderFormulario = () => (
    <View style={styles.formulario}>
      <Text style={styles.formTitulo}>
        {seccion === 'polizas' ? 'Nueva póliza' : 'Nueva oferta'}
      </Text>

      {renderSelectorVinculo()}

      {seccion === 'polizas' ? (
        <>
          <Text style={styles.etiqueta}>Producto</Text>
          <TextInput
            style={styles.input}
            value={producto}
            onChangeText={setProducto}
            placeholder="Todo riesgo, SOAT, etc."
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.etiqueta}>Número de póliza</Text>
          <TextInput
            style={styles.input}
            value={numero}
            onChangeText={setNumero}
            placeholder="POL-2026-0001"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
          />
        </>
      ) : (
        <>
          <Text style={styles.etiqueta}>Título</Text>
          <TextInput
            style={styles.input}
            value={titulo}
            onChangeText={setTitulo}
            placeholder="Renovación de póliza"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.etiqueta}>Descripción</Text>
          <TextInput
            style={[styles.input, styles.inputMultilinea]}
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Detalle de la propuesta"
            placeholderTextColor="#94A3B8"
            multiline
          />
        </>
      )}

      <View style={styles.filaDoble}>
        <View style={styles.mitad}>
          <Text style={styles.etiqueta}>
            {seccion === 'polizas' ? 'Inicio (AAAA-MM-DD)' : 'Vence (AAAA-MM-DD)'}
          </Text>
          <TextInput
            style={styles.input}
            value={seccion === 'polizas' ? vigenciaInicio : vigenciaFin}
            onChangeText={
              seccion === 'polizas' ? setVigenciaInicio : setVigenciaFin
            }
            placeholder="2026-01-01"
            placeholderTextColor="#94A3B8"
          />
        </View>

        {seccion === 'polizas' ? (
          <View style={styles.mitad}>
            <Text style={styles.etiqueta}>Fin (AAAA-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={vigenciaFin}
              onChangeText={setVigenciaFin}
              placeholder="2026-12-31"
              placeholderTextColor="#94A3B8"
            />
          </View>
        ) : null}
      </View>

      <Text style={styles.etiqueta}>Prima (COP)</Text>
      <TextInput
        style={styles.input}
        value={prima}
        onChangeText={setPrima}
        placeholder="850000"
        placeholderTextColor="#94A3B8"
        keyboardType="numeric"
      />

      <View style={styles.formAcciones}>
        <BotonNitro
          titulo={seccion === 'polizas' ? 'Guardar póliza' : 'Enviar oferta'}
          icono="save-outline"
          onPress={seccion === 'polizas' ? guardarPoliza : guardarOferta}
          cargando={guardando}
          style={styles.botonForm}
        />
        <BotonNitro
          titulo="Cancelar"
          variante="secundario"
          onPress={limpiar}
          style={styles.botonForm}
        />
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <EncabezadoPanel
          etiqueta="PANEL DE ASEGURADORA"
          titulo="Pólizas y ofertas"
          subtitulo={organizacion?.nombre ?? null}
          icono="document-text"
        />

        <View style={styles.segmentos}>
          <Pressable
            style={[styles.segmento, seccion === 'polizas' && styles.segmentoActivo]}
            onPress={() => {
              setSeccion('polizas');
              setMostrarFormulario(false);
            }}
          >
            <Text
              style={[
                styles.segmentoTexto,
                seccion === 'polizas' && styles.segmentoTextoActivo,
              ]}
            >
              Pólizas ({polizas.length})
            </Text>
          </Pressable>

          <Pressable
            style={[styles.segmento, seccion === 'ofertas' && styles.segmentoActivo]}
            onPress={() => {
              setSeccion('ofertas');
              setMostrarFormulario(false);
            }}
          >
            <Text
              style={[
                styles.segmentoTexto,
                seccion === 'ofertas' && styles.segmentoTextoActivo,
              ]}
            >
              Ofertas ({ofertas.length})
            </Text>
          </Pressable>
        </View>

        {!mostrarFormulario ? (
          <BotonNitro
            titulo={seccion === 'polizas' ? 'Nueva póliza' : 'Nueva oferta'}
            icono="add"
            variante="oscuro"
            onPress={() => setMostrarFormulario(true)}
            style={styles.botonNuevo}
          />
        ) : (
          renderFormulario()
        )}

        {seccion === 'polizas' ? (
          <View style={styles.lista}>
            {polizas.length === 0 ? (
              <Text style={styles.vacio}>Aún no hay pólizas registradas.</Text>
            ) : (
              polizas.map((p) => (
                <View key={p.id} style={styles.tarjeta}>
                  <View style={styles.tarjetaCabecera}>
                    <Text style={styles.tarjetaTitulo}>
                      {p.numero || 'Sin número'}
                    </Text>
                    <View
                      style={[
                        styles.estado,
                        { borderColor: colorPoliza(p.estado) },
                      ]}
                    >
                      <Text
                        style={[styles.estadoTexto, { color: colorPoliza(p.estado) }]}
                      >
                        {ETIQUETA_ESTADO_POLIZA[p.estado]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.tarjetaLinea}>
                    {p.producto} · {p.placa}
                  </Text>
                  <Text style={styles.tarjetaLinea}>
                    {p.vigenciaInicio} → {p.vigenciaFin}
                  </Text>
                  <Text style={styles.tarjetaPrima}>
                    {formatearCop(p.primaCop)}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={styles.lista}>
            {ofertas.length === 0 ? (
              <Text style={styles.vacio}>Aún no hay ofertas enviadas.</Text>
            ) : (
              ofertas.map((o) => (
                <View key={o.id} style={styles.tarjeta}>
                  <View style={styles.tarjetaCabecera}>
                    <Text style={styles.tarjetaTitulo}>{o.titulo}</Text>
                    <View
                      style={[styles.estado, { borderColor: Paleta.primario }]}
                    >
                      <Text style={[styles.estadoTexto, { color: Paleta.primario }]}>
                        {ETIQUETA_ESTADO_OFERTA[o.estado]}
                      </Text>
                    </View>
                  </View>
                  {o.descripcion ? (
                    <Text style={styles.tarjetaLinea}>{o.descripcion}</Text>
                  ) : null}
                  <Text style={styles.tarjetaLinea}>
                    {o.vigenciaFin ? `Vence ${o.vigenciaFin}` : 'Sin vigencia'}
                  </Text>
                  <Text style={styles.tarjetaPrima}>{formatearCop(o.primaCop)}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: Paleta.fondo },
  contenido: { paddingBottom: 44 },
  segmentos: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: -24,
  },
  segmento: {
    flex: 1,
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.suave,
    borderWidth: 2,
    borderColor: Paleta.tinta,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentoActivo: { backgroundColor: Paleta.tinta },
  segmentoTexto: {
    fontSize: 13,
    fontWeight: '900',
    color: Paleta.texto,
  },
  segmentoTextoActivo: { color: Paleta.acento },
  botonNuevo: { marginHorizontal: 16, marginTop: 16 },
  formulario: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    padding: 18,
    marginHorizontal: 16,
    marginTop: 16,
    gap: 6,
    ...Sombras.suave,
  },
  formTitulo: {
    fontSize: 17,
    fontWeight: '900',
    color: Paleta.texto,
    marginBottom: 6,
  },
  selector: { marginBottom: 10, gap: 6 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radios.pastilla,
    borderWidth: 1.5,
    borderColor: Paleta.borde,
    backgroundColor: Paleta.fondo,
  },
  chipActivo: { backgroundColor: Paleta.primario, borderColor: Paleta.primario },
  chipTexto: {
    fontSize: 12,
    fontWeight: '800',
    color: Paleta.textoSecundario,
  },
  chipTextoActivo: { color: Paleta.blanco },
  etiqueta: {
    fontSize: 12,
    fontWeight: '800',
    color: Paleta.textoSecundario,
    marginTop: 8,
    marginBottom: 4,
  },
  ayuda: { fontSize: 12, color: Paleta.textoSuave },
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
  inputMultilinea: { height: 82, paddingTop: 12, textAlignVertical: 'top' },
  filaDoble: { flexDirection: 'row', gap: 10 },
  mitad: { flex: 1 },
  formAcciones: { flexDirection: 'row', gap: 10, marginTop: 16 },
  botonForm: { flex: 1 },
  lista: { padding: 16, gap: 12 },
  vacio: {
    fontSize: 13,
    color: Paleta.textoSecundario,
    textAlign: 'center',
    marginTop: 24,
  },
  tarjeta: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    padding: 16,
    gap: 4,
    ...Sombras.suave,
  },
  tarjetaCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  tarjetaTitulo: { fontSize: 15, fontWeight: '900', color: Paleta.texto, flexShrink: 1 },
  estado: {
    borderWidth: 1.5,
    borderRadius: Radios.pastilla,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  estadoTexto: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  tarjetaLinea: { fontSize: 12.5, color: Paleta.textoSecundario },
  tarjetaPrima: {
    fontSize: 14,
    fontWeight: '900',
    color: Paleta.texto,
    marginTop: 4,
  },
});

/*
=======================================================
NITRO SYNC - PANEL DE PLATAFORMA · VÍNCULOS
=======================================================

El super administrador crea la PROYECCIÓN que las
aseguradoras pueden leer: `vehicleInsurerLinks`.

Flujo:

  1. Se elige un vehículo real (collectionGroup
     `vehiculos`).
  2. Se elige la aseguradora y el producto (SOAT, todo
     riesgo, etc.).
  3. Se decide si los datos personales del propietario
     quedan visibles para esa aseguradora.

La aseguradora nunca lee `usuarios/{uid}/vehiculos`: solo
esta proyección.
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

import { Ionicons } from '@expo/vector-icons';
import { getDoc } from 'firebase/firestore';

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta } from '@/components/ui/confirm-dialog';
import { suscribirOrganizaciones } from '@/services/organizaciones';
import { perfilRef } from '@/services/perfil';
import { suscribirTodosLosVehiculos } from '@/services/admin';
import { crearVinculo, suscribirTodosVinculos } from '@/services/vinculos';
import { registrarAuditoria } from '@/services/auditoria';
import { ETIQUETA_ESTADO_VINCULO } from '@/types/negocio';
import type { Organizacion, VinculoAseguradora } from '@/types/negocio';
import type { VehiculoAdmin } from '@/types/models';

export default function VinculosAdmin() {
  const { user } = useAuth();
  const alerta = useAlerta();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoAdmin[]>([]);
  const [vinculos, setVinculos] = useState<VinculoAseguradora[]>([]);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [vehiculoId, setVehiculoId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [producto, setProducto] = useState('Todo riesgo');
  const [poliza, setPoliza] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [datosVisibles, setDatosVisibles] = useState(false);

  useEffect(() => {
    const pararOrgs = suscribirOrganizaciones(setOrganizaciones);
    const pararVehiculos = suscribirTodosLosVehiculos(setVehiculos);
    const pararVinculos = suscribirTodosVinculos(setVinculos);

    return () => {
      pararOrgs();
      pararVehiculos();
      pararVinculos();
    };
  }, []);

  const vehiculo = useMemo(
    () => vehiculos.find((v) => v.id === vehiculoId) ?? null,
    [vehiculos, vehiculoId]
  );

  const org = useMemo(
    () => organizaciones.find((o) => o.id === orgId) ?? null,
    [organizaciones, orgId]
  );

  const limpiar = () => {
    setVehiculoId(null);
    setOrgId(null);
    setPoliza('');
    setVigencia('');
    setDatosVisibles(false);
    setMostrarFormulario(false);
  };

  const crear = async () => {
    if (!user) return;

    if (!vehiculo || !org) {
      await alerta({
        titulo: 'Faltan datos',
        mensaje: 'Selecciona un vehículo y una aseguradora.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setGuardando(true);

      /* Datos de contacto del propietario, si los registró. */
      let telefono: string | null = null;
      let correo: string | null = null;

      try {
        const perfil = await getDoc(perfilRef(vehiculo.propietarioUid));

        if (perfil.exists()) {
          telefono = perfil.data()?.telefono ?? null;
          correo = perfil.data()?.email ?? null;
        }
      } catch {
        telefono = null;
        correo = null;
      }

      const id = await crearVinculo({
        vehiculoId: vehiculo.id,
        propietarioUid: vehiculo.propietarioUid,
        propietarioNombre: null,
        propietarioTelefono: telefono,
        propietarioCorreo: correo,
        orgId: org.id,
        producto: producto.trim() || 'General',
        placa: vehiculo.placa,
        marca: vehiculo.marca,
        modelo: vehiculo.modelo,
        year: vehiculo.year,
        tipo: vehiculo.tipo,
        poliza: poliza.trim() || null,
        vigencia: vigencia.trim() || null,
        datosPropietarioVisibles: datosVisibles,
      });

      await registrarAuditoria({
        actorUid: user.uid,
        actorCorreo: user.email,
        actorRol: 'super_admin',
        orgId: org.id,
        accion: 'vinculo.crear',
        entidad: 'vehicleInsurerLinks',
        entidadId: id,
        detalle: { placa: vehiculo.placa, producto: producto.trim() },
      });

      await alerta({
        titulo: 'Vínculo creado',
        mensaje: `${vehiculo.placa} quedó vinculado a ${org.nombre}.`,
        tipo: 'exito',
      });

      limpiar();
    } catch {
      await alerta({
        titulo: 'No se pudo crear',
        mensaje: 'Revisa los datos e intenta de nuevo.',
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
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <EncabezadoPanel
          etiqueta="PANEL DE PLATAFORMA"
          titulo="Vínculos"
          subtitulo={`${vinculos.length} vínculo(s) activo(s) en total`}
          icono="link"
        />

        {!mostrarFormulario ? (
          <BotonNitro
            titulo="Nuevo vínculo"
            icono="add"
            variante="oscuro"
            onPress={() => setMostrarFormulario(true)}
            style={styles.botonNuevo}
          />
        ) : (
          <View style={styles.formulario}>
            <Text style={styles.formTitulo}>Vincular vehículo</Text>

            <Text style={styles.etiqueta}>Vehículo</Text>
            {vehiculos.length === 0 ? (
              <Text style={styles.ayuda}>No hay vehículos registrados.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {vehiculos.map((v) => (
                  <Pressable
                    key={v.id}
                    style={[styles.chip, vehiculoId === v.id && styles.chipActivo]}
                    onPress={() => setVehiculoId(v.id)}
                  >
                    <Text
                      style={[
                        styles.chipTexto,
                        vehiculoId === v.id && styles.chipTextoActivo,
                      ]}
                    >
                      {v.placa || v.id.slice(0, 6)} · {v.marca}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Text style={styles.etiqueta}>Aseguradora</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {organizaciones.map((o) => (
                <Pressable
                  key={o.id}
                  style={[styles.chip, orgId === o.id && styles.chipActivo]}
                  onPress={() => setOrgId(o.id)}
                >
                  <Text
                    style={[
                      styles.chipTexto,
                      orgId === o.id && styles.chipTextoActivo,
                    ]}
                    numberOfLines={1}
                  >
                    {o.nombre}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.etiqueta}>Producto</Text>
            <TextInput
              style={styles.input}
              value={producto}
              onChangeText={setProducto}
              placeholder="Todo riesgo, SOAT, etc."
              placeholderTextColor="#94A3B8"
            />

            <View style={styles.filaDoble}>
              <View style={styles.mitad}>
                <Text style={styles.etiqueta}>Póliza (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={poliza}
                  onChangeText={setPoliza}
                  placeholder="POL-2026-0001"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={styles.mitad}>
                <Text style={styles.etiqueta}>Vence (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={vigencia}
                  onChangeText={setVigencia}
                  placeholder="2026-12-31"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <Pressable
              style={styles.consentimiento}
              onPress={() => setDatosVisibles((v) => !v)}
            >
              <Ionicons
                name={datosVisibles ? 'checkbox' : 'square-outline'}
                size={20}
                color={datosVisibles ? paleta.primario : paleta.textoSuave}
              />
              <Text style={styles.consentimientoTexto}>
                Mostrar nombre, correo y teléfono del propietario a la aseguradora
              </Text>
            </Pressable>

            <View style={styles.formAcciones}>
              <BotonNitro
                titulo="Crear vínculo"
                icono="link-outline"
                onPress={crear}
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
        )}

        <Text style={styles.seccionTitulo}>Vínculos existentes ({vinculos.length})</Text>

        <View style={styles.lista}>
          {vinculos.length === 0 ? (
            <Text style={styles.vacio}>Aún no hay vínculos creados.</Text>
          ) : (
            vinculos.map((v) => (
              <View key={v.id} style={styles.tarjeta}>
                <View style={styles.tarjetaCabecera}>
                  <Text style={styles.tarjetaTitulo}>
                    {v.placa || v.vehiculoId.slice(0, 8)} · {v.marca} {v.modelo}
                  </Text>
                  <View style={[styles.estado, { borderColor: paleta.primario }]}>
                    <Text style={[styles.estadoTexto, { color: paleta.primario }]}>
                      {ETIQUETA_ESTADO_VINCULO[v.estado]}
                    </Text>
                  </View>
                </View>
                <Text style={styles.tarjetaLinea}>
                  {organizaciones.find((o) => o.id === v.orgId)?.nombre ?? v.orgId}
                </Text>
                <Text style={styles.tarjetaLinea}>
                  {v.producto}
                  {v.poliza ? ` · Póliza ${v.poliza}` : ''}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    pantalla: { flex: 1, backgroundColor: Paleta.fondo },
    contenido: { paddingBottom: 44 },
    botonNuevo: { marginHorizontal: 16, marginTop: -24 },
    formulario: {
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.tarjeta,
      padding: 18,
      marginHorizontal: 16,
      marginTop: -24,
      gap: 4,
      ...Sombras.suave,
    },
    formTitulo: {
      fontSize: 17,
      fontWeight: '900',
      color: Paleta.texto,
      marginBottom: 6,
    },
    etiqueta: {
      fontSize: 12,
      fontWeight: '800',
      color: Paleta.textoSecundario,
      marginTop: 10,
      marginBottom: 4,
    },
    ayuda: { fontSize: 12, color: Paleta.textoSuave },
    chips: { gap: 8, paddingVertical: 2, flexDirection: 'row', flexWrap: 'wrap' },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radios.pastilla,
      borderWidth: 1.5,
      borderColor: Paleta.borde,
      backgroundColor: Paleta.fondo,
      maxWidth: 220,
    },
    chipActivo: { backgroundColor: Paleta.primario, borderColor: Paleta.primario },
    chipTexto: { fontSize: 12, fontWeight: '800', color: Paleta.textoSecundario },
    chipTextoActivo: { color: Paleta.blanco },
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
    filaDoble: { flexDirection: 'row', gap: 10 },
    mitad: { flex: 1 },
    consentimiento: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
    },
    consentimientoTexto: {
      flex: 1,
      fontSize: 12.5,
      color: Paleta.textoSecundario,
    },
    formAcciones: { flexDirection: 'row', gap: 10, marginTop: 18 },
    botonForm: { flex: 1 },
    seccionTitulo: {
      fontSize: 15,
      fontWeight: '900',
      color: Paleta.texto,
      marginHorizontal: 16,
      marginTop: 24,
    },
    lista: { padding: 16, gap: 12 },
    vacio: {
      fontSize: 13,
      color: Paleta.textoSecundario,
      textAlign: 'center',
      marginTop: 16,
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
    tarjetaTitulo: {
      fontSize: 14.5,
      fontWeight: '900',
      color: Paleta.texto,
      flexShrink: 1,
    },
    tarjetaLinea: { fontSize: 12.5, color: Paleta.textoSecundario },
    estado: {
      borderWidth: 1.5,
      borderRadius: Radios.pastilla,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    estadoTexto: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  });

/*
=======================================================
NITRO SYNC - MODAL DE RENOVACIÓN (ASEGURADORA)
=======================================================

Ventana reutilizable para renovar el seguro de un vehículo
desde la ficha/tarjeta del panel de aseguradora.

Pide:

  - número de póliza (se propone uno automáticamente);
  - fecha de inicio de la nueva vigencia;
  - nuevo vencimiento;
  - prima (opcional).

Al confirmar:

  1. Actualiza la póliza en `policies` (services/polizas.ts).
  2. Actualiza SOLO los campos del seguro del vehículo.
  3. Registra la acción en la auditoría (`auditLogs`).

La clave de la aseguradora (`aseguradoraClave`) nunca se
toca: el vehículo ya pertenece a esta aseguradora.

El formulario vive en un componente interno que se monta
solo cuando la ventana está abierta, así los campos se
inicializan con `useState` (sin efectos que provoquen
renders en cascada).
=======================================================
*/

import { useState } from 'react';

import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import BotonNitro from '@/components/ui/boton-nitro';
import SelectorFecha from '@/components/ui/selector-fecha';
import { useAlerta } from '@/components/ui/confirm-dialog';
import { etiquetaEstadoSeguro } from '@/components/aseguradora/tarjeta-vehiculo';
import { claveAseguradora } from '@/data/aseguradoras';
import { registrarAuditoria } from '@/services/auditoria';
import { renovarSeguro } from '@/services/polizas';
import { estadoSeguro, generarNumeroPoliza, unAnioDespues } from '@/utils/admin';
import { esFechaISOValida, hoyISO } from '@/utils/fechas';

import type { VehiculoAdmin } from '@/types/models';

interface Props {
  visible: boolean;
  vehiculo: VehiculoAdmin | null;
  onCerrar: () => void;
  onRenovado?: (vehiculo: VehiculoAdmin) => void;
}

export default function ModalRenovar({
  visible,
  vehiculo,
  onCerrar,
  onRenovado,
}: Props) {
  return (
    <Modal
      visible={visible && !!vehiculo}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCerrar}
    >
      {vehiculo ? (
        <ContenidoRenovar
          key={vehiculo.id}
          vehiculo={vehiculo}
          onCerrar={onCerrar}
          onRenovado={onRenovado}
        />
      ) : null}
    </Modal>
  );
}

/* -------------------------------------------------------
   FORMULARIO (se monta al abrir la ventana)
   ------------------------------------------------------- */

interface ContenidoProps {
  vehiculo: VehiculoAdmin;
  onCerrar: () => void;
  onRenovado?: (vehiculo: VehiculoAdmin) => void;
}

function ContenidoRenovar({ vehiculo, onCerrar, onRenovado }: ContenidoProps) {
  const { user, orgId, organizacion } = useAuth();
  const alerta = useAlerta();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  const clave =
    organizacion?.aseguradoraClave || claveAseguradora(organizacion?.nombre ?? '');
  const nombreAseguradora = organizacion?.nombre ?? vehiculo.aseguradora ?? '';

  /*
  Valores iniciales: el número de póliza actual (o uno nuevo),
  la fecha de hoy como inicio y un año después como
  vencimiento.
  */
  const [numero, setNumero] = useState(
    () =>
      vehiculo.numeroPoliza?.trim() ||
      generarNumeroPoliza(clave || 'SEGURO', vehiculo.placa ?? '')
  );
  const [inicio, setInicio] = useState(hoyISO);
  const [fin, setFin] = useState(unAnioDespues);
  const [prima, setPrima] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cerrar = () => {
    if (guardando) return;
    onCerrar();
  };

  const guardar = async () => {
    if (!orgId || !clave) return;

    const numeroLimpio = numero.trim();

    if (!numeroLimpio) {
      await alerta({
        titulo: 'Falta el número de póliza',
        mensaje: 'Escribe el número de póliza para poder renovar.',
        tipo: 'advertencia',
      });
      return;
    }

    if (!esFechaISOValida(inicio) || !esFechaISOValida(fin)) {
      await alerta({
        titulo: 'Fechas incompletas',
        mensaje: 'Elige la fecha de inicio y el nuevo vencimiento.',
        tipo: 'advertencia',
      });
      return;
    }

    if (fin <= inicio) {
      await alerta({
        titulo: 'Fechas inconsistentes',
        mensaje: 'El nuevo vencimiento debe ser posterior a la fecha de inicio.',
        tipo: 'advertencia',
      });
      return;
    }

    const primaLimpia = prima.replace(/[^\d]/g, '');
    const primaCop = primaLimpia ? Number(primaLimpia) : null;

    setGuardando(true);

    try {
      await renovarSeguro({
        orgId,
        vehiculoId: vehiculo.id,
        propietarioUid: vehiculo.propietarioUid,
        placa: vehiculo.placa ?? '',
        aseguradora: nombreAseguradora,
        numeroPoliza: numeroLimpio,
        vigenciaInicio: inicio,
        vigenciaFin: fin,
        primaCop,
      });

      if (user) {
        void registrarAuditoria({
          actorUid: user.uid,
          actorCorreo: user.email,
          actorRol: 'insurer_admin',
          orgId,
          accion: 'vehiculo.renovar',
          entidad: 'vehiculos',
          entidadId: vehiculo.id,
          detalle: {
            placa: vehiculo.placa ?? '',
            propietarioUid: vehiculo.propietarioUid,
            numeroPoliza: numeroLimpio,
            vigenciaInicio: inicio,
            vigenciaFin: fin,
            primaCop,
          },
        });
      }

      await alerta({
        titulo: 'Seguro renovado',
        mensaje: `La póliza ${numeroLimpio} vence el ${fin}. El propietario verá el cambio al instante.`,
        tipo: 'exito',
      });

      onRenovado?.(vehiculo);
      onCerrar();
    } catch (error) {
      /* El error real de Firestore queda en consola para depurar. */
      console.error('[aseguradora] Error al renovar el seguro:', error);
      await alerta({
        titulo: 'No se pudo renovar',
        mensaje:
          'Revisa los datos e inténtalo de nuevo. Si el problema continúa, verifica las reglas de Firestore.',
        tipo: 'error',
      });
    } finally {
      setGuardando(false);
    }
  };

  const estado = estadoSeguro(vehiculo);

  return (
    <KeyboardAvoidingView
      style={styles.fondo}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.tarjeta}>
        <View style={styles.cabecera}>
          <View style={styles.cabeceraTexto}>
            <Text style={styles.titulo}>Renovar seguro</Text>
            <Text style={styles.subtitulo} numberOfLines={1}>
              {vehiculo.marca} {vehiculo.modelo}
              {vehiculo.placa ? ` · ${vehiculo.placa}` : ''}
            </Text>
          </View>

          <Pressable
            onPress={cerrar}
            disabled={guardando}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          >
            <Ionicons name="close" size={22} color={paleta.textoSecundario} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.cuerpo}
          contentContainerStyle={styles.cuerpoContenido}
          keyboardShouldPersistTaps="handled"
        >
          {vehiculo.vencimientoSeguro ? (
            <View style={styles.actual}>
              <Ionicons
                name="information-circle-outline"
                size={15}
                color={paleta.textoSuave}
              />
              <Text style={styles.actualTexto}>
                {etiquetaEstadoSeguro(estado)} · vence el{' '}
                {vehiculo.vencimientoSeguro}
              </Text>
            </View>
          ) : null}

          <Text style={styles.etiqueta}>Número de póliza</Text>
          <TextInput
            value={numero}
            onChangeText={setNumero}
            placeholder="Ej: SURA-ABC123-000000"
            placeholderTextColor={paleta.textoSuave}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!guardando}
            style={styles.campo}
          />

          <SelectorFecha
            etiqueta="Inicio de la nueva vigencia"
            valor={inicio}
            onChange={setInicio}
            placeholder="AAAA-MM-DD"
          />

          <SelectorFecha
            etiqueta="Nuevo vencimiento"
            valor={fin}
            onChange={setFin}
            placeholder="AAAA-MM-DD"
            minimo={inicio || undefined}
          />

          <Text style={styles.etiqueta}>Prima (opcional)</Text>
          <TextInput
            value={prima}
            onChangeText={setPrima}
            placeholder="Ej: 850000"
            placeholderTextColor={paleta.textoSuave}
            keyboardType="number-pad"
            editable={!guardando}
            style={styles.campo}
          />
        </ScrollView>

        <View style={styles.pie}>
          <BotonNitro
            titulo="Cancelar"
            variante="secundario"
            tamano="mediano"
            onPress={cerrar}
            deshabilitado={guardando}
            style={styles.botonPie}
          />

          <BotonNitro
            titulo="Renovar"
            icono="refresh"
            tamano="mediano"
            onPress={guardar}
            cargando={guardando}
            style={styles.botonPie}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const crearEstilos = (Paleta: TipoPaleta) =>
  StyleSheet.create({
    fondo: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    tarjeta: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '90%',
      backgroundColor: Paleta.tarjeta,
      borderRadius: Radios.grande,
      borderWidth: 2,
      borderColor: Paleta.bordeDuro,
      overflow: 'hidden',
      ...Sombras.flotante,
    },
    cabecera: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: Paleta.borde,
    },
    cabeceraTexto: { flex: 1 },
    titulo: { fontSize: 18, fontWeight: '900', color: Paleta.texto },
    subtitulo: {
      fontSize: 13,
      color: Paleta.textoSecundario,
      fontWeight: '600',
      marginTop: 2,
    },
    cuerpo: { flexGrow: 0 },
    cuerpoContenido: { padding: 18, gap: 14 },
    actual: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Paleta.primarioClaro,
      borderRadius: Radios.suave,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    actualTexto: { fontSize: 12.5, color: Paleta.textoSecundario, flexShrink: 1 },
    etiqueta: {
      fontSize: 13,
      fontWeight: '700',
      color: Paleta.textoSecundario,
    },
    campo: {
      minHeight: 50,
      borderWidth: 1,
      borderColor: Paleta.borde,
      borderRadius: Radios.suave,
      backgroundColor: Paleta.tarjeta,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      fontWeight: '600',
      color: Paleta.texto,
    },
    pie: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: Paleta.borde,
    },
    botonPie: { flex: 1 },
  });

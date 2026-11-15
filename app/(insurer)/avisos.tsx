/*
=======================================================
NITRO SYNC - PANEL ASEGURADORA · AVISOS
=======================================================

Historial de avisos (`notificationLogs`) y envío de un
aviso nuevo por WhatsApp.

El envío es MANUAL: la app no tiene credenciales de Meta,
así que prepara un enlace `wa.me` con el mensaje ya
redactado. La aseguradora lo abre y lo envía desde su
propio número.

Los avisos COMERCIALES (promocionar planes) solo se
preparan si el propietario otorgó el consentimiento
comercial; si no, quedan registrados como `omitido`.
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
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Paleta, Radios, Sombras } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta } from '@/components/ui/confirm-dialog';
import { suscribirVinculosOrg } from '@/services/vinculos';
import { suscribirConsentimientosOrg } from '@/services/consentimientos';
import {
  abrirWhatsapp,
  PLANTILLAS,
  prepararAvisoWhatsapp,
  suscribirAvisosOrg,
  type PlantillaWhatsapp,
} from '@/services/whatsapp';
import { registrarAuditoria } from '@/services/auditoria';
import type {
  Consentimiento,
  RegistroNotificacion,
  VinculoAseguradora,
} from '@/types/negocio';

const OPCIONES: PlantillaWhatsapp[] = [
  'recordatorio_seguro',
  'renovacion',
  'oferta_comercial',
];

const ETIQUETA_ESTADO_AVISO: Record<string, string> = {
  pendiente: 'Pendiente',
  manual: 'Manual',
  enviado: 'Enviado',
  fallido: 'Fallido',
  omitido: 'Omitido',
};

function colorAviso(estado: string) {
  switch (estado) {
    case 'enviado':
      return Paleta.exito;
    case 'manual':
      return Paleta.primario;
    case 'fallido':
      return Paleta.peligro;
    case 'omitido':
      return Paleta.advertencia;
    default:
      return Paleta.textoSuave;
  }
}

export default function AvisosAseguradora() {
  const { user, orgId, organizacion } = useAuth();
  const alerta = useAlerta();

  const [avisos, setAvisos] = useState<RegistroNotificacion[]>([]);
  const [vinculos, setVinculos] = useState<VinculoAseguradora[]>([]);
  const [consentimientos, setConsentimientos] = useState<Consentimiento[]>([]);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [vinculoId, setVinculoId] = useState<string | null>(null);
  const [plantilla, setPlantilla] = useState<PlantillaWhatsapp>('recordatorio_seguro');

  useEffect(() => {
    if (!orgId) return;

    const pararAvisos = suscribirAvisosOrg(orgId, setAvisos);
    const pararVinculos = suscribirVinculosOrg(orgId, (lista) =>
      setVinculos(lista.filter((v) => v.estado === 'activo'))
    );
    const pararConsentimientos = suscribirConsentimientosOrg(
      orgId,
      setConsentimientos
    );

    return () => {
      pararAvisos();
      pararVinculos();
      pararConsentimientos();
    };
  }, [orgId]);

  /* Vehículos con consentimiento comercial vigente. */
  const conOptInComercial = useMemo(() => {
    const set = new Set<string>();

    consentimientos
      .filter((c) => c.finalidad === 'comercial' && c.estado === 'otorgado')
      .forEach((c) => set.add(c.vehiculoId));

    return set;
  }, [consentimientos]);

  const vinculo = useMemo(
    () => vinculos.find((v) => v.id === vinculoId) ?? null,
    [vinculos, vinculoId]
  );

  const enviar = async () => {
    if (!user) return;

    if (!vinculo) {
      await alerta({
        titulo: 'Falta el vehículo',
        mensaje: 'Selecciona el vehículo al que enviarás el aviso.',
        tipo: 'advertencia',
      });
      return;
    }

    const optIn = conOptInComercial.has(vinculo.vehiculoId);

    try {
      setEnviando(true);

      const resultado = await prepararAvisoWhatsapp({
        orgId,
        propietarioUid: vinculo.propietarioUid,
        vehiculoId: vinculo.vehiculoId,
        destino: vinculo.propietarioTelefono,
        plantilla,
        variables: {
          propietario: vinculo.propietarioNombre ?? 'estimado cliente',
          aseguradora: organizacion?.nombre ?? 'tu aseguradora',
          vehiculo: `${vinculo.marca} ${vinculo.modelo} (${vinculo.placa})`,
          fecha: vinculo.vigencia ?? 'pronto',
        },
        referencia: vinculo.id,
        fecha: new Date().toISOString().slice(0, 10),
        optInComercial: optIn,
      });

      await registrarAuditoria({
        actorUid: user.uid,
        actorCorreo: user.email,
        actorRol: 'insurer_admin',
        orgId,
        accion: 'aviso.preparar',
        entidad: 'notificationLogs',
        entidadId: vinculo.id,
        detalle: { plantilla, estado: resultado.estado },
      });

      if (!resultado.enlace) {
        await alerta({
          titulo: 'Aviso no enviado',
          mensaje:
            resultado.motivo === 'sin_telefono'
              ? 'El propietario no autorizó compartir su teléfono.'
              : resultado.motivo === 'sin_opt_in_comercial'
                ? 'El propietario no autorizó comunicaciones comerciales.'
                : 'No se pudo preparar el aviso.',
          tipo: 'advertencia',
        });
        return;
      }

      const abierto = await abrirWhatsapp(resultado.enlace);

      await alerta({
        titulo: abierto ? 'WhatsApp abierto' : 'Enlace listo',
        mensaje: abierto
          ? 'Envía el mensaje desde tu WhatsApp para completar el aviso.'
          : 'Copia el enlace y ábrelo desde tu dispositivo.',
        tipo: 'exito',
      });

      setMostrarFormulario(false);
      setVinculoId(null);
    } catch {
      await alerta({
        titulo: 'No se pudo preparar el aviso',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <EncabezadoPanel
          etiqueta="PANEL DE ASEGURADORA"
          titulo="Avisos por WhatsApp"
          subtitulo={organizacion?.nombre ?? null}
          icono="chatbubbles"
        />

        {!mostrarFormulario ? (
          <BotonNitro
            titulo="Nuevo aviso"
            icono="add"
            variante="oscuro"
            onPress={() => setMostrarFormulario(true)}
            style={styles.botonNuevo}
          />
        ) : (
          <View style={styles.formulario}>
            <Text style={styles.formTitulo}>Preparar aviso</Text>

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
                      {v.placa || v.vehiculoId.slice(0, 6)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Text style={styles.etiqueta}>Motivo</Text>
            <View style={styles.opciones}>
              {OPCIONES.map((opcion) => {
                const comercial = PLANTILLAS[opcion].requiereOptIn;

                return (
                  <Pressable
                    key={opcion}
                    style={[
                      styles.opcion,
                      plantilla === opcion && styles.opcionActiva,
                    ]}
                    onPress={() => setPlantilla(opcion)}
                  >
                    <View style={styles.opcionTextos}>
                      <Text
                        style={[
                          styles.opcionTitulo,
                          plantilla === opcion && styles.opcionTituloActivo,
                        ]}
                      >
                        {PLANTILLAS[opcion].titulo}
                      </Text>
                      {comercial ? (
                        <Text style={styles.opcionNota}>
                          Requiere consentimiento comercial
                        </Text>
                      ) : null}
                    </View>

                    {plantilla === opcion ? (
                      <Ionicons
                        name="radio-button-on"
                        size={18}
                        color={Paleta.acento}
                      />
                    ) : (
                      <Ionicons
                        name="radio-button-off"
                        size={18}
                        color={Paleta.textoSuave}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.formAcciones}>
              <BotonNitro
                titulo="Preparar"
                icono="logo-whatsapp"
                onPress={enviar}
                cargando={enviando}
                style={styles.botonForm}
              />
              <BotonNitro
                titulo="Cancelar"
                variante="secundario"
                onPress={() => {
                  setMostrarFormulario(false);
                  setVinculoId(null);
                }}
                style={styles.botonForm}
              />
            </View>
          </View>
        )}

        <Text style={styles.seccionTitulo}>Historial ({avisos.length})</Text>

        <View style={styles.lista}>
          {avisos.length === 0 ? (
            <Text style={styles.vacio}>Aún no hay avisos registrados.</Text>
          ) : (
            avisos.map((aviso) => (
              <View key={aviso.id} style={styles.tarjeta}>
                <View style={styles.tarjetaCabecera}>
                  <Text style={styles.tarjetaTitulo}>
                    {PLANTILLAS[aviso.plantilla as PlantillaWhatsapp]?.titulo ??
                      aviso.plantilla}
                  </Text>
                  <View
                    style={[
                      styles.estado,
                      { borderColor: colorAviso(aviso.estado) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.estadoTexto,
                        { color: colorAviso(aviso.estado) },
                      ]}
                    >
                      {ETIQUETA_ESTADO_AVISO[aviso.estado] ?? aviso.estado}
                    </Text>
                  </View>
                </View>

                <Text style={styles.tarjetaLinea}>
                  {new Date(aviso.creadoEn).toLocaleString('es-CO')}
                </Text>

                {aviso.destino ? (
                  <Text style={styles.tarjetaLinea}>Destino: {aviso.destino}</Text>
                ) : null}

                {aviso.motivo ? (
                  <Text style={styles.motivo}>Motivo: {aviso.motivo}</Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: Paleta.fondo },
  contenido: { paddingBottom: 44 },
  botonNuevo: { marginHorizontal: 16, marginTop: -24 },
  formulario: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    padding: 18,
    marginHorizontal: 16,
    marginTop: -24,
    gap: 6,
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
    marginTop: 8,
    marginBottom: 4,
  },
  ayuda: { fontSize: 12, color: Paleta.textoSuave },
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
  opciones: { gap: 8 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1.5,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Paleta.fondo,
  },
  opcionActiva: { borderColor: Paleta.tinta, backgroundColor: Paleta.tinta },
  opcionTextos: { flex: 1 },
  opcionTitulo: { fontSize: 13.5, fontWeight: '800', color: Paleta.texto },
  opcionTituloActivo: { color: Paleta.acento },
  opcionNota: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  formAcciones: { flexDirection: 'row', gap: 10, marginTop: 16 },
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
  motivo: { fontSize: 12, color: Paleta.advertencia, fontWeight: '700' },
  estado: {
    borderWidth: 1.5,
    borderRadius: Radios.pastilla,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  estadoTexto: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
});

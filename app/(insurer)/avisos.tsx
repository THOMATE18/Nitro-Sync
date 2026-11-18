/*
=======================================================
NITRO SYNC - PANEL ASEGURADORA · AVISOS
=======================================================

Tres bloques:

  1. RENOVACIONES PRÓXIMAS -> vehículos con el seguro de
     la aseguradora que vencen dentro del umbral, con su
     autorización operativa y un botón de contacto directo
     por WhatsApp.
  2. TAREA PROGRAMADA -> prepara los recordatorios de
     renovación por correo (proveedor mock) y por WhatsApp
     (enlaces `wa.me`). Solo avisa si el propietario
     autorizó sus datos.
  3. HISTORIAL -> avisos registrados en `notificationLogs`,
     con el canal (Correo / WhatsApp) y su estado.

Los vehículos se leen con `suscribirVehiculosAseguradora`:
la aseguradora SOLO ve los suyos (nunca descarga todo ni
filtra en el cliente).

El envío es MANUAL: la app no tiene credenciales de Meta ni
de correo, así que prepara el mensaje y lo registra como
`manual` (nunca como `enviado`).

Los avisos COMERCIALES (promocionar planes) solo se
preparan si el propietario otorgó el consentimiento
comercial; si no, quedan registrados como `omitido`.
=======================================================
*/

import { useCallback, useEffect, useMemo, useState } from 'react';

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

import { Radios, Sombras, type TipoPaleta } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEstilos, useTema } from '@/context/TemaContext';
import EncabezadoPanel from '@/components/ui/encabezado-panel';
import BotonNitro from '@/components/ui/boton-nitro';
import { useAlerta } from '@/components/ui/confirm-dialog';
import { claveAseguradora } from '@/data/aseguradoras';
import { suscribirVehiculosAseguradora } from '@/services/vehiculosAseguradora';
import { suscribirConsentimientosOrg } from '@/services/consentimientos';
import {
  abrirWhatsapp,
  PLANTILLAS,
  prepararAvisoWhatsapp,
  suscribirAvisosOrg,
  type PlantillaWhatsapp,
} from '@/services/whatsapp';
import {
  diasHasta,
  ejecutarRecordatoriosRenovacion,
  renovacionesProximas,
  tieneAutorizacionOperativa,
  UMBRAL_DIAS_DEFAULT,
} from '@/services/avisosRenovacion';
import { registrarAuditoria } from '@/services/auditoria';
import { enlaceWhatsApp, mensajeContacto } from '@/utils/contacto';
import {
  ETIQUETA_CANAL,
  type Consentimiento,
  type RegistroNotificacion,
} from '@/types/negocio';
import type { VehiculoAdmin } from '@/types/models';

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

const ETIQUETA_PLANTILLA: Record<string, string> = {
  recordatorio_soat: 'Recordatorio SOAT',
  recordatorio_seguro: 'Recordatorio de seguro',
  renovacion: 'Renovación de póliza',
  renovacion_email: 'Renovación por correo',
  oferta_comercial: 'Oferta comercial',
};

function colorAviso(Paleta: TipoPaleta, estado: string) {
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
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  /*
  Clave automática de la aseguradora: sale del documento de la
  organización y, si viniera vacía, se deriva del nombre.
  */
  const clave =
    organizacion?.aseguradoraClave || claveAseguradora(organizacion?.nombre ?? '');

  const [avisos, setAvisos] = useState<RegistroNotificacion[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoAdmin[]>([]);
  const [consentimientos, setConsentimientos] = useState<Consentimiento[]>([]);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [vehiculoId, setVehiculoId] = useState<string | null>(null);
  const [plantilla, setPlantilla] = useState<PlantillaWhatsapp>('recordatorio_seguro');

  useEffect(() => {
    if (!orgId) return;

    const pararAvisos = suscribirAvisosOrg(orgId, setAvisos);
    const pararConsentimientos = suscribirConsentimientosOrg(
      orgId,
      setConsentimientos
    );

    return () => {
      pararAvisos();
      pararConsentimientos();
    };
  }, [orgId]);

  useEffect(() => {
    if (!clave) return;

    return suscribirVehiculosAseguradora(clave, setVehiculos, (error) => {
      /* El error real de Firestore queda en consola para depurar. */
      console.error(
        '[aseguradora] Error al leer los vehículos por aseguradoraClave:',
        error
      );
    });
  }, [clave]);

  /* Vehículos con consentimiento comercial vigente. */
  const conOptInComercial = useMemo(() => {
    const set = new Set<string>();

    consentimientos
      .filter((c) => c.finalidad === 'comercial' && c.estado === 'otorgado')
      .forEach((c) => set.add(c.vehiculoId));

    return set;
  }, [consentimientos]);

  const vehiculo = useMemo(
    () => vehiculos.find((v) => v.id === vehiculoId) ?? null,
    [vehiculos, vehiculoId]
  );

  /*
  Vehículos cuya vigencia vence dentro del umbral, con la
  indicación de si el propietario autorizó el uso operativo
  de sus datos para esta organización.
  */
  const proximas = useMemo(
    () =>
      renovacionesProximas(vehiculos, UMBRAL_DIAS_DEFAULT).map((v) => ({
        vehiculo: v,
        dias: diasHasta(v.vencimientoSeguro),
        autorizado: tieneAutorizacionOperativa(
          consentimientos,
          v.id,
          orgId ?? ''
        ),
      })),
    [vehiculos, consentimientos, orgId]
  );

  /* Contacto directo por WhatsApp (mismo constructor de enlaces). */
  const contactar = useCallback(
    async (v: VehiculoAdmin) => {
      const telefono = v.contactoPropietario?.telefono ?? '';
      const enlace = enlaceWhatsApp(telefono, mensajeContacto(v));

      if (!enlace) {
        await alerta({
          titulo: 'Sin teléfono',
          mensaje: 'El propietario no tiene un teléfono registrado.',
          tipo: 'advertencia',
        });
        return;
      }

      if (user) {
        void registrarAuditoria({
          actorUid: user.uid,
          actorCorreo: user.email,
          actorRol: 'insurer_admin',
          orgId,
          accion: 'vehiculo.contactar',
          entidad: 'vehiculos',
          entidadId: v.id,
          detalle: { placa: v.placa ?? '', propietarioUid: v.propietarioUid },
        });
      }

      await abrirWhatsapp(enlace);
    },
    [alerta, orgId, user]
  );

  /*
  Tarea programada: prepara los recordatorios de renovación
  (correo mock + enlaces de WhatsApp) y evita duplicados del
  mismo día. Muestra un resumen al terminar.
  */
  const ejecutarTarea = async () => {
    if (!user || !orgId) return;

    try {
      setEjecutando(true);

      const resumen = await ejecutarRecordatoriosRenovacion({
        orgId,
        organizacionNombre: organizacion?.nombre ?? 'tu aseguradora',
        vehiculos,
        consentimientos,
        avisosExistentes: avisos,
      });

      await registrarAuditoria({
        actorUid: user.uid,
        actorCorreo: user.email,
        actorRol: 'insurer_admin',
        orgId,
        accion: 'aviso.renovacion.ejecutar',
        entidad: 'notificationLogs',
        entidadId: orgId,
        detalle: {
          proximos: resumen.proximos,
          correos: resumen.correosPreparados,
          whatsapp: resumen.whatsappPreparados,
          omitidos: resumen.correosOmitidos + resumen.whatsappOmitidos,
          duplicados: resumen.duplicados,
          sinAutorizacion: resumen.sinAutorizacion,
        },
      });

      const lineas = [
        `Vencen pronto: ${resumen.proximos}`,
        `Con autorización: ${resumen.autorizados}`,
        `Sin autorización: ${resumen.sinAutorizacion}`,
        `Correos preparados: ${resumen.correosPreparados}`,
        `WhatsApp preparados: ${resumen.whatsappPreparados}`,
        `Omitidos: ${resumen.correosOmitidos + resumen.whatsappOmitidos}`,
        `Ya registrados hoy: ${resumen.duplicados}`,
      ];

      await alerta({
        titulo:
          resumen.proximos === 0
            ? 'Sin renovaciones próximas'
            : 'Tarea ejecutada',
        mensaje: lineas.join('\n'),
        tipo: resumen.proximos === 0 ? 'info' : 'exito',
      });
    } catch {
      await alerta({
        titulo: 'No se pudo ejecutar',
        mensaje: 'Intenta de nuevo en unos segundos.',
        tipo: 'error',
      });
    } finally {
      setEjecutando(false);
    }
  };

  const enviar = async () => {
    if (!user) return;

    if (!vehiculo) {
      await alerta({
        titulo: 'Falta el vehículo',
        mensaje: 'Selecciona el vehículo al que enviarás el aviso.',
        tipo: 'advertencia',
      });
      return;
    }

    const optIn = conOptInComercial.has(vehiculo.id);

    try {
      setEnviando(true);

      const resultado = await prepararAvisoWhatsapp({
        orgId,
        propietarioUid: vehiculo.propietarioUid,
        vehiculoId: vehiculo.id,
        destino: vehiculo.contactoPropietario?.telefono ?? '',
        plantilla,
        variables: {
          propietario: vehiculo.contactoPropietario?.nombre?.trim() || 'estimado cliente',
          aseguradora: organizacion?.nombre ?? 'tu aseguradora',
          vehiculo: `${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.placa})`,
          fecha: vehiculo.vencimientoSeguro ?? 'pronto',
        },
        referencia: vehiculo.id,
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
        entidadId: vehiculo.id,
        detalle: { plantilla, estado: resultado.estado },
      });

      if (!resultado.enlace) {
        await alerta({
          titulo: 'Aviso no enviado',
          mensaje:
            resultado.motivo === 'sin_telefono'
              ? 'El propietario no tiene un teléfono registrado.'
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
      setVehiculoId(null);
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

            <Text style={styles.etiqueta}>Vehículo con tu seguro</Text>
            {!clave ? (
              <Text style={styles.ayuda}>
                No pudimos identificar tu aseguradora. Verifica que el nombre de
                la organización esté completo o contacta al soporte de Nitro Sync.
              </Text>
            ) : vehiculos.length === 0 ? (
              <Text style={styles.ayuda}>
                Aún no hay vehículos con tu seguro. Aparecerán cuando un
                propietario registre una póliza con tu aseguradora.
              </Text>
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
                      {v.placa || v.id.slice(0, 6)}
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
                        color={paleta.acento}
                      />
                    ) : (
                      <Ionicons
                        name="radio-button-off"
                        size={18}
                        color={paleta.textoSuave}
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
                  setVehiculoId(null);
                }}
                style={styles.botonForm}
              />
            </View>
          </View>
        )}

        <View style={styles.renovaciones}>
          <View style={styles.renovacionesCabecera}>
            <View style={styles.renovacionesIcono}>
              <Ionicons name="time-outline" size={20} color={paleta.acento} />
            </View>

            <View style={styles.renovacionesTextos}>
              <Text style={styles.renovacionesTitulo}>Renovaciones próximas</Text>
              <Text style={styles.renovacionesSubtitulo}>
                Vencen en los próximos {UMBRAL_DIAS_DEFAULT} días
              </Text>
            </View>

            <View style={styles.contador}>
              <Text style={styles.contadorTexto}>{proximas.length}</Text>
            </View>
          </View>

          {proximas.length === 0 ? (
            <Text style={styles.renovacionesVacio}>
              Ningún vehículo con tu seguro vence pronto.
            </Text>
          ) : (
            <View style={styles.renovacionesLista}>
              {proximas.map(({ vehiculo: v, dias, autorizado }) => (
                <View key={v.id} style={styles.renovacionFila}>
                  <View style={styles.renovacionInfo}>
                    <Text style={styles.renovacionPlaca}>
                      {v.placa || v.id.slice(0, 6)}
                    </Text>
                    <Text style={styles.renovacionDetalle}>
                      {v.marca} {v.modelo} · vence {v.vencimientoSeguro ?? 'sin fecha'}
                    </Text>

                    <Pressable
                      style={styles.contacto}
                      onPress={() => contactar(v)}
                      accessibilityRole="button"
                      accessibilityLabel="Contactar por WhatsApp"
                    >
                      <Ionicons name="logo-whatsapp" size={14} color={paleta.primario} />
                      <Text style={styles.contactoTexto}>Contactar por WhatsApp</Text>
                    </Pressable>
                  </View>

                  <View style={styles.renovacionEstado}>
                    <Text
                      style={[
                        styles.renovacionDias,
                        dias !== null && dias <= 7 && styles.renovacionDiasUrgente,
                      ]}
                    >
                      {dias === null ? '—' : dias === 0 ? 'Hoy' : `${dias} d`}
                    </Text>
                    <Text
                      style={[
                        styles.renovacionAutorizado,
                        autorizado
                          ? styles.renovacionAutorizadoSi
                          : styles.renovacionAutorizadoNo,
                      ]}
                    >
                      {autorizado ? 'Autorizado' : 'Sin autorización'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <BotonNitro
            titulo="Ejecutar tarea programada"
            icono="refresh"
            variante="oscuro"
            onPress={ejecutarTarea}
            cargando={ejecutando}
            deshabilitado={proximas.length === 0}
            style={styles.botonTarea}
          />

          <Text style={styles.renovacionesNota}>
            El correo se registra como omitido (la aseguradora no ve el correo
            del propietario) y el WhatsApp como enlace para enviar a mano. Solo
            se avisa si el propietario autorizó sus datos.
          </Text>
        </View>

        <Text style={styles.seccionTitulo}>Historial ({avisos.length})</Text>

        <View style={styles.lista}>
          {avisos.length === 0 ? (
            <Text style={styles.vacio}>Aún no hay avisos registrados.</Text>
          ) : (
            avisos.map((aviso) => (
              <View key={aviso.id} style={styles.tarjeta}>
                <View style={styles.tarjetaCabecera}>
                  <View style={styles.tarjetaTituloCaja}>
                    <Text style={styles.tarjetaTitulo}>
                      {ETIQUETA_PLANTILLA[aviso.plantilla] ?? aviso.plantilla}
                    </Text>

                    <View style={styles.canalBadge}>
                      <Ionicons
                        name={
                          aviso.canal === 'email'
                            ? 'mail-outline'
                            : aviso.canal === 'local'
                              ? 'notifications-outline'
                              : 'logo-whatsapp'
                        }
                        size={11}
                        color={paleta.textoSecundario}
                      />
                      <Text style={styles.canalTexto}>
                        {ETIQUETA_CANAL[aviso.canal] ?? aviso.canal}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.estado,
                      { borderColor: colorAviso(paleta, aviso.estado) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.estadoTexto,
                        { color: colorAviso(paleta, aviso.estado) },
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

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
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
  opcionActiva: { borderColor: Paleta.bordeDuro, backgroundColor: Paleta.tinta },
  opcionTextos: { flex: 1 },
  opcionTitulo: { fontSize: 13.5, fontWeight: '800', color: Paleta.texto },
  opcionTituloActivo: { color: Paleta.acento },
  opcionNota: { fontSize: 11, color: Paleta.textoSuave, marginTop: 2 },
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

  /* Renovaciones próximas */
  renovaciones: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.tarjeta,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 24,
    gap: 12,
    ...Sombras.suave,
  },
  renovacionesCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  renovacionesIcono: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Paleta.tinta,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
  },
  renovacionesTextos: { flex: 1 },
  renovacionesTitulo: { fontSize: 15, fontWeight: '900', color: Paleta.texto },
  renovacionesSubtitulo: {
    fontSize: 12,
    color: Paleta.textoSecundario,
    marginTop: 2,
  },
  contador: {
    minWidth: 34,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radios.pastilla,
    backgroundColor: Paleta.acento,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    alignItems: 'center',
  },
  contadorTexto: { fontSize: 14, fontWeight: '900', color: Paleta.tinta },
  renovacionesVacio: {
    fontSize: 13,
    color: Paleta.textoSecundario,
    textAlign: 'center',
  },
  renovacionesLista: { gap: 8 },
  renovacionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1.5,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Paleta.fondo,
  },
  renovacionInfo: { flex: 1, gap: 4 },
  renovacionPlaca: { fontSize: 13.5, fontWeight: '900', color: Paleta.texto },
  renovacionDetalle: { fontSize: 11.5, color: Paleta.textoSecundario },
  contacto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  contactoTexto: { fontSize: 11.5, fontWeight: '800', color: Paleta.primario },
  renovacionEstado: { alignItems: 'flex-end', gap: 4 },
  renovacionDias: { fontSize: 13, fontWeight: '900', color: Paleta.texto },
  renovacionDiasUrgente: { color: Paleta.peligro },
  renovacionAutorizado: { fontSize: 10, fontWeight: '800' },
  renovacionAutorizadoSi: { color: Paleta.exito },
  renovacionAutorizadoNo: { color: Paleta.advertencia },
  botonTarea: { marginTop: 4 },
  renovacionesNota: {
    fontSize: 11.5,
    color: Paleta.textoSuave,
    lineHeight: 17,
  },

  /* Historial: canal y título */
  tarjetaTituloCaja: { flex: 1, gap: 4 },
  canalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radios.pastilla,
    backgroundColor: Paleta.fondo,
    borderWidth: 1,
    borderColor: Paleta.borde,
  },
  canalTexto: { fontSize: 10, fontWeight: '800', color: Paleta.textoSecundario },
});

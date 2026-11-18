/*
=======================================================
NITRO SYNC - PANTALLA DE ACCESO (DOS PASOS)
=======================================================

Primera pantalla de la app (web y móvil). El acceso se
resuelve en DOS PASOS para no abrumar al usuario:

  PASO 1 · ELECCIÓN
    Solo se muestran DOS botones grandes:

      "Ingresar como usuario"      -> propietario o admin
      "Ingresar como aseguradora"  -> cuentas asignadas

  PASO 2 · FORMULARIO
    Al pulsar un botón se muestra SOLO el formulario de esa
    opción (correo + contraseña) con un botón "Volver" para
    regresar a la elección.

DECISIONES DE DISEÑO

- NO existe un acceso separado de administrador: el
  administrador entra por "Ingresar como usuario" y el
  guard del layout raíz lo redirige según el rol de su
  cuenta (propietario, admin o aseguradora).

- El panel de aseguradora NO tiene registro público: las
  cuentas las crea el administrador/seed. Por eso ese
  formulario solo tiene correo, contraseña y el botón, con
  una nota que lo aclara.

- Si una cuenta intenta entrar por el panel equivocado
  (p. ej. una aseguradora por "usuario"), se cierra la
  sesión y se muestra un mensaje indicando por cuál debe
  entrar.

- Las contraseñas usan <CampoContrasena> (botón de ojo).

- "¿Olvidaste tu contraseña?" lleva a /recuperar.

En pantallas angostas las dos opciones se apilan.
=======================================================
*/

import { useState } from 'react';

import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { signInWithEmailAndPassword, signOut } from 'firebase/auth';

import { auth } from '../../firebaseConfig';

import {
  Gradientes,
  Radios,
  sombraDura,
  type TipoPaleta,
} from '@/constants/theme';
import { useEstilos, useTema } from '@/context/TemaContext';

import { resolverSesion } from '@/services/sesion';
import BotonNitro from '@/components/ui/boton-nitro';
import CampoContrasena from '@/components/ui/campo-contrasena';
import { useAlerta } from '@/components/ui/confirm-dialog';

/* Panel desde el que se intenta entrar. */
type Panel = 'usuario' | 'aseguradora';

/* Paso actual del flujo de acceso. */
type Paso = 'seleccion' | Panel;

function mensajeDeError(error: any): string {
  switch (error?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'El correo o la contraseña son incorrectos.';
    case 'auth/invalid-email':
      return 'El correo electrónico no es válido.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos.';
    case 'auth/network-request-failed':
      return 'Sin conexión a internet. Revisa tu red.';
    default:
      return 'No fue posible iniciar sesión.';
  }
}

/* Botón grande de la pantalla de elección. */
function OpcionAcceso({
  titulo,
  subtitulo,
  icono,
  colorIcono,
  fondoIcono,
  onPress,
}: {
  titulo: string;
  subtitulo: string;
  icono: keyof typeof Ionicons.glyphMap;
  colorIcono: string;
  fondoIcono: string;
  onPress: () => void;
}) {
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  return (
    <Pressable
      style={styles.opcion}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={titulo}
    >
      <View style={[styles.opcionIcono, { backgroundColor: fondoIcono }]}>
        <Ionicons name={icono} size={30} color={colorIcono} />
      </View>

      <Text style={styles.opcionTitulo}>{titulo}</Text>
      <Text style={styles.opcionSubtitulo}>{subtitulo}</Text>

      <View style={styles.opcionAccion}>
        <Text style={styles.opcionAccionTexto}>Continuar</Text>
        <Ionicons name="arrow-forward" size={16} color={paleta.acento} />
      </View>
    </Pressable>
  );
}

export default function LoginScreen() {
  const alerta = useAlerta();
  const { width } = useWindowDimensions();
  const styles = useEstilos(crearEstilos);
  const { paleta } = useTema();

  /* En pantallas angostas las opciones se apilan. */
  const apilado = width < 760;

  /* Paso actual: elección o formulario. */
  const [paso, setPaso] = useState<Paso>('seleccion');

  /* Formulario "usuario" */
  const [emailUsuario, setEmailUsuario] = useState('');
  const [passUsuario, setPassUsuario] = useState('');
  const [cargandoUsuario, setCargandoUsuario] = useState(false);

  /* Formulario "aseguradora" */
  const [emailAseg, setEmailAseg] = useState('');
  const [passAseg, setPassAseg] = useState('');
  const [cargandoAseg, setCargandoAseg] = useState(false);

  const iniciarSesion = async ({
    panel,
    email,
    password,
    setCargando,
  }: {
    panel: Panel;
    email: string;
    password: string;
    setCargando: (valor: boolean) => void;
  }) => {
    if (!email.trim() || !password) {
      await alerta({
        titulo: 'Campos incompletos',
        mensaje:
          panel === 'usuario'
            ? 'Ingresa tu correo y contraseña.'
            : 'Ingresa el correo y la contraseña de la aseguradora.',
        tipo: 'advertencia',
      });
      return;
    }

    try {
      setCargando(true);

      const credencial = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const sesion = await resolverSesion(credencial.user);
      const esInsurer =
        sesion.rol === 'insurer_admin' || sesion.rol === 'insurer_agent';

      /*
      Panel equivocado: se cierra la sesión y se indica
      por dónde debe entrar.
      */
      if (panel === 'aseguradora' && !esInsurer) {
        await signOut(auth);
        await alerta({
          titulo: 'Acceso restringido',
          mensaje:
            'Esta cuenta no pertenece a una aseguradora. Entra por "Ingresar como usuario".',
          tipo: 'error',
        });
        return;
      }

      if (panel === 'usuario' && esInsurer) {
        await signOut(auth);
        await alerta({
          titulo: 'Cuenta de aseguradora',
          mensaje:
            'Esta cuenta pertenece a una aseguradora. Entra por "Ingresar como aseguradora".',
          tipo: 'error',
        });
        return;
      }

      /*
      Cuenta correcta: el guard del layout raíz muestra el
      panel que corresponde al rol (o el cambio obligatorio
      de contraseña si aplica).
      */
    } catch (error: any) {
      await alerta({
        titulo: 'Error de inicio de sesión',
        mensaje: mensajeDeError(error),
        tipo: 'error',
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        persistentScrollbar
      >
        {/* =============================================
            HERO
            ============================================= */}
        <LinearGradient
          colors={Gradientes.marca}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View pointerEvents="none" style={styles.heroBurbuja} />

          <Text style={styles.marca}>
            NITRO <Text style={styles.marcaAcento}>SYNC</Text>
          </Text>

          <View style={styles.logoCaja}>
            <Ionicons name="speedometer" size={30} color={paleta.tinta} />
          </View>

          <Text style={styles.titulo}>
            {paso === 'seleccion' ? 'Accede a tu cuenta' : 'Inicia sesión'}
          </Text>

          <Text style={styles.subtitulo}>
            {paso === 'seleccion'
              ? 'Elige cómo quieres entrar. Tu garaje y tus seguros, en un solo lugar.'
              : paso === 'usuario'
                ? 'Ingresa con tu cuenta de propietario o administrador.'
                : 'Ingresa con la cuenta que te asignó el administrador.'}
          </Text>
        </LinearGradient>

        <View style={styles.contenido}>
          {paso === 'seleccion' ? (
            /* =============================================
               PASO 1 · DOS BOTONES GRANDES
               ============================================= */
            <View style={[styles.opciones, apilado && styles.opcionesApiladas]}>
              <OpcionAcceso
                titulo="Ingresar como usuario"
                subtitulo="Propietario o administrador"
                icono="person"
                colorIcono={paleta.primario}
                fondoIcono={paleta.primarioClaro}
                onPress={() => setPaso('usuario')}
              />

              <OpcionAcceso
                titulo="Ingresar como aseguradora"
                subtitulo="Solo cuentas asignadas"
                icono="business"
                colorIcono={paleta.tinta}
                fondoIcono={paleta.acento}
                onPress={() => setPaso('aseguradora')}
              />
            </View>
          ) : (
            /* =============================================
               PASO 2 · FORMULARIO DEL PANEL ELEGIDO
               ============================================= */
            <View style={styles.tarjeta}>
              <Pressable
                style={styles.volver}
                onPress={() => setPaso('seleccion')}
                accessibilityRole="button"
                accessibilityLabel="Volver"
              >
                <Ionicons name="arrow-back" size={16} color={paleta.textoSecundario} />
                <Text style={styles.volverTexto}>Volver</Text>
              </Pressable>

              {paso === 'usuario' ? (
                <>
                  <View style={styles.cabecera}>
                    <View
                      style={[
                        styles.iconoCabecera,
                        { backgroundColor: paleta.primarioClaro },
                      ]}
                    >
                      <Ionicons name="person" size={20} color={paleta.primario} />
                    </View>
                    <View style={styles.cabeceraTextos}>
                      <Text style={styles.tarjetaTitulo}>Ingresar como usuario</Text>
                      <Text style={styles.tarjetaSubtitulo}>
                        Propietario o administrador
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.etiqueta}>Correo electrónico</Text>
                  <View style={styles.inputCaja}>
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={paleta.textoSuave}
                      style={styles.inputIcono}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="tucorreo@ejemplo.com"
                      placeholderTextColor={paleta.textoSuave}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      value={emailUsuario}
                      onChangeText={setEmailUsuario}
                      onSubmitEditing={() =>
                        iniciarSesion({
                          panel: 'usuario',
                          email: emailUsuario,
                          password: passUsuario,
                          setCargando: setCargandoUsuario,
                        })
                      }
                    />
                  </View>

                  <Text style={styles.etiqueta}>Contraseña</Text>
                  <CampoContrasena
                    placeholder="Tu contraseña"
                    value={passUsuario}
                    onChangeText={setPassUsuario}
                    onSubmitEditing={() =>
                      iniciarSesion({
                        panel: 'usuario',
                        email: emailUsuario,
                        password: passUsuario,
                        setCargando: setCargandoUsuario,
                      })
                    }
                  />

                  <BotonNitro
                    titulo="Iniciar sesión"
                    iconoDerecha="arrow-forward"
                    anchoCompleto
                    cargando={cargandoUsuario}
                    onPress={() =>
                      iniciarSesion({
                        panel: 'usuario',
                        email: emailUsuario,
                        password: passUsuario,
                        setCargando: setCargandoUsuario,
                      })
                    }
                    style={styles.botonPrincipal}
                  />

                  <Pressable
                    style={styles.linkButton}
                    onPress={() => router.push('/(auth)/register')}
                    accessibilityRole="link"
                  >
                    <Text style={styles.linkTexto}>
                      ¿No tienes cuenta? Regístrate
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.linkButton}
                    onPress={() => router.push('/(auth)/recuperar')}
                    accessibilityRole="link"
                  >
                    <Text style={styles.linkTexto}>¿Olvidaste tu contraseña?</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.cabecera}>
                    <View
                      style={[
                        styles.iconoCabecera,
                        { backgroundColor: paleta.acento },
                      ]}
                    >
                      <Ionicons name="business" size={20} color={paleta.tinta} />
                    </View>
                    <View style={styles.cabeceraTextos}>
                      <Text style={styles.tarjetaTitulo}>
                        Ingresar como aseguradora
                      </Text>
                      <Text style={styles.tarjetaSubtitulo}>
                        Solo cuentas asignadas
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.etiqueta}>Correo electrónico</Text>
                  <View style={styles.inputCaja}>
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={paleta.textoSuave}
                      style={styles.inputIcono}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="aseguradora@gmail.com"
                      placeholderTextColor={paleta.textoSuave}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      value={emailAseg}
                      onChangeText={setEmailAseg}
                      onSubmitEditing={() =>
                        iniciarSesion({
                          panel: 'aseguradora',
                          email: emailAseg,
                          password: passAseg,
                          setCargando: setCargandoAseg,
                        })
                      }
                    />
                  </View>

                  <Text style={styles.etiqueta}>Contraseña</Text>
                  <CampoContrasena
                    placeholder="Contraseña temporal"
                    value={passAseg}
                    onChangeText={setPassAseg}
                    onSubmitEditing={() =>
                      iniciarSesion({
                        panel: 'aseguradora',
                        email: emailAseg,
                        password: passAseg,
                        setCargando: setCargandoAseg,
                      })
                    }
                  />

                  <BotonNitro
                    titulo="Ingresar"
                    iconoDerecha="arrow-forward"
                    anchoCompleto
                    cargando={cargandoAseg}
                    onPress={() =>
                      iniciarSesion({
                        panel: 'aseguradora',
                        email: emailAseg,
                        password: passAseg,
                        setCargando: setCargandoAseg,
                      })
                    }
                    style={styles.botonPrincipal}
                  />

                  <Pressable
                    style={styles.linkButton}
                    onPress={() => router.push('/(auth)/recuperar')}
                    accessibilityRole="link"
                  >
                    <Text style={styles.linkTexto}>¿Olvidaste tu contraseña?</Text>
                  </Pressable>

                  <View style={styles.nota}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={14}
                      color={paleta.textoSecundario}
                    />
                    <Text style={styles.notaTexto}>
                      Las cuentas de aseguradora las crea el administrador de la
                      plataforma. No hay registro público.
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* =======================================================
   ESTILOS
   ======================================================= */

const crearEstilos = (Paleta: TipoPaleta) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Paleta.fondo,
  },

  scroll: {
    flexGrow: 1,
    paddingBottom: 40,
  },

  hero: {
    alignItems: 'center',
    paddingTop: 72,
    paddingHorizontal: 24,
    paddingBottom: 62,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    overflow: 'hidden',
  },

  heroBurbuja: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(200,255,61,0.10)',
    top: -110,
    right: -70,
  },

  marca: {
    fontSize: 12,
    fontWeight: '900',
    color: Paleta.blanco,
    letterSpacing: 3.4,
    marginBottom: 14,
  },

  marcaAcento: {
    color: Paleta.acento,
  },

  logoCaja: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: Paleta.acento,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...sombraDura(4, 4, 'rgba(0,0,0,0.35)'),
  },

  titulo: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.6,
  },

  subtitulo: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 340,
    lineHeight: 20,
  },

  /* -----------------------------
     CONTENIDO
     ----------------------------- */

  contenido: {
    paddingHorizontal: 18,
    marginTop: -40,
  },

  /* -----------------------------
     PASO 1 · OPCIONES
     ----------------------------- */

  opciones: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 18,
  },

  opcionesApiladas: {
    flexDirection: 'column',
  },

  opcion: {
    flex: 1,
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.grande,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    ...sombraDura(6, 6),
  },

  opcionIcono: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

  opcionTitulo: {
    fontSize: 18,
    fontWeight: '900',
    color: Paleta.texto,
    textAlign: 'center',
    letterSpacing: -0.3,
  },

  opcionSubtitulo: {
    fontSize: 13,
    color: Paleta.textoSecundario,
    textAlign: 'center',
  },

  opcionAccion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: Paleta.tinta,
    borderRadius: Radios.pastilla,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },

  opcionAccionTexto: {
    color: Paleta.acento,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  /* -----------------------------
     PASO 2 · FORMULARIO
     ----------------------------- */

  tarjeta: {
    backgroundColor: Paleta.tarjeta,
    borderRadius: Radios.grande,
    borderWidth: 2,
    borderColor: Paleta.bordeDuro,
    padding: 22,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    ...sombraDura(6, 6),
  },

  volver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 14,
  },

  volverTexto: {
    fontSize: 14,
    fontWeight: '800',
    color: Paleta.textoSecundario,
  },

  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },

  iconoCabecera: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cabeceraTextos: {
    flex: 1,
  },

  tarjetaTitulo: {
    fontSize: 17,
    fontWeight: '900',
    color: Paleta.texto,
    letterSpacing: -0.3,
  },

  tarjetaSubtitulo: {
    fontSize: 12,
    color: Paleta.textoSecundario,
    marginTop: 2,
  },

  /* -----------------------------
     CAMPOS
     ----------------------------- */

  etiqueta: {
    fontSize: 13,
    fontWeight: '700',
    color: Paleta.textoSecundario,
    marginBottom: 6,
  },

  inputCaja: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Paleta.fondo,
    borderWidth: 1,
    borderColor: Paleta.borde,
    borderRadius: Radios.suave,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 52,
  },

  inputIcono: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    fontSize: 15,
    color: Paleta.texto,
    padding: 0,
  },

  /* -----------------------------
     BOTONES Y ENLACES
     ----------------------------- */

  botonPrincipal: {
    marginTop: 6,
  },

  linkButton: {
    marginTop: 14,
    alignItems: 'center',
  },

  linkTexto: {
    color: Paleta.primario,
    fontSize: 14,
    fontWeight: '700',
  },

  nota: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Paleta.borde,
  },

  notaTexto: {
    flex: 1,
    fontSize: 12,
    color: Paleta.textoSecundario,
    lineHeight: 17,
  },
});

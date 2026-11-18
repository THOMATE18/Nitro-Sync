/* Reproduce el getDoc() previo de crearCompraSuscripcion contra el emulador. */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';

const reglas = readFileSync('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId: 'servicio-vehicular-7bc23',
  firestore: { rules: reglas, host: '127.0.0.1', port: 8080 },
});

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await db.doc('organizations/sura').set({
    nombre: 'SURA', estado: 'active', accesoHabilitado: true, aseguradoraClave: 'sura',
  });
  await db.doc('configuracionSuscripcion/super_empresarial').set({
    planId: 'super_empresarial', precioCop: 149900, actualizadaPor: 'admin',
  });
  await db.doc('subscriptions/sura').set({
    orgId: 'sura', planId: 'super_empresarial', estado: 'inactive', precioCop: 149900,
  });
});

const sura = env.authenticatedContext('uid-sura', {
  role: 'insurer_admin', orgId: 'sura',
}).firestore();

try {
  await assertSucceeds(sura.doc('comprasSuscripcion/sura_2026-11').get());
  console.log('GETDOC_INEXISTENTE=PERMITIDO');
} catch (e) {
  console.log(`GETDOC_INEXISTENTE=DENEGADO (${String(e.message).slice(0, 90)})`);
}

await env.cleanup();

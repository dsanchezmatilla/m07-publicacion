// Batería de pruebas que valida el servidor de "WhatsApp seguro".
// Uso: SERVER_URL=ws://IP:8080 node --test test_servidor.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const URL = process.env.SERVER_URL || 'ws://localhost:8080';
const ID = Date.now(); // sufijo para que los nombres no choquen entre ejecuciones

// Crea un cliente de prueba: se conecta, hace login y guarda lo que recibe
async function cliente(nombre) {
  const ws = new WebSocket(URL);
  const recibidos = [];
  const esperando = [];

  ws.on('message', (raw) => {
    const data = JSON.parse(raw);
    // Si alguien espera este tipo de mensaje se lo damos, si no lo guardamos
    const i = esperando.findIndex((e) => e.type === data.type);
    if (i >= 0) esperando.splice(i, 1)[0].resolve(data);
    else recibidos.push(data);
  });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  const user = `${nombre}_${ID}`;
  const enviar = (data) => ws.send(JSON.stringify(data));
  enviar({ type: 'login', user, publicKey: `clave-publica-de-${nombre}` });

  // Espera (máx. 3 s) al siguiente mensaje del tipo indicado
  function esperar(type) {
    const i = recibidos.findIndex((d) => d.type === type);
    if (i >= 0) return Promise.resolve(recibidos.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      esperando.push({ type, resolve });
      setTimeout(() => reject(new Error(`No ha llegado "${type}"`)), 3000);
    });
  }

  // Descarta los mensajes "users" acumulados hasta ahora
  const limpiar = () => recibidos.splice(0);

  return { ws, user, enviar, esperar, limpiar, cerrar: () => ws.close() };
}

test('1. El servidor acepta conexiones WebSocket', async () => {
  const a = await cliente('conexion');
  assert.equal(a.ws.readyState, WebSocket.OPEN);
  a.cerrar();
});

test('2. Tras el login se recibe la lista de usuarios con su clave pública', async () => {
  const a = await cliente('lista');
  const { users } = await a.esperar('users');
  const yo = users.find((u) => u.user === a.user);
  assert.ok(yo, 'el usuario aparece en la lista');
  assert.equal(yo.publicKey, 'clave-publica-de-lista');
  assert.equal(yo.online, true);
  a.cerrar();
});

test('3. Un mensaje cifrado llega intacto al destinatario', async () => {
  const ana = await cliente('ana');
  const pepe = await cliente('pepe');
  const msg = { type: 'msg', to: pepe.user, id: 'm1', kind: 'text', nonce: 'AAAA', cipher: 'x9Fk2+Qz==', mac: 'BBBB' };
  ana.enviar(msg);
  const llegado = await pepe.esperar('msg');
  // El servidor no modifica el contenido cifrado, solo añade el remitente
  assert.equal(llegado.cipher, msg.cipher);
  assert.equal(llegado.nonce, msg.nonce);
  assert.equal(llegado.mac, msg.mac);
  assert.equal(llegado.from, ana.user);
  ana.cerrar();
  pepe.cerrar();
});

test('4. El servidor no permite falsificar el remitente', async () => {
  const ana = await cliente('ana2');
  const pepe = await cliente('pepe2');
  ana.enviar({ type: 'msg', to: pepe.user, from: 'impostor', id: 'm2', cipher: 'zzz' });
  const llegado = await pepe.esperar('msg');
  assert.equal(llegado.from, ana.user);
  ana.cerrar();
  pepe.cerrar();
});

test('5. Se reenvía el aviso de "escribiendo"', async () => {
  const ana = await cliente('ana3');
  const pepe = await cliente('pepe3');
  ana.enviar({ type: 'typing', to: pepe.user });
  const aviso = await pepe.esperar('typing');
  assert.equal(aviso.from, ana.user);
  ana.cerrar();
  pepe.cerrar();
});

test('6. Se reenvían las confirmaciones de recibido y leído', async () => {
  const ana = await cliente('ana4');
  const pepe = await cliente('pepe4');
  pepe.enviar({ type: 'delivered', to: ana.user, id: 'm3' });
  const recibido = await ana.esperar('delivered');
  assert.equal(recibido.id, 'm3');
  pepe.enviar({ type: 'read', to: ana.user, id: 'm3' });
  const leido = await ana.esperar('read');
  assert.equal(leido.id, 'm3');
  ana.cerrar();
  pepe.cerrar();
});

test('7. Un mensaje a un usuario desconectado le llega al conectarse', async () => {
  const ana = await cliente('ana5');
  ana.enviar({ type: 'msg', to: `luis_${ID}`, id: 'm4', cipher: 'pendiente' });
  await new Promise((r) => setTimeout(r, 300));
  const luis = await cliente('luis');
  const llegado = await luis.esperar('msg');
  assert.equal(llegado.cipher, 'pendiente');
  ana.cerrar();
  luis.cerrar();
});

test('8. Al desconectarse, el usuario aparece como offline', async () => {
  const ana = await cliente('ana6');
  const pepe = await cliente('pepe6');
  await new Promise((r) => setTimeout(r, 300));
  ana.limpiar();
  pepe.cerrar();
  const { users } = await ana.esperar('users');
  assert.equal(users.find((u) => u.user === pepe.user).online, false);
  ana.cerrar();
});

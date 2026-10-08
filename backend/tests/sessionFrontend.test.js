const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const codigo = fs.readFileSync(path.join(__dirname, '../../frontend/js/session.js'), 'utf8');
const token = (exp) => `cabecera.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.firma`;

function navegador(valor) {
  const datos = new Map([['token', valor], ['usuario', '{}']]);
  const eventos = {};
  const redirecciones = [];
  const reloj = { ahora: 1000000, callback: null, demora: null };
  vm.runInNewContext(codigo, {
    localStorage: { getItem: (k) => datos.get(k), removeItem: (k) => datos.delete(k) },
    window: {
      location: { replace: (url) => redirecciones.push(url) },
      addEventListener: (nombre, callback) => { eventos[nombre] = callback; }
    },
    document: { addEventListener: (nombre, callback) => { eventos[nombre] = callback; } },
    Date: { now: () => reloj.ahora },
    atob: (valor) => atob(valor),
    setTimeout: (callback, demora) => { Object.assign(reloj, { callback, demora }); return 1; },
    clearTimeout: () => { reloj.callback = null; }
  });
  return { datos, eventos, redirecciones, reloj };
}

test('redirige al vencer sin interacción y limpia la sesión', () => {
  const n = navegador(token(1000 + 4 * 3600));
  assert.equal(n.reloj.demora, 4 * 3600 * 1000);
  assert.deepEqual(n.redirecciones, []);
  n.reloj.ahora += n.reloj.demora;
  n.reloj.callback();
  assert.deepEqual(n.redirecciones, ['/login.html']);
  assert.equal(n.datos.has('token'), false);
  assert.equal(n.datos.has('usuario'), false);
  n.eventos.focus();
  assert.equal(n.redirecciones.length, 1);
});

test('sesiones ausentes, vencidas o malformadas vuelven al login', () => {
  for (const valor of [null, '', 'invalido', token(999), token(undefined), token('2000')]) {
    assert.deepEqual(navegador(valor).redirecciones, ['/login.html']);
  }
});

test('comprueba vencimiento al recuperar una pestaña o reactivar el equipo', () => {
  for (const evento of ['focus', 'pageshow', 'visibilitychange']) {
    const n = navegador(token(1100));
    n.reloj.ahora = 1200000;
    n.eventos[evento]();
    assert.deepEqual(n.redirecciones, ['/login.html']);
  }
});

test('sincroniza cierre o nuevo inicio de sesión desde otra pestaña', () => {
  const n = navegador(token(1100));
  n.datos.set('token', token(1500));
  n.eventos.storage({ key: 'token' });
  assert.equal(n.reloj.demora, 500000);
  assert.deepEqual(n.redirecciones, []);
  n.datos.delete('token');
  n.eventos.storage({ key: 'token' });
  assert.deepEqual(n.redirecciones, ['/login.html']);
});

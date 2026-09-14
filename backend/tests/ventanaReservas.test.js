const { test } = require('node:test');
const assert = require('node:assert/strict');
const { obtenerVentana, validarFecha } = require('../utils/ventanaReservas');

test('lunes permite esta semana, pero no la siguiente ni fechas pasadas', () => {
  const ahora = new Date('2026-09-14T16:00:00Z');
  assert.equal(validarFecha('2026-09-14', ahora), null);
  assert.equal(validarFecha('2026-09-19', ahora), null);
  assert.ok(validarFecha('2026-09-21', ahora));
  assert.ok(validarFecha('2026-09-12', ahora));
  assert.ok(validarFecha('2026-09-20', ahora));
});

test('apertura exacta el domingo a las 17:00 de Ciudad de México', () => {
  const antes = new Date('2026-09-20T22:59:59.999Z');
  const despues = new Date('2026-09-20T23:00:00Z');
  assert.equal(obtenerVentana(antes).habilitada, false);
  assert.ok(validarFecha('2026-09-21', antes));
  assert.equal(validarFecha('2026-09-21', despues), null);
  assert.equal(validarFecha('2026-09-26', despues), null);
  assert.ok(validarFecha('2026-09-20', despues));
  assert.ok(validarFecha('2026-09-28', despues));
});

test('sábado, cambio de año y fechas inválidas', () => {
  assert.equal(validarFecha('2026-09-19', new Date('2026-09-20T04:00:00Z')), null);
  assert.equal(obtenerVentana(new Date('2027-01-03T23:00:00Z')).lunes, '2027-01-04');
  for (const fecha of ['', undefined, '2026-02-30', 'invalida']) {
    assert.ok(validarFecha(fecha));
  }
});

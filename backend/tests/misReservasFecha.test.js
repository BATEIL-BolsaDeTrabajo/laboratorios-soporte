const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const contexto = vm.createContext({ localStorage: { getItem: () => null }, window: { location: {} } });
vm.runInContext(fs.readFileSync(require.resolve('../../frontend/js/mis-reservas.js'), 'utf8'), contexto);

test('sábado UTC se presenta como sábado y conserva su número de día', () => {
  assert.match(contexto.fechaLarga('2026-09-19T00:00:00.000Z'), /sábado.*19/);
  assert.equal(contexto.fechaVisual('2026-09-19').getDate(), 19);
  assert.match(contexto.fechaLarga('2027-01-01T00:00:00.000Z'), /viernes.*1.*enero.*2027/);
});
test('el día enviado por el servidor tiene prioridad y hay compatibilidad con respuestas anteriores', () => {
  assert.equal(contexto.diaReserva({ fechaCalendario: '2026-09-19', fecha: '2026-09-18T23:00:00Z' }), '2026-09-19');
  assert.equal(contexto.diaReserva({ fecha: '2026-09-19T00:00:00Z' }), '2026-09-19');
});
test('reserva del sábado sigue activa el sábado y pasa al historial el domingo en México', () => {
  const dia = contexto.diaReserva({ fecha: '2026-09-19T00:00:00Z' });
  assert.equal(contexto.hoyAcademico(new Date('2026-09-20T05:59:59Z')), '2026-09-19');
  assert.ok(dia >= contexto.hoyAcademico(new Date('2026-09-19T18:00:00Z')));
  assert.ok(dia < contexto.hoyAcademico(new Date('2026-09-20T06:00:00Z')));
});

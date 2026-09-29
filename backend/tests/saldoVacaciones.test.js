const { test } = require('node:test');
const assert = require('node:assert/strict');
const { obtenerDiasActivos, actualizarDiasSiCorresponde, calcularConsumoVacaciones, establecerDiasActivos } = require('../utils/saldoVacaciones');

function usuario(datos = {}) {
  return {
    fechaIngreso: new Date('2024-09-29T12:00:00Z'),
    ultimaActualizacionDias: new Date('2025-09-29T18:00:00Z'),
    diasVacacionesDisponibles: 8,
    diasVacacionesAcumulados: 0,
    diasVacacionesPrestacion: 3,
    diasVacacionesAnuales: 22,
    diasVacacionesPrestacionAnuales: 5,
    ...datos
  };
}

test('capturar el total conserva prestaciones y sustituye el saldo anterior', () => {
  const u = usuario({ diasVacacionesAcumulados: 4 });
  establecerDiasActivos(u, 20);
  assert.equal(obtenerDiasActivos(u), 20);
  assert.equal(u.diasVacacionesPrestacion, 3);
  assert.equal(u.diasVacacionesDisponibles, 17);
  assert.equal(u.diasVacacionesAcumulados, 0);
  assert.equal(calcularConsumoVacaciones(5, u).diasAniversarioRestantes, 15);
});

test('capturar totales menores que la prestación, cero y negativos respeta el total', () => {
  for (const total of [2, 0, -2]) {
    const u = usuario();
    establecerDiasActivos(u, total);
    assert.equal(obtenerDiasActivos(u), total);
    assert.equal(u.diasVacacionesPrestacion, Math.max(total, 0));
  }
});

test('rechaza capturas no enteras o vacías sin modificar el saldo', () => {
  const u = usuario();
  for (const total of [NaN, Infinity, 1.5, '', null, '20']) {
    assert.throws(() => establecerDiasActivos(u, total), TypeError);
    assert.equal(obtenerDiasActivos(u), 11);
  }
});

test('el saldo activo incluye ambas bolsas y los remanentes anteriores', () => {
  assert.equal(obtenerDiasActivos(usuario({ diasVacacionesAcumulados: 2 })), 13);
});

test('consumir solo prestación conserva el saldo de aniversario', () => {
  const saldo = calcularConsumoVacaciones(2, usuario());
  assert.equal(saldo.diasPrestacionRestantes, 1);
  assert.equal(saldo.diasAniversarioRestantes, 8);
  assert.equal(saldo.saldoTotalRestante, 9);
  assert.equal(saldo.diasPorPagar, 0);
});

test('agotar prestación descuenta el resto del aniversario', () => {
  const saldo = calcularConsumoVacaciones(7, usuario());
  assert.equal(saldo.diasPrestacionRestantes, 0);
  assert.equal(saldo.diasAniversarioRestantes, 4);
  assert.equal(saldo.saldoTotalAntes, 11);
  assert.equal(saldo.saldoTotalRestante, 4);
});

test('se mantiene el registro de días adelantados cuando se excede el saldo', () => {
  const saldo = calcularConsumoVacaciones(14, usuario());
  assert.equal(saldo.diasPrestacionRestantes, 0);
  assert.equal(saldo.diasAniversarioRestantes, -3);
  assert.equal(saldo.diasPorPagar, 3);
});

test('aniversario suma ambas asignaciones al remanente una sola vez', () => {
  const u = usuario({ diasVacacionesAcumulados: 2 });
  actualizarDiasSiCorresponde(u, new Date('2026-09-29T06:00:00Z'));
  assert.equal(u.diasVacacionesDisponibles, 32);
  assert.equal(u.diasVacacionesPrestacion, 8);
  assert.equal(u.diasVacacionesAcumulados, 0);
  assert.equal(obtenerDiasActivos(u), 40);
  actualizarDiasSiCorresponde(u, new Date('2026-09-29T18:00:00Z'));
  assert.equal(obtenerDiasActivos(u), 40);
});

test('no acredita antes del aniversario ni en el año de ingreso', () => {
  for (const u of [usuario(), usuario({ fechaIngreso: new Date('2026-01-01'), ultimaActualizacionDias: null })]) {
    actualizarDiasSiCorresponde(u, new Date('2026-09-29T05:59:59Z'));
    assert.equal(obtenerDiasActivos(u), 11);
  }
});

test('recupera aniversarios pendientes aunque la consulta sea antes del próximo', () => {
  const u = usuario();
  actualizarDiasSiCorresponde(u, new Date('2028-01-01T18:00:00Z'));
  assert.equal(obtenerDiasActivos(u), 65);
  actualizarDiasSiCorresponde(u, new Date('2028-09-29T18:00:00Z'));
  assert.equal(obtenerDiasActivos(u), 92);
});

test('usuarios sin historial reciben solo el último aniversario y conservan saldos', () => {
  const u = usuario({ ultimaActualizacionDias: null });
  actualizarDiasSiCorresponde(u, new Date('2026-09-29T18:00:00Z'));
  assert.equal(obtenerDiasActivos(u), 38);
});

test('sin fecha de ingreso consolida saldos sin otorgar días nuevos', () => {
  const u = usuario({ fechaIngreso: null, diasVacacionesAcumulados: 4 });
  actualizarDiasSiCorresponde(u);
  actualizarDiasSiCorresponde(u);
  assert.equal(obtenerDiasActivos(u), 15);
});

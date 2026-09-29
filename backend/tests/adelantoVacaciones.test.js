const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const { actualizarDiasSiCorresponde, obtenerDiasActivos } = require('../utils/saldoVacaciones');

function escenario(saldo = 0, departamento = 'administrativo') {
  const usuario = {
    departamento, diasVacacionesDisponibles: saldo, diasVacacionesPrestacion: 0,
    diasVacacionesAcumulados: 0, isModified: () => false, save: async () => {}
  };
  let solicitud;
  class Vacacion {
    constructor(datos) { Object.assign(this, { estatus: 'Pendiente' }, datos); }
    async save() { solicitud = this; }
    static async findById() { return solicitud; }
  }
  const archivo = path.resolve(__dirname, '../routes/vacacionesroutes.js');
  const cargar = createRequire(archivo);
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    module: modulo, require: nombre => {
      if (nombre === '../models/User') return { findById: async () => usuario };
      if (nombre === '../models/Vacacion') return Vacacion;
      return cargar(nombre);
    }
  }, { filename: archivo });
  async function llamar(ruta, body, roles = ['finanzas']) {
    const capa = modulo.exports.stack.find(c => c.route?.path === ruta);
    const handler = capa.route.stack.at(-1).handle;
    const respuesta = { codigo: 200, status(codigo) { this.codigo = codigo; return this; }, json(datos) { this.datos = datos; return this; } };
    await handler({ body, params: { id: 'solicitud' }, usuario: { id: 'usuario', roles } }, respuesta);
    return respuesta;
  }
  return { usuario, llamar, solicitud: () => solicitud };
}

const fechas = { fechaInicio: '2026-09-28', fechaFin: '2026-09-30' };

test('sin saldo rechaza solicitudes normales, incluso sin tipo explícito', async () => {
  const e = escenario();
  assert.equal((await e.llamar('/solicitar', fechas)).codigo, 400);
  assert.equal(e.solicitud(), undefined);
});

test('un adelanto pendiente no descuenta; aprobado descuenta tres y el aniversario deja 19', async () => {
  const e = escenario();
  assert.equal((await e.llamar('/solicitar', { ...fechas, tipoSolicitud: 'adelanto' })).codigo, 201);
  assert.equal(obtenerDiasActivos(e.usuario), 0);
  assert.equal((await e.llamar('/revisar/:id', { estatus: 'Aceptado' })).codigo, 200);
  assert.equal(obtenerDiasActivos(e.usuario), -3);
  assert.equal(e.solicitud().diasPorPagar, 3);
  assert.equal((await e.llamar('/revisar/:id', { estatus: 'Aceptado' })).codigo, 409);
  assert.equal(obtenerDiasActivos(e.usuario), -3);
  Object.assign(e.usuario, {
    fechaIngreso: new Date('2025-10-01T12:00:00Z'),
    ultimaActualizacionDias: new Date('2025-10-01T18:00:00Z'),
    diasVacacionesAnuales: 22, diasVacacionesPrestacionAnuales: 0
  });
  actualizarDiasSiCorresponde(e.usuario, new Date('2026-10-01T18:00:00Z'));
  assert.equal(obtenerDiasActivos(e.usuario), 19);
});

test('rechazar un adelanto no cambia el saldo', async () => {
  const e = escenario();
  await e.llamar('/solicitar', { ...fechas, tipoSolicitud: 'adelanto' });
  assert.equal((await e.llamar('/revisar/:id', { estatus: 'Rechazado' })).codigo, 200);
  assert.equal(obtenerDiasActivos(e.usuario), 0);
});

test('la aprobación corresponde a Finanzas o Subdirección según el departamento', async () => {
  for (const [departamento, permitido, prohibido] of [
    ['administrativo', 'finanzas', 'subdireccion'], ['academico', 'subdireccion', 'finanzas']
  ]) {
    const e = escenario(0, departamento);
    await e.llamar('/solicitar', { ...fechas, tipoSolicitud: 'adelanto' });
    assert.equal((await e.llamar('/revisar/:id', { estatus: 'Aceptado' }, [prohibido])).codigo, 403);
    assert.equal(obtenerDiasActivos(e.usuario), 0);
    assert.equal((await e.llamar('/revisar/:id', { estatus: 'Aceptado' }, [permitido])).codigo, 200);
  }
});

test('revalida el saldo al aprobar una solicitud normal', async () => {
  const e = escenario(3);
  assert.equal((await e.llamar('/solicitar', fechas)).codigo, 201);
  e.usuario.diasVacacionesDisponibles = 1;
  assert.equal((await e.llamar('/revisar/:id', { estatus: 'Aceptado' })).codigo, 409);
  assert.equal(obtenerDiasActivos(e.usuario), 1);
  assert.equal(e.solicitud().estatus, 'Pendiente');
});

test('con saldo positivo no permite adelantos hasta agotar los días disponibles', async () => {
  const e = escenario(1);
  assert.equal((await e.llamar('/solicitar', { ...fechas, tipoSolicitud: 'adelanto' })).codigo, 400);
  assert.equal(e.solicitud(), undefined);
  assert.equal(obtenerDiasActivos(e.usuario), 1);
});

test('rechaza tipos desconocidos y periodos sin días computables', async () => {
  const e = escenario();
  assert.equal((await e.llamar('/solicitar', { ...fechas, tipoSolicitud: 'otro' })).codigo, 400);
  assert.equal((await e.llamar('/solicitar', {
    fechaInicio: '2026-10-04', fechaFin: '2026-10-04', tipoSolicitud: 'adelanto'
  })).codigo, 400);
});

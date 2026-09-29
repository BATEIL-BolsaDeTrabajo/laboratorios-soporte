const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

async function verificar(rolesToken, rolesActuales) {
  const archivo = path.resolve(__dirname, '../middlewares/auth.js');
  const cargar = createRequire(archivo);
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    module: modulo,
    require: nombre => nombre === '../models/User' ? {
      findById: () => ({ select: async () => rolesActuales === null ? null : { roles: rolesActuales } })
    } : cargar(nombre)
  });
  const req = { usuario: { id: 'usuario', roles: rolesToken } };
  const res = { status(codigo) { this.codigo = codigo; return this; }, json() {} };
  let autorizado = false;
  await modulo.exports.verifyCurrentRole(['finanzas', 'subdireccion'])(req, res, () => { autorizado = true; });
  return { autorizado, codigo: res.codigo, roles: req.usuario.roles };
}

test('admin con Finanzas recién asignado accede sin renovar el token', async () => {
  const resultado = await verificar(['admin'], ['admin', 'finanzas']);
  assert.equal(resultado.autorizado, true);
  assert.deepEqual(resultado.roles, ['admin', 'finanzas']);
});

test('permite Finanzas solo o combinado con otros roles y conserva Subdirección', async () => {
  for (const roles of [['finanzas'], ['admin', 'rrhh', 'finanzas'], ['subdireccion']]) {
    assert.equal((await verificar([], roles)).autorizado, true);
  }
});

test('un token antiguo no conserva Finanzas cuando se retira el rol', async () => {
  const resultado = await verificar(['admin', 'finanzas'], ['admin']);
  assert.equal(resultado.autorizado, false);
  assert.equal(resultado.codigo, 403);
});

test('no autoriza usuarios eliminados', async () => {
  const resultado = await verificar(['finanzas'], null);
  assert.equal(resultado.autorizado, false);
  assert.equal(resultado.codigo, 401);
});

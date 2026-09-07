const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Ejecuta el handler real con almacenamiento en memoria: nunca conecta a MongoDB.
function setup() {
  const cycle = { name: '2026-2', months: [
    { key: 'inscripcion', order: 1 }, { key: 'agosto', order: 2 }, { key: 'septiembre', order: 3 }
  ] };
  const records = [];
  let saves = 0;
  class Tracking {
    constructor(data) {
      Object.assign(this, data);
      this.payments = new Map(Object.entries(data.payments));
    }
    async save() { saves++; if (!records.includes(this)) records.push(this); }
    static async findOne(query) { return records.find(r => r.cycleId === query.cycleId && r.matricula === query.matricula); }
    static async find(query) { return records.filter(r => r.cycleId === query.cycleId); }
  }
  function add(matricula, values, cycleId = 'cycle') {
    const row = new Tracking({ matricula, nombre: matricula, cycleId,
      payments: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, updatedAt: 'previous-date', updatedBy: 'previous-user' }])) });
    records.push(row);
    return row;
  }
  let handler;
  const router = { post(_path, ...handlers) { handler = handlers.at(-1); } };
  const modules = {
    express: { Router: () => router },
    multer: Object.assign(() => ({ single: () => () => {} }), { memoryStorage: () => ({}) }),
    xlsx: { read: rows => ({ SheetNames: ['Sheet'], Sheets: { Sheet: rows } }), utils: { sheet_to_json: rows => rows } },
    '../models/Cycle': { findById: async () => cycle },
    '../models/StudentPaymentTracking': Tracking,
    '../middlewares/auth': { verifyToken() {}, verifyRole: () => () => {} }
  };
  const context = vm.createContext({ require: id => { assert.ok(id in modules, id); return modules[id]; }, module: {}, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../routes/studentPaymentTrackingImport.js'), 'utf8'), context);
  async function upload(monthKey, concept, matriculas = ['debtor']) {
    const rows = matriculas.flatMap((id, index) => {
      const row = []; row[0] = index + 1; row[4] = '5 MCA'; row[5] = id; row[12] = id;
      const detail = []; detail[12] = '2026-2'; detail[19] = concept;
      return [row, detail];
    });
    let status = 200, body;
    const res = { status(code) { status = code; return this; }, json(data) { body = data; } };
    await handler({ body: { cycleId: 'cycle', monthKey }, file: { buffer: rows }, usuario: { id: 'import-user' } }, res);
    return { status, body };
  }
  return { add, upload, get saves() { return saves; } };
}

test('agosto ausente queda SI aunque inscripción tenga NO; conserva otros conceptos y ciclos', async () => {
  const h = setup();
  const camila = h.add('TEST001', { inscripcion: 'NO', agosto: 'NO', septiembre: '' });
  const otherCycle = h.add('TEST001', { agosto: 'NO' }, 'other-cycle');
  const previous = structuredClone([...camila.payments]);
  const result = await h.upload('agosto', 'AGO');
  assert.equal(result.status, 200);
  assert.equal(camila.payments.get('agosto').value, 'SI');
  assert.deepEqual(camila.payments.get('inscripcion'), previous[0][1]);
  assert.deepEqual(camila.payments.get('septiembre'), previous[2][1]);
  assert.equal(otherCycle.payments.get('agosto').value, 'NO');
  assert.equal(result.body.updatedToNo, 1);
  assert.equal(result.body.updatedToSi, 1);
});

test('un concepto sin archivo conserva el estado sin información', async () => {
  const h = setup(); const row = h.add('student', { inscripcion: '', agosto: '', septiembre: '' });
  await h.upload('agosto', 'AGO');
  assert.equal(row.payments.get('agosto').value, 'SI');
  assert.equal(row.payments.get('inscripcion').value, '');
  assert.equal(row.payments.get('septiembre').value, '');
});

test('inscripción y septiembre se importan independientemente, aun fuera de orden', async () => {
  const h = setup(); const row = h.add('student', { inscripcion: '', agosto: 'SI', septiembre: '' });
  await h.upload('septiembre', 'SEP', ['student']);
  const september = structuredClone(row.payments.get('septiembre'));
  await h.upload('inscripcion', 'INS', ['student']);
  assert.equal(row.payments.get('inscripcion').value, 'NO');
  assert.equal(row.payments.get('agosto').value, 'SI');
  assert.deepEqual(structuredClone(row.payments.get('septiembre')), september);
  await h.upload('inscripcion', 'INS');
  assert.equal(row.payments.get('inscripcion').value, 'SI');
  assert.deepEqual(structuredClone(row.payments.get('septiembre')), september);
});

for (const concept of ['SEP', '']) {
  test(`rechaza concepto incompatible o ausente (${concept || 'vacío'}) antes de guardar`, async () => {
    const h = setup(); h.add('student', { agosto: 'NO' });
    assert.equal((await h.upload('agosto', concept)).status, 400);
    assert.equal(h.saves, 0);
  });
}

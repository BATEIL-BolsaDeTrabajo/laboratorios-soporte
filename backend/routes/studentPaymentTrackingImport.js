const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');

const Cycle = require('../models/Cycle');
const StudentPaymentTracking = require('../models/StudentPaymentTracking');
const { verifyToken, verifyRole } = require('../middlewares/auth');

const upload = multer({ storage: multer.memoryStorage() });

// luego agregamos "caja"
const allowImport = ['admin', 'direccion', 'subdireccion'];

function normalizeText(value = '') {
  return String(value).trim().replace(/\s+/g, ' ');
}

function getMonthAliases() {
  return {
    inscripcion: ['INSCRIPCION', 'INSCRIPCIÓN', 'INS'],
    enero: ['ENE', 'ENERO'],
    febrero: ['FEB', 'FEBRERO'],
    marzo: ['MAR', 'MARZO'],
    abril: ['ABR', 'ABRIL'],
    mayo: ['MAY', 'MAYO'],
    junio: ['JUN', 'JUNIO'],
    julio: ['JUL', 'JULIO'],
    agosto: ['AGO', 'AGOSTO'],
    septiembre: ['SEP', 'SEPT', 'SEPTIEMBRE'],
    octubre: ['OCT', 'OCTUBRE'],
    noviembre: ['NOV', 'NOVIEMBRE'],
    diciembre: ['DIC', 'DICIEMBRE']
  };
}

function monthMatches(monthKey, concValue) {
  const aliases = getMonthAliases();
  const raw = normalizeText(concValue).toUpperCase();
  return (aliases[monthKey] || []).includes(raw);
}

function extractStudentsFromCajaSheet(rows) {
  const students = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];

    const no = row[0];
    const grupo = row[4];
    const nombre = row[5];
    const matricula = row[12];

    // fila principal del alumno
    if (typeof no === 'number' && grupo && nombre && matricula) {
      let periodo = '';
      let conc = '';

      // buscar unas filas abajo el periodo y la conc
      for (let j = i + 1; j <= i + 5 && j < rows.length; j++) {
        const nextRow = rows[j] || [];

        if (!periodo && nextRow[12]) {
          const possiblePeriodo = normalizeText(nextRow[12]);
          if (/^\d{4}-[12]$/.test(possiblePeriodo)) {
            periodo = possiblePeriodo;
          }
        }

        if (!conc && nextRow[19]) {
          conc = normalizeText(nextRow[19]);
        }
      }

      students.push({
        grupo: normalizeText(grupo),
        nombre: normalizeText(nombre),
        matricula: normalizeText(matricula),
        periodo,
        conc
      });
    }
  }

  return students;
}

// POST /api/student-payment-tracking/import-caja
router.post(
  '/import-caja',
  verifyToken,
  verifyRole(allowImport),
  upload.single('file'),
  async (req, res) => {
    try {
      const { cycleId, monthKey } = req.body;

      if (!cycleId || !monthKey) {
        return res.status(400).json({
          mensaje: 'Debes enviar cycleId y monthKey'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          mensaje: 'Debes seleccionar un archivo Excel'
        });
      }

      const cycle = await Cycle.findById(cycleId);
      if (!cycle) {
        return res.status(404).json({ mensaje: 'Ciclo no encontrado' });
      }

      const validMonth = cycle.months.find(m => m.key === monthKey);
      if (!validMonth) {
        return res.status(400).json({
          mensaje: 'El mes seleccionado no pertenece a ese ciclo'
        });
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      const extracted = extractStudentsFromCajaSheet(rows);

      if (!extracted.length) {
        return res.status(400).json({
          mensaje: 'No se encontraron alumnos válidos en el archivo'
        });
      }

      // filtrar solo alumnos del periodo/ciclo correcto
      const studentsForCycle = extracted.filter(s => s.periodo === cycle.name);

      if (!studentsForCycle.length) {
        return res.status(400).json({
          mensaje: `No se encontraron alumnos con periodo ${cycle.name} en el archivo`
        });
      }

      // si quieres, validamos también que el conc del archivo coincida con el monthKey
      const mismatchMonth = studentsForCycle.some(s => s.conc && !monthMatches(monthKey, s.conc));
      if (mismatchMonth) {
        return res.status(400).json({
          mensaje: 'El archivo contiene registros de un mes distinto al seleccionado'
        });
      }

      const now = new Date();
      const fileMatriculas = new Set(studentsForCycle.map(s => s.matricula));

      let created = 0;
      let updatedToNo = 0;
      let updatedToSi = 0;

      // 1. Crear o actualizar alumnos que aparecen en el archivo => NO
      for (const student of studentsForCycle) {
        let row = await StudentPaymentTracking.findOne({
          matricula: student.matricula,
          cycleId
        });

        if (!row) {
          const initialPayments = {};
          for (const month of cycle.months) {
            initialPayments[month.key] = {
              value: '',
              updatedAt: null,
              updatedBy: null
            };
          }

          row = new StudentPaymentTracking({
            matricula: student.matricula,
            nombre: student.nombre,
            grupo: student.grupo,
            seccion: student.grupo,
            cycleId,
            payments: initialPayments
          });

          created++;
        }

        row.nombre = student.nombre;
        row.grupo = student.grupo;
        row.seccion = student.grupo;

        row.payments.set(monthKey, {
          value: 'NO',
          updatedAt: now,
          updatedBy: req.usuario.id
        });

        row.lastCajaUploadAt = now;
        row.lastCajaUploadBy = req.usuario.id;

        await row.save();
        updatedToNo++;
      }

      // 2. A todos los del ciclo que NO aparezcan en el archivo => SI
      const allCycleRows = await StudentPaymentTracking.find({ cycleId });

      for (const row of allCycleRows) {
        if (!fileMatriculas.has(row.matricula)) {
          row.payments.set(monthKey, {
            value: 'SI',
            updatedAt: now,
            updatedBy: req.usuario.id
          });

          row.lastCajaUploadAt = now;
          row.lastCajaUploadBy = req.usuario.id;

          await row.save();
          updatedToSi++;
        }
      }

      return res.json({
        mensaje: 'Archivo procesado correctamente',
        cycle: cycle.name,
        monthKey,
        totalDetectadosArchivo: extracted.length,
        totalPeriodoCorrecto: studentsForCycle.length,
        created,
        updatedToNo,
        updatedToSi
      });
    } catch (error) {
      console.error('Error al importar archivo de caja:', error);
      res.status(500).json({
        mensaje: 'Error al importar archivo de caja'
      });
    }
  }
);

module.exports = router;
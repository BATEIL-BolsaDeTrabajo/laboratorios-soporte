const express = require('express');
const router = express.Router();

const StudentPaymentTracking = require('../models/StudentPaymentTracking');
const Cycle = require('../models/Cycle');
const { verifyToken, verifyRole } = require('../middlewares/auth');

const allowView = ['admin', 'direccion', 'subdireccion', 'coordinador', 'caja'];
const allowAcademicEdit = ['admin', 'direccion', 'subdireccion', 'coordinador'];
const allowAdminNotesEdit = ['admin', 'direccion', 'subdireccion', 'caja']; // caja después la agregamos
const allowManage = ['admin', 'direccion', 'subdireccion'];

// =====================================================
// GET /api/student-payment-tracking?cycleId=...
// Listar registros por ciclo
// =====================================================
router.get(
  '/',
  verifyToken,
  verifyRole(allowView),
  async (req, res) => {
    try {
      const { cycleId, grupo, search } = req.query;

      if (!cycleId) {
        return res.status(400).json({ mensaje: 'El cycleId es obligatorio' });
      }

      const filter = { cycleId };

      if (grupo) {
        filter.grupo = grupo;
      }

      if (search) {
        filter.$or = [
          { nombre: { $regex: search, $options: 'i' } },
          { matricula: { $regex: search, $options: 'i' } }
        ];
      }

      const rows = await StudentPaymentTracking.find(filter)
        .populate('cycleId', 'name months')
        .sort({ grupo: 1, nombre: 1 });

      res.json(rows);
    } catch (error) {
      console.error('Error al listar control de colegiatura:', error);
      res.status(500).json({ mensaje: 'Error al listar registros' });
    }
  }
);

// =====================================================
// GET /api/student-payment-tracking/summary/:cycleId
// Resumen del ciclo
// =====================================================
router.get(
  '/summary/:cycleId',
  verifyToken,
  verifyRole(allowView),
  async (req, res) => {
    try {
      const { cycleId } = req.params;

      const cycle = await Cycle.findById(cycleId);
      if (!cycle) {
        return res.status(404).json({ mensaje: 'Ciclo no encontrado' });
      }

      const rows = await StudentPaymentTracking.find({ cycleId });

      const summary = {
        total: rows.length,
        months: {}
      };

      for (const month of cycle.months) {
        let si = 0;
        let no = 0;
        let vacio = 0;

        for (const row of rows) {
          const value = row.payments?.get(month.key)?.value || '';
          if (value === 'SI') si++;
          else if (value === 'NO') no++;
          else vacio++;
        }

        summary.months[month.key] = {
          label: month.label,
          si,
          no,
          vacio,
          porcentajeSi: rows.length ? Math.round((si / rows.length) * 100) : 0
        };
      }

      res.json(summary);
    } catch (error) {
      console.error('Error al obtener resumen:', error);
      res.status(500).json({ mensaje: 'Error al obtener resumen' });
    }
  }
);

// =====================================================
// POST /api/student-payment-tracking/seed
// Crear registros base manualmente
// =====================================================
router.post(
  '/seed',
  verifyToken,
  verifyRole(allowManage),
  async (req, res) => {
    try {
      const { cycleId, students } = req.body;

      if (!cycleId || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({
          mensaje: 'Debes enviar cycleId y un arreglo de students'
        });
      }

      const cycle = await Cycle.findById(cycleId);
      if (!cycle) {
        return res.status(404).json({ mensaje: 'Ciclo no encontrado' });
      }

      let created = 0;
      let updated = 0;

      for (const student of students) {
        const matricula = String(student.matricula || '').trim();
        const nombre = String(student.nombre || '').trim();
        const grupo = String(student.grupo || '').trim();
        const seccion = String(student.seccion || '').trim();

        if (!matricula || !nombre) continue;

        const initialPayments = {};
        for (const month of cycle.months) {
          initialPayments[month.key] = {
            value: '',
            updatedAt: null,
            updatedBy: null
          };
        }

        const existing = await StudentPaymentTracking.findOne({
          matricula,
          cycleId
        });

        if (existing) {
          existing.nombre = nombre;
          existing.grupo = grupo;
          existing.seccion = seccion;

          for (const month of cycle.months) {
            if (!existing.payments.has(month.key)) {
              existing.payments.set(month.key, {
                value: '',
                updatedAt: null,
                updatedBy: null
              });
            }
          }

          await existing.save();
          updated++;
        } else {
          await StudentPaymentTracking.create({
            matricula,
            nombre,
            grupo,
            seccion,
            cycleId,
            payments: initialPayments
          });
          created++;
        }
      }

      res.json({
        mensaje: 'Registros base procesados correctamente',
        created,
        updated
      });
    } catch (error) {
      console.error('Error al sembrar registros base:', error);
      res.status(500).json({ mensaje: 'Error al crear registros base' });
    }
  }
);

// =====================================================
// PATCH /api/student-payment-tracking/:id/academic
// Editar asistencia, motivo, notas académicas
// =====================================================
router.patch(
  '/:id/academic',
  verifyToken,
  verifyRole(allowAcademicEdit),
  async (req, res) => {
    try {
      const { asistencia, motivo, notasAcademicas } = req.body;

      const row = await StudentPaymentTracking.findById(req.params.id);
      if (!row) {
        return res.status(404).json({ mensaje: 'Registro no encontrado' });
      }

      if (typeof asistencia !== 'undefined') {
        const asistenciaValida = ['', 'REGULAR', 'IRREGULAR'];
        if (!asistenciaValida.includes(asistencia)) {
          return res.status(400).json({ mensaje: 'Asistencia no válida' });
        }
        row.asistencia = asistencia;
      }

      if (typeof motivo !== 'undefined') {
        row.motivo = String(motivo || '').trim();
      }

      if (typeof notasAcademicas !== 'undefined') {
        row.notasAcademicas = String(notasAcademicas || '').trim();
      }

      await row.save();

      res.json({
        mensaje: 'Información académica actualizada correctamente',
        row
      });
    } catch (error) {
      console.error('Error al actualizar información académica:', error);
      res.status(500).json({ mensaje: 'Error al actualizar información académica' });
    }
  }
);

// =====================================================
// PATCH /api/student-payment-tracking/:id/admin-notes
// Editar notas administrativas
// =====================================================
router.patch(
  '/:id/admin-notes',
  verifyToken,
  verifyRole(allowAdminNotesEdit),
  async (req, res) => {
    try {
      const { notasAdministrativas } = req.body;

      const row = await StudentPaymentTracking.findById(req.params.id);
      if (!row) {
        return res.status(404).json({ mensaje: 'Registro no encontrado' });
      }

      row.notasAdministrativas = String(notasAdministrativas || '').trim();

      await row.save();

      res.json({
        mensaje: 'Notas administrativas actualizadas correctamente',
        row
      });
    } catch (error) {
      console.error('Error al actualizar notas administrativas:', error);
      res.status(500).json({ mensaje: 'Error al actualizar notas administrativas' });
    }
  }
);

module.exports = router;
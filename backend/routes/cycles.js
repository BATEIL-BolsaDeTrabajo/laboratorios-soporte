const express = require('express');
const router = express.Router();

const Cycle = require('../models/Cycle');
const { verifyToken, verifyRole } = require('../middlewares/auth');

// Roles permitidos para administrar ciclos
const allowManageCycles = ['admin', 'direccion', 'subdireccion'];

// =====================================================
// GET /api/cycles
// Listar todos los ciclos
// =====================================================
router.get(
  '/',
  verifyToken,
  verifyRole(allowManageCycles),
  async (req, res) => {
    try {
      const cycles = await Cycle.find()
        .populate('createdBy', 'nombre correo')
        .sort({ createdAt: -1 });

      res.json(cycles);
    } catch (error) {
      console.error('Error al listar ciclos:', error);
      res.status(500).json({ mensaje: 'Error al listar ciclos' });
    }
  }
);

// =====================================================
// GET /api/cycles/active
// Listar ciclos activos (para Caja después)
// =====================================================
router.get(
  '/active',
  verifyToken,
  async (req, res) => {
    try {
      const cycles = await Cycle.find({ isActive: true }).sort({ createdAt: -1 });
      res.json(cycles);
    } catch (error) {
      console.error('Error al listar ciclos activos:', error);
      res.status(500).json({ mensaje: 'Error al listar ciclos activos' });
    }
  }
);

// =====================================================
// GET /api/cycles/:id
// Obtener un ciclo por ID
// =====================================================
router.get(
  '/:id',
  verifyToken,
  async (req, res) => {
    try {
      const cycle = await Cycle.findById(req.params.id).populate('createdBy', 'nombre correo');

      if (!cycle) {
        return res.status(404).json({ mensaje: 'Ciclo no encontrado' });
      }

      res.json(cycle);
    } catch (error) {
      console.error('Error al obtener ciclo:', error);
      res.status(500).json({ mensaje: 'Error al obtener ciclo' });
    }
  }
);

// =====================================================
// POST /api/cycles
// Crear un ciclo
// =====================================================
router.post(
  '/',
  verifyToken,
  verifyRole(allowManageCycles),
  async (req, res) => {
    try {
      const { name, months, isActive } = req.body;

      if (!name || !Array.isArray(months) || months.length === 0) {
        return res.status(400).json({
          mensaje: 'Debes enviar nombre y al menos un mes para el ciclo'
        });
      }

      const exists = await Cycle.findOne({ name: name.trim() });
      if (exists) {
        return res.status(400).json({ mensaje: 'Ya existe un ciclo con ese nombre' });
      }

      const normalizedMonths = months.map((m, index) => ({
        key: String(m.key || '').trim().toLowerCase(),
        label: String(m.label || '').trim(),
        order: Number(m.order ?? index + 1)
      }));

      const hasInvalidMonth = normalizedMonths.some(
        (m) => !m.key || !m.label || Number.isNaN(m.order)
      );

      if (hasInvalidMonth) {
        return res.status(400).json({
          mensaje: 'Todos los meses deben tener key, label y order válidos'
        });
      }

      // Si este ciclo llega activo, desactivar los demás
      if (isActive === true) {
        await Cycle.updateMany({}, { $set: { isActive: false } });
      }

      const newCycle = new Cycle({
        name: name.trim(),
        months: normalizedMonths,
        isActive: !!isActive,
        createdBy: req.usuario.id
      });

      await newCycle.save();

      res.status(201).json({
        mensaje: 'Ciclo creado correctamente',
        cycle: newCycle
      });
    } catch (error) {
      console.error('Error al crear ciclo:', error);
      res.status(500).json({ mensaje: 'Error al crear ciclo' });
    }
  }
);

// =====================================================
// PUT /api/cycles/:id
// Editar nombre y meses de un ciclo
// =====================================================
router.put(
  '/:id',
  verifyToken,
  verifyRole(allowManageCycles),
  async (req, res) => {
    try {
      const { name, months } = req.body;

      const cycle = await Cycle.findById(req.params.id);
      if (!cycle) {
        return res.status(404).json({ mensaje: 'Ciclo no encontrado' });
      }

      if (name) {
        const exists = await Cycle.findOne({
          name: name.trim(),
          _id: { $ne: req.params.id }
        });

        if (exists) {
          return res.status(400).json({ mensaje: 'Ya existe otro ciclo con ese nombre' });
        }

        cycle.name = name.trim();
      }

      if (Array.isArray(months) && months.length > 0) {
        const normalizedMonths = months.map((m, index) => ({
          key: String(m.key || '').trim().toLowerCase(),
          label: String(m.label || '').trim(),
          order: Number(m.order ?? index + 1)
        }));

        const hasInvalidMonth = normalizedMonths.some(
          (m) => !m.key || !m.label || Number.isNaN(m.order)
        );

        if (hasInvalidMonth) {
          return res.status(400).json({
            mensaje: 'Todos los meses deben tener key, label y order válidos'
          });
        }

        cycle.months = normalizedMonths;
      }

      await cycle.save();

      res.json({
        mensaje: 'Ciclo actualizado correctamente',
        cycle
      });
    } catch (error) {
      console.error('Error al actualizar ciclo:', error);
      res.status(500).json({ mensaje: 'Error al actualizar ciclo' });
    }
  }
);

// =====================================================
// PATCH /api/cycles/:id/activate
// Activar un ciclo y desactivar los demás
// =====================================================
router.patch(
  '/:id/activate',
  verifyToken,
  verifyRole(allowManageCycles),
  async (req, res) => {
    try {
      const cycle = await Cycle.findById(req.params.id);
      if (!cycle) {
        return res.status(404).json({ mensaje: 'Ciclo no encontrado' });
      }

      await Cycle.updateMany({}, { $set: { isActive: false } });

      cycle.isActive = true;
      await cycle.save();

      res.json({
        mensaje: 'Ciclo activado correctamente',
        cycle
      });
    } catch (error) {
      console.error('Error al activar ciclo:', error);
      res.status(500).json({ mensaje: 'Error al activar ciclo' });
    }
  }
);

// =====================================================
// PATCH /api/cycles/:id/deactivate
// Desactivar un ciclo
// =====================================================
router.patch(
  '/:id/deactivate',
  verifyToken,
  verifyRole(allowManageCycles),
  async (req, res) => {
    try {
      const cycle = await Cycle.findById(req.params.id);
      if (!cycle) {
        return res.status(404).json({ mensaje: 'Ciclo no encontrado' });
      }

      cycle.isActive = false;
      await cycle.save();

      res.json({
        mensaje: 'Ciclo desactivado correctamente',
        cycle
      });
    } catch (error) {
      console.error('Error al desactivar ciclo:', error);
      res.status(500).json({ mensaje: 'Error al desactivar ciclo' });
    }
  }
);

// =====================================================
// DELETE /api/cycles/:id
// Eliminar ciclo
// =====================================================
router.delete(
  '/:id',
  verifyToken,
  verifyRole(allowManageCycles),
  async (req, res) => {
    try {
      const cycle = await Cycle.findById(req.params.id);
      if (!cycle) {
        return res.status(404).json({ mensaje: 'Ciclo no encontrado' });
      }

      await Cycle.findByIdAndDelete(req.params.id);

      res.json({ mensaje: 'Ciclo eliminado correctamente' });
    } catch (error) {
      console.error('Error al eliminar ciclo:', error);
      res.status(500).json({ mensaje: 'Error al eliminar ciclo' });
    }
  }
);

module.exports = router;
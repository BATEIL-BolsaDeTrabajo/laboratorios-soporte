const express = require('express');
const router = express.Router();
const ReporteFalla = require('../models/ReporteFalla');
const { verifyToken } = require('../middlewares/auth');

// Crear reporte
router.post('/', verifyToken, async (req, res) => {
  const { laboratorio, equipo, tipoFalla, descripcion } = req.body;
  try {
    const nuevo = new ReporteFalla({
      laboratorio,
      equipo,
      tipoFalla,
      descripcion,
      reportadoPor: req.usuario.id
    });
    await nuevo.save();
    res.status(201).json({ mensaje: 'Reporte registrado con éxito' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al registrar el reporte' });
  }
});

// Obtener todos (opcional, para panel de soporte)
router.get('/', verifyToken, async (req, res) => {
  const reportes = await ReporteFalla.find()
  .populate('reportadoPor', 'nombre correo')
  .populate('asignadoA', 'nombre correo');
  res.json(reportes);
});

// ✅ ACTUALIZAR una falla
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { estatus, requiereMaterial, asignar } = req.body;
    const update = {};

    if (estatus) update.estatus = estatus;
    if (requiereMaterial !== undefined) update.requiereMaterial = requiereMaterial;

    if (asignar) {
      update.asignadoA = req.usuario.id;
    }

    const resultado = await ReporteFalla.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );

    if (!resultado) return res.status(404).json({ mensaje: 'Falla no encontrada' });

    res.json({ mensaje: '✅ Ticket actualizado correctamente' });
  } catch (error) {
    console.error('❌ Error al actualizar falla:', error);
    res.status(500).json({ mensaje: 'Error al actualizar falla' });
  }
});

module.exports = router;

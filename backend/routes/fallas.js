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
  const reportes = await ReporteFalla.find().populate('reportadoPor', 'nombre correo');
  res.json(reportes);
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Vacacion = require('../models/Vacacion');
const User = require('../models/User');
const { verifyToken, verifyRole } = require('../middlewares/auth');

// 🧑‍🏫 1. Solicitar vacaciones (docentes y talleres)
router.post('/solicitar', verifyToken, verifyRole(['docente', 'talleres']), async (req, res) => {
  try {
    const { fechaInicio, fechaFin, motivo, detalles } = req.body;

    const fecha1 = new Date(`${fechaInicio}T12:00:00`);
    const fecha2 = new Date(`${fechaFin}T12:00:00`);
    const diasSolicitados = Math.ceil((fecha2 - fecha1) / (1000 * 60 * 60 * 24)) + 1;

    const usuario = await User.findById(req.usuario.id);
    const diasDisponibles = usuario.diasVacacionesDisponibles ?? 0;

    const diasPorPagar = diasSolicitados > diasDisponibles
      ? diasSolicitados - diasDisponibles
      : 0;

    const diasRestantes = Math.max(diasDisponibles - diasSolicitados, 0);

    const nueva = new Vacacion({
      solicitante: req.usuario.id,
      fechaInicio: fecha1,
      fechaFin: fecha2,
      motivo,
      detalles,
      diasSolicitados,
      diasDisponiblesAntes: diasDisponibles,
      diasRestantes,
      diasPorPagar
    });

    await nueva.save();
    res.status(201).json({ mensaje: 'Solicitud enviada', vacacion: nueva });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al registrar solicitud', error: err.message });
  }
});


// ✅ 2. Ver solicitudes (solo RR.HH.)
router.get('/todas', verifyToken, verifyRole(['rrhh']), async (req, res) => {
  try {
    const solicitudes = await Vacacion.find().populate('solicitante revisadoPor', 'nombre roles');
    res.json(solicitudes);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener solicitudes' });
  }
});

// ✅ 3. Ver solicitudes propias (docente o talleres)
router.get('/mis-solicitudes', verifyToken, verifyRole(['docente', 'talleres']), async (req, res) => {
  try {
    const solicitudes = await Vacacion.find({ solicitante: req.usuario.id });
    res.json(solicitudes);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener solicitudes' });
  }
});

// 🧾 4. Aprobar o rechazar solicitud (subdirección o finanzas)
router.put('/revisar/:id', verifyToken, verifyRole(['subdireccion', 'finanzas']), async (req, res) => {
  try {
    const { estatus, motivoRespuesta } = req.body;
    if (!['Aceptado', 'Rechazado'].includes(estatus)) {
      return res.status(400).json({ mensaje: 'Estatus inválido' });
    }

    const vacacion = await Vacacion.findById(req.params.id);
    if (!vacacion) return res.status(404).json({ mensaje: 'Solicitud no encontrada' });

    // Validar si el usuario revisor tiene permiso según el tipo de solicitante
    const solicitante = await User.findById(vacacion.solicitante);
    const esDocente = solicitante.roles.includes('docente');
    const esTaller = solicitante.roles.includes('talleres');
    const rolRevisor = req.usuario.roles.includes('subdireccion') ? 'subdireccion' : 'finanzas';

    if (esDocente && rolRevisor !== 'subdireccion') {
      return res.status(403).json({ mensaje: 'Solo subdirección puede aprobar docentes' });
    }

    if (esTaller && rolRevisor !== 'finanzas') {
      return res.status(403).json({ mensaje: 'Solo finanzas puede aprobar talleres' });
    }

    vacacion.estatus = estatus;
    vacacion.revisadoPor = req.usuario.id;
    vacacion.rolRevisor = rolRevisor;
    vacacion.motivoRespuesta = motivoRespuesta;

    await vacacion.save();
    res.json({ mensaje: 'Solicitud actualizada', vacacion });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al revisar solicitud', error: err.message });
  }
});

// 🔐 Ruta para Subdirección y Finanzas: Ver solicitudes pendientes según su rol
router.get('/pendientes', verifyToken, verifyRole(['subdireccion', 'finanzas']), async (req, res) => {
  try {
    const todas = await Vacacion.find({ estatus: 'Pendiente' }).populate('solicitante');
    const esSubdireccion = req.usuario.roles.includes('subdireccion');
    const esFinanzas = req.usuario.roles.includes('finanzas');

    const filtradas = todas.filter(s => {
      const roles = s.solicitante?.roles || [];
      if (roles.includes('docente') && esSubdireccion) return true;
      if (roles.includes('talleres') && esFinanzas) return true;
      return false;
    });

    res.json(filtradas);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener solicitudes pendientes' });
  }
});

// Obtener historial de vacaciones de un usuario específico (solo RR.HH.)
router.get('/usuario/:id', verifyToken, verifyRole(['rrhh']), async (req, res) => {
  try {
    const solicitudes = await Vacacion.find({ solicitante: req.params.id })
      .populate('revisadoPor', 'nombre'); // 👈 CORREGIDO

    res.json(solicitudes);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener vacaciones del usuario', error: err.message });
  }
});

// 📄 Obtener una solicitud específica por ID (para formato imprimible)
router.get('/solicitud/:id', verifyToken, async (req, res) => {
  try {
    const solicitud = await Vacacion.findById(req.params.id).populate('solicitante', 'nombre fechaIngreso puesto departamento diasVacacionesDisponibles');
    if (!solicitud) {
      return res.status(404).json({ mensaje: 'Solicitud no encontrada' });
    }

    solicitud.usuario = solicitud.solicitante;

    res.json({ solicitud });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener solicitud', error: err.message });
  }
});


module.exports = router;

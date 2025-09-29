const express = require('express');
const router = express.Router();
const Tiempo = require('../models/TiempoPorTiempo');
const User = require('../models/User');
const { verifyToken, verifyRole } = require('../middlewares/auth');

// Subdirección puede crear para docentes, Finanzas puede crear para talleres
router.post('/crear', verifyToken, verifyRole(['subdireccion', 'finanzas']), async (req, res) => {
  const { docenteId, horas, motivo } = req.body;

  try {
    const usuario = await User.findById(docenteId);
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    const esDocente = usuario.roles.includes('docente');
    const esTaller = usuario.roles.includes('talleres');
    const esSubdireccion = req.usuario.roles.includes('subdireccion');
    const esFinanzas = req.usuario.roles.includes('finanzas');

    if (esDocente && !esSubdireccion) {
      return res.status(403).json({ mensaje: 'Solo subdirección puede registrar a docentes' });
    }

    if (esTaller && !esFinanzas) {
      return res.status(403).json({ mensaje: 'Solo finanzas puede registrar a talleres' });
    }

    const nuevo = new Tiempo({
      docente: docenteId,
      horas,
      motivo
    });

    await nuevo.save();
    res.status(201).json({ mensaje: 'Registro creado correctamente', tiempo: nuevo });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al crear tiempo por tiempo', error: err.message });
  }
});


// 🟩 Finanzas aprueba o rechaza
router.put('/revisar/:id', verifyToken, verifyRole(['finanzas']), async (req, res) => {
  const { estatus, motivoRespuesta } = req.body;
  if (!['Aceptado', 'Rechazado'].includes(estatus)) {
    return res.status(400).json({ mensaje: 'Estatus inválido' });
  }

  try {
    const registro = await Tiempo.findById(req.params.id);
    if (!registro) return res.status(404).json({ mensaje: 'Registro no encontrado' });

    registro.estatus = estatus;
    registro.revisadoPor = req.usuario.id;
    registro.motivoRespuesta = motivoRespuesta;

    await registro.save();
    res.json({ mensaje: 'Registro actualizado', tiempo: registro });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al revisar registro', error: err.message });
  }
});

// Docentes y talleres pueden ver sus propios registros
router.get('/mis-registros', verifyToken, verifyRole(['docente', 'talleres']), async (req, res) => {
  try {
    const registros = await Tiempo.find({ docente: req.usuario.id });
    res.json(registros);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener registros' });
  }
});


// Tiempo por Tiempo: Finanzas ve los pendientes
router.get('/pendientes', verifyToken, verifyRole(['finanzas']), async (req, res) => {
  try {
    const registros = await Tiempo.find({ estatus: 'Pendiente' }).populate('docente');
    res.json(registros);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener registros pendientes' });
  }
});

// Solo subdirección: ver solicitudes creadas por ella
router.get('/solicitudes-creadas', verifyToken, verifyRole(['subdireccion']), async (req, res) => {
  try {
    const solicitudes = await Tiempo.find({ estatus: { $ne: null } })
      .populate('docente revisadoPor', 'nombre roles');

    // Opcional: podrías filtrar por una propiedad "creadoPor" si la ruta original guarda quién las generó
    res.json(solicitudes);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener solicitudes' });
  }
});

// RRHH puede ver todos los registros de tiempo por tiempo
router.get('/todos', verifyToken, verifyRole(['rrhh']), async (req, res) => {
  try {
    const registros = await Tiempo.find().populate('docente revisadoPor', 'nombre');
    res.json(registros);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener registros' });
  }
});

// Obtener historial de tiempo por tiempo de un usuario específico (solo RR.HH.)
router.get('/usuario/:id', verifyToken, verifyRole(['rrhh']), async (req, res) => {
  try {
    const registros = await Tiempo.find({ docente: req.params.id })
      .populate('revisadoPor', 'nombre');

    res.json(registros);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener tiempo por tiempo del usuario' });
  }
});


module.exports = router;

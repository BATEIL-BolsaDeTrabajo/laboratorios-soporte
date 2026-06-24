const express = require('express');
const router = express.Router();
const Vacacion = require('../models/Vacacion');
const User = require('../models/User');
const { verifyToken, verifyRole } = require('../middlewares/auth');

function normalizarDepartamento(departamento = '') {
  return String(departamento)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function obtenerRolRevisorPermitido(departamento) {
  const normalizado = normalizarDepartamento(departamento);
  if (normalizado === 'academico') return 'subdireccion';
  if (normalizado === 'administrativo') return 'finanzas';
  return null;
}

function contarDiasVacaciones(fechaInicio, fechaFin) {
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  let total = 0;

  for (const fecha = new Date(inicio); fecha <= fin; fecha.setDate(fecha.getDate() + 1)) {
    const esDomingo = fecha.getDay() === 0;
    if (!esDomingo) total += 1;
  }

  return total;
}

function calcularConsumoVacaciones(diasSolicitados, diasAcumulados, diasDisponibles) {
  const saldoTotalAntes = Math.max(diasAcumulados || 0, 0) + Math.max(diasDisponibles || 0, 0);
  const diasPorPagar = Math.max(diasSolicitados - saldoTotalAntes, 0);

  return {
    saldoTotalAntes,
    saldoTotalRestante: Math.max(saldoTotalAntes - diasSolicitados, 0),
    diasPorPagar
  };
}

// 🧑‍🏫 1. Solicitar vacaciones (docentes y talleres)
router.post('/solicitar', verifyToken, async (req, res) => {
  try {
    const { fechaInicio, fechaFin, motivo, detalles } = req.body;

    const fecha1 = new Date(`${fechaInicio}T12:00:00`);
    const fecha2 = new Date(`${fechaFin}T12:00:00`);

    if (Number.isNaN(fecha1.getTime()) || Number.isNaN(fecha2.getTime())) {
      return res.status(400).json({ mensaje: 'Fechas invalidas' });
    }

    if (fecha2 < fecha1) {
      return res.status(400).json({ mensaje: 'La fecha de termino no puede ser anterior a la fecha de inicio' });
    }

    const diasSolicitados = contarDiasVacaciones(fecha1, fecha2);

    const usuario = await User.findById(req.usuario.id);
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    if (!obtenerRolRevisorPermitido(usuario.departamento)) {
      return res.status(400).json({
        mensaje: 'Tu usuario no tiene departamento academico o administrativo asignado'
      });
    }

    const consumoPreview = calcularConsumoVacaciones(
      diasSolicitados,
      usuario.diasVacacionesAcumulados,
      usuario.diasVacacionesDisponibles
    );

    const nueva = new Vacacion({
      solicitante: req.usuario.id,
      fechaInicio: fecha1,
      fechaFin: fecha2,
      motivo,
      detalles,
      diasSolicitados,
      diasDisponiblesAntes: consumoPreview.saldoTotalAntes,
      diasRestantes: consumoPreview.saldoTotalRestante,
      diasPorPagar: consumoPreview.diasPorPagar
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
    const solicitudes = await Vacacion.find().populate(
      'solicitante revisadoPor',
      'nombre roles diasVacacionesDisponibles diasVacacionesPrestacion diasVacacionesAcumulados'
    );
    res.json(solicitudes);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener solicitudes' });
  }
});

// ✅ 3. Ver solicitudes propias (docente o talleres)
router.get('/mis-solicitudes', verifyToken, async (req, res) => {
  try {
    const usuario = await User.findById(req.usuario.id).select('diasVacacionesAcumulados');
    const diasAcumulados = usuario?.diasVacacionesAcumulados || 0;
    const solicitudes = await Vacacion.find({ solicitante: req.usuario.id }).lean();

    res.json(solicitudes.map((solicitud) => ({
      ...solicitud,
      diasAcumulados
    })));
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
    if (!solicitante) return res.status(404).json({ mensaje: 'Solicitante no encontrado' });

    const rolesRevisor = req.usuario.roles || [];
    const rolPermitido = obtenerRolRevisorPermitido(solicitante.departamento);

    if (!rolPermitido) {
      return res.status(400).json({
        mensaje: 'El solicitante no tiene departamento academico o administrativo asignado'
      });
    }

    if (!rolesRevisor.includes(rolPermitido)) {
      return res.status(403).json({
        mensaje: rolPermitido === 'subdireccion'
          ? 'Solo subdireccion puede aprobar solicitudes del departamento academico'
          : 'Solo finanzas puede aprobar solicitudes del departamento administrativo'
      });
    }

    const estatusAnterior = vacacion.estatus;

    if (estatus === 'Aceptado' && estatusAnterior !== 'Aceptado') {
      const consumo = calcularConsumoVacaciones(
        vacacion.diasSolicitados,
        solicitante.diasVacacionesAcumulados,
        solicitante.diasVacacionesDisponibles
      );

      vacacion.diasDisponiblesAntes = consumo.saldoTotalAntes;
      vacacion.diasRestantes = consumo.saldoTotalRestante;
      vacacion.diasPorPagar = consumo.diasPorPagar;
      solicitante.diasVacacionesAcumulados = 0;
      solicitante.diasVacacionesDisponibles = consumo.saldoTotalRestante;
      await solicitante.save();
    }

    vacacion.estatus = estatus;
    vacacion.revisadoPor = req.usuario.id;
    vacacion.rolRevisor = rolPermitido;
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

    const filtradas = todas.filter((s) => {
      const rolPermitido = obtenerRolRevisorPermitido(s.solicitante?.departamento);
      if (rolPermitido === 'subdireccion' && esSubdireccion) return true;
      if (rolPermitido === 'finanzas' && esFinanzas) return true;
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
    const solicitud = await Vacacion.findById(req.params.id).populate('solicitante', 'nombre fechaIngreso puesto departamento diasVacacionesDisponibles diasVacacionesPrestacion');
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

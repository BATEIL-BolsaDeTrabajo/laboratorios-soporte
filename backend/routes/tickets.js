// routes/tickets.js
const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { verifyToken, verifyRole } = require('../middlewares/auth'); // adapta si tu middleware se llama distinto

// ===== Helpers de validación mínima =====
function validarPayload(body) {
  const errors = [];
  const { area, tipo, laboratorio, equipo, ubicacion, salon, tipoFalla, descripcion } = body;

  if (!area || !['sistemas','mantenimiento'].includes(area)) {
    errors.push('Área inválida (sistemas|mantenimiento).');
  }

  if (!tipoFalla) errors.push('Falta tipo de falla.');
  if (!descripcion) errors.push('Falta descripción.');

  if (area === 'sistemas') {
    if (!tipo || !['laboratorio','otro'].includes(tipo)) {
      errors.push('En sistemas, tipo debe ser laboratorio|otro.');
    } else if (tipo === 'laboratorio') {
      if (!laboratorio) errors.push('Selecciona laboratorio.');
      if (!equipo) errors.push('Indica etiqueta de equipo.');
    } else if (tipo === 'otro') {
      if (!ubicacion) errors.push('Indica ubicación.');
    }
  }

  if (area === 'mantenimiento') {
    if (!salon) errors.push('Indica salón/área.');
  }

  return errors;
}

// ===== Crear ticket =====
// POST /api/tickets
// ===== Crear ticket =====
// POST /api/tickets
router.post('/', verifyToken, async (req, res) => {
  try {
    // 1) Validación del body
    const errors = validarPayload(req.body);
    if (errors.length) return res.status(400).json({ ok: false, errors });

    // 2) Normalizar id del usuario desde el middleware
    const userId =
      (req.user && (req.user._id || req.user.id)) ||
      req.userId ||
      null;

    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Token válido pero sin id de usuario.' });
    }

    // 3) Crear ticket
    const t = await Ticket.create({
      ...req.body,
      creadoPor: userId
    });

    return res.status(201).json({ ok: true, ticket: t });
  } catch (err) {
    console.error('POST /tickets error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'No se pudo crear el ticket.' });
  }
});


// ===== Listar con filtros =====
// GET /api/tickets?area=&tipo=&estado=&laboratorio=&salon=&q=
router.get('/', verifyToken, async (req, res) => {
  try {
    const { area, tipo, estado, laboratorio, salon, q } = req.query;
    const find = {};
    if (area && ['sistemas','mantenimiento'].includes(area)) find.area = area;
    if (tipo && ['laboratorio','otro'].includes(tipo)) find.tipo = tipo;
    if (estado) find.estado = estado;
    if (laboratorio) find.laboratorio = laboratorio;
    if (salon) find.salon = salon;

    // Búsqueda simple por título/desc/equipo (si tienes "titulo", agrega aquí)
    if (q) {
      const regex = new RegExp(q, 'i');
      find.$or = [
        { descripcion: regex },
        { tipoFalla: regex },
        { equipo: regex },
        { laboratorio: regex },
        { salon: regex },
        { ubicacion: regex }
      ];
    }

    const tickets = await Ticket.find(find)
      .populate('creadoPor', 'nombre email rol')
      .populate('asignadoA', 'nombre email rol')
      .sort({ createdAt: -1 });

    res.json({ ok: true, tickets });
  } catch (err) {
    console.error('GET /tickets error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo obtener la lista.' });
  }
});

// ===== Cambiar estado / asignar =====
// PATCH /api/tickets/:id/estado   body: { estado }
// roles: soporte/mantenimiento/admin (ajústalo a tu lógica)
router.patch('/:id/estado', verifyToken, verifyRole(['admin','soporte','mantenimiento']), async (req, res) => {
  try {
    const { estado } = req.body;
    if (!['Abierto','En atención','Resuelto','Cerrado','Cancelado'].includes(estado)) {
      return res.status(400).json({ ok: false, error: 'Estado inválido.' });
    }
    const t = await Ticket.findByIdAndUpdate(
      req.params.id,
      { $set: { estado } },
      { new: true }
    );
    res.json({ ok: true, ticket: t });
  } catch (err) {
    console.error('PATCH /tickets/:id/estado error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo actualizar el estado.' });
  }
});

// PATCH /api/tickets/:id/asignar   body: { asignadoA }
router.patch('/:id/asignar', verifyToken, verifyRole(['admin','soporte','mantenimiento']), async (req, res) => {
  try {
    const { asignadoA } = req.body;
    const t = await Ticket.findByIdAndUpdate(
      req.params.id,
      { $set: { asignadoA: asignadoA || null } },
      { new: true }
    );
    res.json({ ok: true, ticket: t });
  } catch (err) {
    console.error('PATCH /tickets/:id/asignar error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo asignar el ticket.' });
  }
});

module.exports = router;

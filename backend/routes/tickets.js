// routes/tickets.js
const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { verifyToken, verifyRole } = require('../middlewares/auth');

// ===== Validación suave para el payload nuevo =====
function validarNuevoPayload(body) {
  const errors = [];
  const { area, tipo, laboratorio, equipo, ubicacion, salon, tipoFalla, descripcion } = body;

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
  } else if (area === 'mantenimiento') {
    if (!salon) errors.push('Indica salón/área.');
  }

  return errors;
}

// ===== Crear ticket =====
router.post('/', verifyToken, async (req, res) => {
  try {
    const body = req.body;
    const userId = req.usuario?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Token válido pero sin id de usuario.' });
    }

    let doc = null;

    if (body.area) {
      // ==== NUEVO formato unificado ====
      const errores = validarNuevoPayload(body);
      if (errores.length) return res.status(400).json({ ok: false, errors: errores });

      const tipoGeneral = body.area === 'sistemas' ? 'Sistemas' : 'Mantenimiento';

      doc = {
        descripcion: body.descripcion,
        tipo: tipoGeneral, // Sistemas | Mantenimiento
        subtipo: body.area === 'sistemas' ? body.tipo : null, // laboratorio | otro
        laboratorio: body.laboratorio || null,
        equipo: body.equipo || null,
        ubicacion: body.ubicacion || null,
        salon: body.salon || null,
        tipoFalla: body.tipoFalla || null,
        creadoPor: userId,
        estatus: 'Abierto',
        requiereMaterial: '',
        resolucion: ''
      };
    } else {
      // ==== Formato viejo ====
      if (!body.tipo || !['Sistemas','Mantenimiento'].includes(body.tipo)) {
        return res.status(400).json({ ok: false, error: 'tipo debe ser Sistemas|Mantenimiento' });
      }
      if (!body.descripcion) {
        return res.status(400).json({ ok: false, error: 'Falta descripción.' });
      }
      doc = {
        descripcion: body.descripcion,
        tipo: body.tipo,
        creadoPor: userId,
        estatus: 'Abierto'
      };
    }

    const nuevo = await Ticket.create(doc);
    return res.status(201).json({ ok: true, mensaje: 'Ticket creado', ticket: nuevo });
  } catch (err) {
    console.error('POST /tickets error:', err);
    return res.status(500).json({ ok: false, error: 'No se pudo crear el ticket.' });
  }
});

// ===== Obtener tickets según rol =====
router.get('/', verifyToken, async (req, res) => {
  const rol = req.usuario.roles || req.usuario.rol;
  let filtro = {};

  if (rol.includes && rol.includes('soporte')) filtro.tipo = 'Sistemas';
  else if (rol.includes && rol.includes('mantenimiento')) filtro.tipo = 'Mantenimiento';
  else if (typeof rol === 'string') {
    if (rol === 'soporte') filtro.tipo = 'Sistemas';
    if (rol === 'mantenimiento') filtro.tipo = 'Mantenimiento';
  }

  const tickets = await Ticket.find(filtro)
    .populate('creadoPor', 'nombre')
    .populate('asignadoA', 'nombre');

  res.json(tickets);
});

// ===== Actualizar ticket =====
router.put('/:id', verifyToken, async (req, res) => {
  const { estatus, requiereMaterial, resolucion, asignar, asignadoA } = req.body;
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ mensaje: 'Ticket no encontrado' });

  // No permitir reabrir un cerrado cambiando a otro estado (opcional)
  if (ticket.estatus === 'Cerrado' && estatus && estatus !== 'Cerrado') {
    return res.status(400).json({ mensaje: 'No se puede modificar un ticket cerrado.' });
  }

  // --- CAMBIO DE ESTATUS Y FECHAS ---
  if (estatus) {
    // 1) Guardar fecha de inicio SOLO una vez cuando entra a "En proceso"
    if (estatus === 'En proceso' && !ticket.fechaInicio) {
      ticket.fechaInicio = new Date();
    }

    // 2) Poner fecha de cierre al resolver/cerrar
    if ((estatus === 'Resuelto' || estatus === 'Cerrado')) {
      ticket.fechaCierre = new Date();
    }

    // 3) Si vuelve a "Abierto", limpiar fechas de inicio y cierre
    if (estatus === 'Abierto') {
      ticket.fechaInicio = null;
      ticket.fechaCierre = null;
    }

    // 4) "En espera de material" NO toca fechas. (pausa)
    //    Cuando se reanude a "En proceso", NO se vuelve a pisar fechaInicio.

    ticket.estatus = estatus;
  }

  // --- Actualizar campos de trabajo según rol ---
  const roles = req.usuario.roles || [req.usuario.rol];
  if (roles.includes('soporte') || roles.includes('mantenimiento')) {
    if (typeof requiereMaterial !== 'undefined') ticket.requiereMaterial = requiereMaterial;
    if (typeof resolucion       !== 'undefined') ticket.resolucion       = resolucion;

    if (asignar) {
      if (ticket.estatus === "Cerrado" || ticket.estatus === "Resuelto") {
        return res.status(400).json({ mensaje: "No puedes asignarte un ticket cerrado o resuelto." });
      }
      ticket.asignadoA = req.usuario.id;
    }
  }
  if (asignadoA) ticket.asignadoA = asignadoA;

  await ticket.save();
  res.json({ mensaje: 'Ticket actualizado correctamente' });
});


// ===== Tickets asignables (para admin) =====
router.get('/asignables', verifyToken, verifyRole(['admin', 'finanzas']), async (req, res) => {
  try {
    const tickets = await Ticket.find({
      estatus: { $in: ['Abierto', 'En proceso'] },
      asignadoA: null
    })
      .populate('creadoPor', 'nombre')
      .sort({ fechaCreacion: -1 });

    res.json(tickets);
  } catch (err) {
    console.error('Error al obtener tickets asignables:', err);
    res.status(500).json({ mensaje: 'Error al obtener tickets asignables' });
  }
});

module.exports = router;

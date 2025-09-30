const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { verifyToken, verifyRole } = require('../middlewares/auth');

// Crear ticket (docente)
router.post('/', verifyToken, async (req, res) => {
  const { descripcion, tipo } = req.body;
  try {
    const nuevo = new Ticket({
      descripcion,
      tipo,
      creadoPor: req.usuario.id
    });
    await nuevo.save();
    res.status(201).json({ mensaje: 'Ticket creado' });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al crear ticket' });
  }
});

// Ver tickets (filtrados por área si no es admin)
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


// Actualizar ticket (estatus, asignado, material, etc.)
router.put('/:id', verifyToken, async (req, res) => {
  const { estatus, requiereMaterial, asignar, asignadoA } = req.body;
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ mensaje: 'Ticket no encontrado' });

  // ❌ No permitir cambiar el estatus de un ticket cerrado
  if (ticket.estatus === 'Cerrado' && estatus && estatus !== 'Cerrado') {
    return res.status(400).json({ mensaje: 'No se puede modificar un ticket cerrado.' });
  }

  // ✅ Estatus y fecha cierre
  if (estatus) {
    ticket.estatus = estatus;

    if ((estatus === 'Resuelto' || estatus === 'Cerrado') && !ticket.fechaCierre) {
      ticket.fechaCierre = new Date();
    }

    if (estatus === 'Abierto' || estatus === 'En proceso') {
      ticket.fechaCierre = null;
    }
  }

  const roles = req.usuario.roles || [req.usuario.rol];

  // ✅ Si usuario es soporte o mantenimiento puede autoadjudicarse o modificar material
  if (roles.includes('soporte') || roles.includes('mantenimiento')) {
    if (requiereMaterial !== undefined) ticket.requiereMaterial = requiereMaterial;

    if (asignar) {
      if (ticket.estatus === "Cerrado" || ticket.estatus === "Resuelto") {
        return res.status(400).json({ mensaje: "No puedes asignarte un ticket cerrado o resuelto." });
      }
      ticket.asignadoA = req.usuario.id;
    }
  }

  // ✅ Si viene asignadoA (desde el panel de admin), lo aplicamos
  if (asignadoA) {
    ticket.asignadoA = asignadoA;
  }

  await ticket.save();
  res.json({ mensaje: 'Ticket actualizado correctamente' });
});

// Nueva ruta: Obtener solo tickets abiertos y sin asignar
router.get('/asignables', verifyToken, verifyRole(['admin', 'finanzas']), async (req, res) => {
  try {
    const tickets = await Ticket.find({
      estatus: { $in: ['Abierto', 'En proceso'] },
      asignadoA: null
    }).populate('creadoPor', 'nombre').sort({ fechaCreacion: -1 });

    res.json(tickets);
  } catch (err) {
    console.error('Error al obtener tickets asignables:', err);
    res.status(500).json({ mensaje: 'Error al obtener tickets asignables' });
  }
});

module.exports = router;

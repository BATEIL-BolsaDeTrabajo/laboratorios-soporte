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

function pushHistorial(ticket, {
  usuarioId,
  usuarioNombre,
  de,
  a,
  comentario,
  requiereMaterial,
  resolucion
} = {}) {
  // Calcula tiempo de solución (si pasa a Resuelto/Cerrado)
  let tiempoSolucionMin = undefined;
  const esCierre = (a === 'Resuelto' || a === 'Cerrado');
  if (esCierre) {
    const base = ticket.fechaReanudacion || ticket.fechaInicio || ticket.createdAt || new Date();
    const fin = new Date();
    tiempoSolucionMin = Math.round((fin - base) / 60000);
  }

  ticket.historial.push({
    fecha: new Date(),
    usuario: usuarioId,
    usuarioNombre,
    de,
    a,
    comentario,
    requiereMaterial,
    resolucion,
    fechaInicio: ticket.fechaInicio || undefined,
    fechaReanudacion: ticket.fechaReanudacion || undefined,
    fechaCierre: ticket.fechaCierre || undefined,
    tiempoSolucionMin
  });
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
        tipo: tipoGeneral,                          // Sistemas | Mantenimiento
        subtipo: body.area === 'sistemas' ? body.tipo : null, // laboratorio | otro
        laboratorio: body.laboratorio || null,
        equipo: body.equipo || null,
        ubicacion: body.ubicacion || null,
        salon: body.salon || null,
        tipoFalla: body.tipoFalla || null,
        creadoPor: userId,
        estatus: 'Abierto',
        requiereMaterial: '',
        resolucion: '',
        // prioridad opcional (default en el modelo = 'Media')
        ...(body.prioridad && ['Alta','Media','Baja'].includes(body.prioridad) ? { prioridad: body.prioridad } : {}
        )
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
        estatus: 'Abierto',
        ...(body.prioridad && ['Alta','Media','Baja'].includes(body.prioridad) ? { prioridad: body.prioridad } : {})
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
  const roles = (req.usuario.roles || [req.usuario.rol]).filter(Boolean).map(r => String(r).toLowerCase());
  let filtro = {};

  if (roles.includes('soporte')) filtro.tipo = 'Sistemas';
  else if (roles.includes('mantenimiento')) filtro.tipo = 'Mantenimiento';
  // admin / direccion / subdireccion / finanzas ven todos

  const tickets = await Ticket.find(filtro)
    .populate('creadoPor', 'nombre')
    .populate('asignadoA', 'nombre');

  res.json(tickets);
});

// ===== Actualizar ticket =====
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { estatus, requiereMaterial, resolucion, asignar, asignadoA, prioridad } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ mensaje: 'Ticket no encontrado' });

    const anterior = ticket.estatus;
    const usuarioId = req.usuario.id;
    const usuarioNombre = req.usuario?.nombre || req.usuario?.email || 'Usuario';

    let huboCambio = false;
    let historialComent = undefined;

    // ---- Cambios de estatus y fechas ----
    if (estatus) {
      const estatusValidos = [
        'Abierto',
        'En proceso',
        'En espera de material',
        'Resuelto',
        'Cerrado',
        'Tiempo excedido'
      ];
      if (!estatusValidos.includes(estatus)) {
        return res.status(400).json({ mensaje: 'Estatus inválido.' });
      }

      // Inicio (solo la primera vez que entra a "En proceso")
      if (estatus === 'En proceso' && !ticket.fechaInicio) {
        ticket.fechaInicio = new Date();
      }

      // Pausa por material
      if (estatus === 'En espera de material') {
        if (!requiereMaterial || !String(requiereMaterial).trim()) {
          return res.status(400).json({ mensaje: 'Debes indicar el material requerido para poner el ticket en espera.' });
        }
        ticket.fechaPausa = new Date();
      }

      // Reanudación (cuando venimos de pausa a En proceso)
      if (estatus === 'En proceso' && anterior === 'En espera de material') {
        ticket.fechaReanudacion = new Date();
      }

      // Cierre (Resuelto o Cerrado)
      if (estatus === 'Resuelto' || estatus === 'Cerrado') {
        ticket.fechaCierre = new Date();
      }

      // Tiempo excedido
      if (estatus === 'Tiempo excedido') {
        ticket.fechaExcedido = new Date();
      }

      // Reapertura
      if (estatus === 'Abierto') {
        ticket.fechaInicio = null;
        ticket.fechaPausa = null;
        ticket.fechaReanudacion = null;
        ticket.fechaCierre = null;
        ticket.fechaExcedido = null;
      }

      if (ticket.estatus !== estatus) {
        huboCambio = true;
        pushHistorial(ticket, {
          usuarioId,
          usuarioNombre,
          de: anterior,
          a: estatus,
          comentario: undefined,
          requiereMaterial: (estatus === 'En espera de material') ? (requiereMaterial || '') : undefined,
          resolucion: (estatus === 'Resuelto' || estatus === 'Cerrado') ? (resolucion || '') : undefined
        });
      }

      ticket.estatus = estatus;
    }

    // ---- Prioridad ----
    if (typeof prioridad !== 'undefined') {
      const ok = ['Alta', 'Media', 'Baja'].includes(prioridad);
      if (!ok) return res.status(400).json({ mensaje: 'Prioridad inválida' });

      if (ticket.prioridad !== prioridad) {
        huboCambio = true;
        historialComent = `Cambio de prioridad: ${ticket.prioridad || 'N/D'} → ${prioridad}`;
        pushHistorial(ticket, {
          usuarioId,
          usuarioNombre,
          de: ticket.estatus,
          a: ticket.estatus,
          comentario: historialComent
        });
        ticket.prioridad = prioridad;
      }
    }

    // ---- Campos de trabajo ----
    const roles = (req.usuario.roles || [req.usuario.rol]).filter(Boolean);
    if (roles.includes('soporte') || roles.includes('mantenimiento') || roles.includes('admin')) {
      if (typeof requiereMaterial !== 'undefined' && requiereMaterial !== ticket.requiereMaterial) {
        huboCambio = true;
        pushHistorial(ticket, {
          usuarioId,
          usuarioNombre,
          de: ticket.estatus,
          a: ticket.estatus,
          comentario: 'Actualización de material requerido',
          requiereMaterial
        });
        ticket.requiereMaterial = requiereMaterial;
      }

      if (typeof resolucion !== 'undefined' && resolucion !== ticket.resolucion) {
        huboCambio = true;
        pushHistorial(ticket, {
          usuarioId,
          usuarioNombre,
          de: ticket.estatus,
          a: ticket.estatus,
          comentario: 'Actualización de resolución',
          resolucion
        });
        ticket.resolucion = resolucion;
      }

      if (asignar) {
        if (ticket.estatus === 'Cerrado' || ticket.estatus === 'Resuelto') {
          return res.status(400).json({ mensaje: 'No puedes asignarte un ticket cerrado o resuelto.' });
        }
        if (!ticket.asignadoA || String(ticket.asignadoA) !== String(usuarioId)) {
          huboCambio = true;
          pushHistorial(ticket, {
            usuarioId,
            usuarioNombre,
            de: ticket.estatus,
            a: ticket.estatus,
            comentario: `Auto-asignación al usuario`
          });
        }
        ticket.asignadoA = usuarioId;
      }
    }

    // Asignación directa (desde panel admin)
    if (asignadoA && String(asignadoA) !== String(ticket.asignadoA || '')) {
      huboCambio = true;
      pushHistorial(ticket, {
        usuarioId,
        usuarioNombre,
        de: ticket.estatus,
        a: ticket.estatus,
        comentario: `Asignado a usuario ${asignadoA}`
      });
      ticket.asignadoA = asignadoA;
    }

    await ticket.save();
    res.json({ ok: true, mensaje: 'Ticket actualizado correctamente', huboCambio });
  } catch (err) {
    console.error('PUT /tickets/:id error:', err);
    res.status(500).json({ mensaje: 'Error al actualizar ticket' });
  }
});


// ===== Tickets asignables (para admin y finanzas) =====
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

// === HISTORIAL PARA DIRECTIVOS ===
// GET /api/tickets/historial
// Roles permitidos: admin, direccion, subdireccion, finanzas
router.get('/historial', verifyToken, async (req, res) => {
  try {
    const roles = (req.usuario?.roles || [req.usuario?.rol || ''])
      .filter(Boolean)
      .map(r => String(r).toLowerCase());

    const puede =
      roles.includes('admin') ||
      roles.includes('direccion') ||
      roles.includes('subdireccion') ||
      roles.includes('finanzas');

    if (!puede) {
      return res.status(403).json({ mensaje: 'No autorizado' });
    }

    const tickets = await Ticket.find({}, {
      descripcion: 0,
      resolucion: 0
    })
      .populate('asignadoA', 'nombre correo')
      .populate('creadoPor', 'nombre correo')
      .sort({ fechaCierre: -1, createdAt: -1 });

    res.json(tickets);
  } catch (e) {
    console.error('GET /api/tickets/historial:', e);
    res.status(500).json({ mensaje: 'Error al obtener historial' });
  }
});

// ===== Comentarios (bitácora) =====
router.post('/:id/comentarios', verifyToken, async (req, res) => {
  try {
    const { comentario } = req.body;
    if (!comentario || !String(comentario).trim()) {
      return res.status(400).json({ mensaje: 'Comentario requerido' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ mensaje: 'Ticket no encontrado' });

    pushHistorial(ticket, {
      usuarioId: req.usuario.id,
      usuarioNombre: req.usuario?.nombre || req.usuario?.email || 'Usuario',
      de: ticket.estatus,
      a: ticket.estatus,
      comentario
    });

    await ticket.save();
    res.json({ mensaje: 'Comentario agregado' });
  } catch (err) {
    console.error('POST /tickets/:id/comentarios error:', err);
    res.status(500).json({ mensaje: 'Error al agregar comentario' });
  }
});

// ===== Historial por ticket (para el modal "Detalles") =====
router.get('/:id/historial', verifyToken, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id, { historial: 1, _id: 0 });
    if (!ticket) return res.status(404).json({ mensaje: 'Ticket no encontrado' });

    const ordenado = (ticket.historial || []).slice().sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
    res.json(ordenado);
  } catch (err) {
    console.error('GET /tickets/:id/historial error:', err);
    res.status(500).json({ mensaje: 'Error al obtener historial' });
  }
});

// ===== Obtener un ticket por id (metadatos para el modal Detalles) =====
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id)
      .populate('creadoPor', 'nombre correo')
      .populate('asignadoA', 'nombre correo');
    if (!t) return res.status(404).json({ mensaje: 'Ticket no encontrado' });
    res.json(t);
  } catch (e) {
    console.error('GET /tickets/:id', e);
    res.status(500).json({ mensaje: 'Error al obtener ticket' });
  }
});

module.exports = router;
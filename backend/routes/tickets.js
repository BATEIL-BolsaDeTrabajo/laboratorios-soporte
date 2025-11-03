// routes/tickets.js
const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { verifyToken, verifyRole } = require('../middlewares/auth');

// -------- Helpers --------
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
  let tiempoSolucionMin;
  const esCierre = (a === 'Resuelto' || a === 'Cerrado');
  if (esCierre) {
    const base = ticket.fechaReanudacion || ticket.fechaInicio || ticket.createdAt || new Date();
    const fin = new Date();
    tiempoSolucionMin = Math.round((fin - base) / 60000);
  }

  (ticket.historial ||= []).push({
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

// -------- Crear --------
router.post('/', verifyToken, async (req, res) => {
  try {
    const body = req.body;
    const userId = req.usuario?.id;
    if (!userId) return res.status(401).json({ ok:false, error:'Token sin id de usuario.' });

    let doc;

    if (body.area) {
      const errores = validarNuevoPayload(body);
      if (errores.length) return res.status(400).json({ ok:false, errors: errores });

      const tipoGeneral = body.area === 'sistemas' ? 'Sistemas' : 'Mantenimiento';
      doc = {
        descripcion: body.descripcion,
        tipo: tipoGeneral,
        subtipo: body.area === 'sistemas' ? body.tipo : null,
        laboratorio: body.laboratorio || null,
        equipo: body.equipo || null,
        ubicacion: body.ubicacion || null,
        salon: body.salon || null,
        tipoFalla: body.tipoFalla || null,
        creadoPor: userId,
        estatus: 'Abierto',
        requiereMaterial: '',
        resolucion: '',
        ...(body.prioridad && ['Alta','Media','Baja'].includes(body.prioridad) ? { prioridad: body.prioridad } : {})
      };
    } else {
      // formato viejo
      if (!body.tipo || !['Sistemas','Mantenimiento'].includes(body.tipo)) {
        return res.status(400).json({ ok:false, error:'tipo debe ser Sistemas|Mantenimiento' });
      }
      if (!body.descripcion) {
        return res.status(400).json({ ok:false, error:'Falta descripción.' });
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
    res.status(201).json({ ok:true, mensaje:'Ticket creado', ticket:nuevo });
  } catch (err) {
    console.error('POST /tickets error:', err);
    res.status(500).json({ ok:false, error:'No se pudo crear el ticket.' });
  }
});

// -------- Listar según rol --------
router.get('/', verifyToken, async (req, res) => {
  const roles = (req.usuario.roles || [req.usuario.rol]).filter(Boolean).map(r => String(r).toLowerCase());
  const filtro = {};
  if (roles.includes('soporte')) filtro.tipo = 'Sistemas';
  else if (roles.includes('mantenimiento')) filtro.tipo = 'Mantenimiento';

  const tickets = await Ticket.find(filtro)
    .populate('creadoPor', 'nombre')
    .populate('asignadoA', 'nombre');

  res.json(tickets);
});

// -------- Actualizar + historial --------
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const {
      estatus, requiereMaterial, resolucion,
      asignar, asignadoA, prioridad, comentario
    } = req.body;

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ mensaje:'Ticket no encontrado' });

    const anterior = ticket.estatus;
    const usuarioId = req.usuario?.id;
    const usuarioNombre = req.usuario?.nombre || req.usuario?.email || 'Usuario';
    const ahora = new Date();

    // Validación de estatus
    if (estatus) {
      const validos = ['Abierto','En proceso','En espera de material','Resuelto','Tiempo excedido','Cerrado'];
      if (!validos.includes(estatus)) return res.status(400).json({ mensaje:'Estatus inválido.' });

      if (estatus === 'En proceso' && !ticket.fechaInicio) ticket.fechaInicio = ahora;
      if (estatus === 'En espera de material') {
        if (!requiereMaterial || !String(requiereMaterial).trim()) {
          return res.status(400).json({ mensaje:'Debes indicar el material requerido para poner el ticket en espera.' });
        }
        ticket.fechaPausa = ahora;
      }
      if (estatus === 'En proceso' && anterior === 'En espera de material') ticket.fechaReanudacion = ahora;
      if (estatus === 'Tiempo excedido') ticket.fechaExcedido = ahora;
      if (estatus === 'Resuelto' || estatus === 'Cerrado') ticket.fechaCierre = ahora;

      if (estatus === 'Abierto') {
        ticket.fechaInicio = null;
        ticket.fechaPausa = null;
        ticket.fechaReanudacion = null;
        ticket.fechaExcedido = null;
        ticket.fechaCierre = null;
      }

      if (estatus !== anterior) {
        pushHistorial(ticket, {
          usuarioId, usuarioNombre,
          de: anterior, a: estatus,
          comentario: comentario || undefined,
          requiereMaterial: estatus === 'En espera de material' ? (requiereMaterial || '') : undefined,
          resolucion: (estatus === 'Resuelto' || estatus === 'Cerrado') ? (resolucion || '') : undefined
        });
        ticket.estatus = estatus;
      }
    }

    // Prioridad
    if (typeof prioridad !== 'undefined') {
      const ok = ['Alta','Media','Baja'].includes(prioridad);
      if (!ok) return res.status(400).json({ mensaje:'Prioridad inválida' });

      if (ticket.prioridad !== prioridad) {
        pushHistorial(ticket, {
          usuarioId, usuarioNombre,
          de: ticket.estatus, a: ticket.estatus,
          comentario: `Cambio de prioridad: ${ticket.prioridad || 'N/D'} → ${prioridad}`
        });
        ticket.prioridad = prioridad;
      }
    }

    // Campos de trabajo
    const roles = (req.usuario.roles || [req.usuario.rol]).filter(Boolean).map(r => String(r).toLowerCase());
    const puedeTrabajar = roles.some(r => ['soporte','mantenimiento','admin'].includes(r));
    if (puedeTrabajar) {
      if (typeof requiereMaterial !== 'undefined' && requiereMaterial !== ticket.requiereMaterial) {
        pushHistorial(ticket, { usuarioId, usuarioNombre, de: ticket.estatus, a: ticket.estatus, comentario:'Actualización de material requerido', requiereMaterial });
        ticket.requiereMaterial = requiereMaterial;
      }
      if (typeof resolucion !== 'undefined' && resolucion !== ticket.resolucion) {
        pushHistorial(ticket, { usuarioId, usuarioNombre, de: ticket.estatus, a: ticket.estatus, comentario:'Actualización de resolución', resolucion });
        ticket.resolucion = resolucion;
      }
      if (asignar) {
        if (['Cerrado','Resuelto'].includes(ticket.estatus)) {
          return res.status(400).json({ mensaje:'No puedes asignarte un ticket cerrado o resuelto.' });
        }
        if (!ticket.asignadoA || String(ticket.asignadoA) !== String(usuarioId)) {
          pushHistorial(ticket, { usuarioId, usuarioNombre, de: ticket.estatus, a: ticket.estatus, comentario:'Auto-asignación al usuario' });
        }
        ticket.asignadoA = usuarioId;
      }
    }

    // Asignación directa (panel admin)
    if (asignadoA && String(asignadoA) !== String(ticket.asignadoA || '')) {
      pushHistorial(ticket, { usuarioId, usuarioNombre, de: ticket.estatus, a: ticket.estatus, comentario:`Asignado a usuario ${asignadoA}` });
      ticket.asignadoA = asignadoA;
    }

    // Comentario libre (sin otros cambios)
    if (comentario && !comentario.trim() === false && !estatus && typeof prioridad === 'undefined' && typeof requiereMaterial === 'undefined' && typeof resolucion === 'undefined' && !asignar && !asignadoA) {
      pushHistorial(ticket, { usuarioId, usuarioNombre, de: ticket.estatus, a: ticket.estatus, comentario });
    }

    await ticket.save();
    res.json({ ok:true, mensaje:'Ticket actualizado correctamente' });
  } catch (err) {
    console.error('PUT /tickets/:id error:', err);
    res.status(500).json({ mensaje:'Error al actualizar ticket' });
  }
});

// -------- Comentarios (bitácora) --------
router.post('/:id/comentarios', verifyToken, async (req, res) => {
  try {
    const { comentario } = req.body;
    if (!comentario || !String(comentario).trim()) {
      return res.status(400).json({ mensaje:'Comentario requerido' });
    }
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ mensaje:'Ticket no encontrado' });

    pushHistorial(ticket, {
      usuarioId: req.usuario.id,
      usuarioNombre: req.usuario?.nombre || req.usuario?.email || 'Usuario',
      de: ticket.estatus, a: ticket.estatus,
      comentario
    });

    await ticket.save();
    res.json({ mensaje:'Comentario agregado' });
  } catch (err) {
    console.error('POST /tickets/:id/comentarios error:', err);
    res.status(500).json({ mensaje:'Error al agregar comentario' });
  }
});

// -------- Historial (tabla general) --------
router.get('/historial', verifyToken, async (req, res) => {
  try {
    const roles = (req.usuario?.roles || [req.usuario?.rol || '']).filter(Boolean).map(r => String(r).toLowerCase());
    const puede = roles.some(r => ['admin','direccion','subdireccion','finanzas'].includes(r));
    if (!puede) return res.status(403).json({ mensaje:'No autorizado' });

    const tickets = await Ticket.find({}, { descripcion:0, resolucion:0 })
      .populate('asignadoA', 'nombre correo')
      .populate('creadoPor', 'nombre correo')
      .sort({ fechaCierre: -1, createdAt: -1 });

    res.json(tickets);
  } catch (e) {
    console.error('GET /api/tickets/historial:', e);
    res.status(500).json({ mensaje:'Error al obtener historial' });
  }
});

// -------- Ticket (metadatos para modal) --------
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id)
      .populate('creadoPor', 'nombre correo')
      .populate('asignadoA', 'nombre correo');
    if (!t) return res.status(404).json({ mensaje:'Ticket no encontrado' });
    res.json(t);
  } catch (e) {
    console.error('GET /tickets/:id', e);
    res.status(500).json({ mensaje:'Error al obtener ticket' });
  }
});

// -------- Historial por ticket (filas del modal) --------
router.get('/:id/historial', verifyToken, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id)
      .populate('historial.usuario', 'nombre')
      .lean();

    if (!t) return res.status(404).json({ mensaje:'Ticket no encontrado' });

    const rows = (t.historial || [])
      .slice()
      .sort((a,b)=> new Date(a.fecha) - new Date(b.fecha))
      .map(h => ({
        fecha: h.fecha,
        de: h.de || '',
        a: h.a || '',
        usuario: h.usuarioNombre || (h.usuario?.nombre || '—'),
        fechaInicio: h.fechaInicio || null,
        fechaReanudacion: h.fechaReanudacion || null,
        requiereMaterial: h.requiereMaterial || '',
        tiempoSolucionMin: h.tiempoSolucionMin ?? null,
        comentario: h.comentario || '',
        resolucion: h.resolucion || ''
      }));

    res.json(rows);
  } catch (err) {
    console.error('GET /tickets/:id/historial error:', err);
    res.status(500).json({ mensaje:'Error al obtener historial' });
  }
});

module.exports = router;

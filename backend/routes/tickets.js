// routes/tickets.js
const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { verifyToken, verifyRole } = require('../middlewares/auth');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { ensureTicketFolder, uploadTicketEvidence } = require('../utils/googleDrive');
const uploadEvidence = require('../middlewares/uploadEvidence');
const fs = require('fs');

/* ========= Helpers ========= */
function validarNuevoPayload(body) {
  const errors = [];
  const { area, tipo, laboratorio, equipo, ubicacion, salon, descripcion } = body;

  if (!descripcion) errors.push('Falta descripción.');

  if (area === 'sistemas') {
    if (!tipo || !['laboratorio', 'otro'].includes(tipo)) {
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
    usuario: usuarioId || null,
    usuarioNombre: usuarioNombre || '',
    de: de || '',
    a: a || de || '',
    comentario: comentario || '',
    requiereMaterial: requiereMaterial || '',
    resolucion: resolucion || '',
    fechaInicio: ticket.fechaInicio || undefined,
    fechaReanudacion: ticket.fechaReanudacion || undefined,
    fechaCierre: ticket.fechaCierre || undefined,
    tiempoSolucionMin
  });
}

/**
 * Notificar a TODOS los usuarios con rol admin / finanzas
 * tipo: 'nuevo' | 'resuelto' | ...
 */
async function notificarAdminsFinanzas(io, titulo, tipo = 'general') {
  try {
    const admins = await User.find(
      {
        $or: [
          { roles: { $in: ['admin', 'Admin', 'ADMIN', 'finanzas', 'Finanzas', 'FINANZAS'] } },
          { rol: { $in: ['admin', 'Admin', 'ADMIN', 'finanzas', 'Finanzas', 'FINANZAS'] } }
        ]
      },
      '_id'
    );

    if (!admins.length) return;

    const docsData = admins.map(u => ({
      usuario: u._id,
      titulo,
      tipo
    }));

    const creadas = await Notification.insertMany(docsData);

    if (io) {
      creadas.forEach(notifDoc => {
        const fechaTxt = new Date(notifDoc.fecha).toLocaleString('es-MX', {
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        io.to(`user:${notifDoc.usuario.toString()}`).emit('nuevaNotificacion', {
          titulo: notifDoc.titulo,
          fecha: fechaTxt,
          tipo: notifDoc.tipo || tipo || 'general',
          leida: !!notifDoc.leida
        });
      });
    }
  } catch (e) {
    console.error('Error creando notificación para admin/finanzas:', e);
  }
}

async function notificarUsuario(io, usuarioId, titulo, tipo = 'general') {
  try {
    if (!usuarioId) return;

    const notifDoc = await Notification.create({
      usuario: usuarioId,
      titulo,
      tipo
    });

    if (io) {
      const fechaTxt = new Date(notifDoc.fecha).toLocaleString('es-MX', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      io.to(`user:${usuarioId.toString()}`).emit('nuevaNotificacion', {
        titulo: notifDoc.titulo,
        fecha: fechaTxt,
        tipo: notifDoc.tipo || tipo || 'general',
        leida: !!notifDoc.leida
      });
    }
  } catch (e) {
    console.error('Error creando notificación para usuario:', e);
  }
}

/* ========= Crear ========= */
router.post('/', verifyToken, async (req, res) => {
  try {
    const body = req.body;
    const userId = req.usuario?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'Token válido pero sin id de usuario.' });

    let doc;

    if (body.area) {
      const errores = validarNuevoPayload(body);
      if (errores.length) return res.status(400).json({ ok: false, errors: errores });

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
        resolucion: ''
      };
    } else {
      if (!body.tipo || !['Sistemas', 'Mantenimiento'].includes(body.tipo)) {
        return res.status(400).json({ ok: false, error: 'tipo debe ser Sistemas|Mantenimiento' });
      }
      if (!body.descripcion) return res.status(400).json({ ok: false, error: 'Falta descripción.' });

      doc = {
        descripcion: body.descripcion,
        tipo: body.tipo,
        creadoPor: userId,
        estatus: 'Abierto'
      };
    }

    const nuevo = await Ticket.create(doc);

    try {
      const folder = await ensureTicketFolder(nuevo);

      if (folder && folder.id) {
        nuevo.driveFolderId = folder.id;
        nuevo.driveFolderLink = folder.webViewLink || null;
        await nuevo.save();
      }
    } catch (error) {
      console.error('Error creando carpeta de Drive:', error.message || error);
    }

    const io = req.app.get('io');
    const tituloNotif = `Nuevo ticket (${nuevo.tipo || '—'}) - ${nuevo.folio || nuevo.descripcion || 'Sin folio'}`;
    await notificarAdminsFinanzas(io, tituloNotif, 'nuevo');

    if (io) {
      io.emit('ticketsActualizados', {
        accion: 'creado',
        ticketId: nuevo._id.toString(),
        estatus: nuevo.estatus,
        tipo: nuevo.tipo,
      });
    }

    res.status(201).json({ ok: true, mensaje: 'Ticket creado', ticket: nuevo });
  } catch (err) {
    console.error('POST /tickets error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo crear el ticket.' });
  }
});

/* ========= Tickets asignables (admin/finanzas) ========= */
router.get('/asignables', verifyToken, verifyRole(['admin', 'finanzas']), async (req, res) => {
  try {
    const tickets = await Ticket.find({
      estatus: { $in: ['Abierto', 'En proceso'] },
      asignadoA: null,
      archivado: { $ne: true }
    })
      .populate('creadoPor', 'nombre')
      .sort({ fechaCreacion: -1 });

    res.json(tickets);
  } catch (err) {
    console.error('GET /asignables', err);
    res.status(500).json({ mensaje: 'Error al obtener tickets asignables' });
  }
});

/* ========= Actualizar (estatus/fechas/prioridad/asignación/comentario) ========= */
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const {
      estatus,
      requiereMaterial,
      resolucion,
      asignar,
      asignadoA,
      prioridad,
      comentario,
      cerradoPorUsuario
    } = req.body;

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ mensaje: 'Ticket no encontrado' });

    const io = req.app.get('io');

    const asignadoAntes = ticket.asignadoA ? ticket.asignadoA.toString() : null;
    const prioridadAntes = ticket.prioridad || 'Sin prioridad';

    const anterior = ticket.estatus;
    const ahora = new Date();
    const usuarioId = req.usuario?.id;
    const usuarioNombre = req.usuario?.nombre || req.usuario?.email || 'Usuario';

    const roles = (req.usuario.roles || [req.usuario.rol])
      .filter(Boolean)
      .map(r => String(r).toLowerCase());

    const esSoporteOMantenimiento = roles.some(r => ['soporte', 'mantenimiento'].includes(r));
    const puedeTrabajar = roles.some(r => ['soporte', 'mantenimiento', 'admin'].includes(r));
    const esCreadorDelTicket = String(ticket.creadoPor) === String(usuarioId);

    let cambioAResuelto = false;
    let cambioDePrioridad = false;
    let ticketCerradoPorUsuario = false;

    if (estatus === 'Cerrado' && cerradoPorUsuario === true) {
      if (!esCreadorDelTicket) {
        return res.status(403).json({
          mensaje: 'Solo el creador del ticket puede cerrarlo desde Mis tickets.'
        });
      }

      if (ticket.archivado || ticket.estatus === 'Rechazado') {
        return res.status(400).json({
          mensaje: 'No se puede cerrar un ticket archivado o rechazado.'
        });
      }

      if (ticket.estatus !== 'Resuelto') {
        return res.status(400).json({
          mensaje: 'Solo puedes cerrar un ticket cuando esté en estatus Resuelto.'
        });
      }

      ticket.fechaCierre = ahora;

      pushHistorial(ticket, {
        usuarioId,
        usuarioNombre,
        de: anterior,
        a: 'Cerrado',
        comentario: 'Ticket cerrado por el usuario solicitante'
      });

      ticket.estatus = 'Cerrado';
      ticketCerradoPorUsuario = true;
    } else {
      if (estatus) {
        const estatusValidos = [
          'Abierto',
          'En proceso',
          'En espera de material',
          'Resuelto',
          'Tiempo excedido',
          'Cerrado',
          'Rechazado'
        ];

        if (!estatusValidos.includes(estatus)) {
          return res.status(400).json({ mensaje: 'Estatus inválido.' });
        }

        if (!puedeTrabajar) {
          return res.status(403).json({
            mensaje: 'No autorizado para cambiar el estatus de este ticket.'
          });
        }

        if (estatus === 'En proceso' && !ticket.fechaInicio) {
          ticket.fechaInicio = ahora;
        }

        if (estatus === 'En espera de material') {
          if (!requiereMaterial || !String(requiereMaterial).trim()) {
            return res.status(400).json({
              mensaje: 'Debes indicar el material requerido para poner el ticket en espera.'
            });
          }
          ticket.fechaPausa = ahora;
        }

        if (estatus === 'En proceso' && anterior === 'En espera de material') {
          ticket.fechaReanudacion = ahora;
        }

        if (estatus === 'Tiempo excedido') {
          ticket.fechaExcedido = ahora;
        }

        if (estatus === 'Resuelto' || estatus === 'Cerrado') {
          ticket.fechaCierre = ahora;
        }

        if (estatus === 'Abierto') {
          ticket.fechaInicio = null;
          ticket.fechaPausa = null;
          ticket.fechaReanudacion = null;
          ticket.fechaExcedido = null;
          ticket.fechaCierre = null;
        }

        if (estatus !== anterior) {
          if (estatus === 'Resuelto') cambioAResuelto = true;

          pushHistorial(ticket, {
            usuarioId,
            usuarioNombre,
            de: anterior,
            a: estatus,
            comentario: comentario || undefined,
            requiereMaterial:
              estatus === 'En espera de material' ? (requiereMaterial || '') : undefined,
            resolucion:
              estatus === 'Resuelto' || estatus === 'Cerrado' ? (resolucion || '') : undefined
          });

          ticket.estatus = estatus;
        }
      }
    }

    if (typeof prioridad !== 'undefined') {
      const ok = ['Alta', 'Media', 'Baja', 'Sin prioridad'].includes(prioridad);
      if (!ok) return res.status(400).json({ mensaje: 'Prioridad inválida' });

      if ((ticket.prioridad || 'Sin prioridad') !== prioridad) {
        cambioDePrioridad = true;

        pushHistorial(ticket, {
          usuarioId,
          usuarioNombre,
          de: ticket.estatus,
          a: ticket.estatus,
          comentario: `Cambio de prioridad: ${prioridadAntes} → ${prioridad}`
        });

        ticket.prioridad = prioridad;
      }
    }

    if (puedeTrabajar) {
      if (typeof requiereMaterial !== 'undefined' && requiereMaterial !== ticket.requiereMaterial) {
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
        if (['Cerrado', 'Resuelto'].includes(ticket.estatus)) {
          return res.status(400).json({
            mensaje: 'No puedes asignarte un ticket cerrado o resuelto.'
          });
        }

        if (!ticket.asignadoA || String(ticket.asignadoA) !== String(usuarioId)) {
          pushHistorial(ticket, {
            usuarioId,
            usuarioNombre,
            de: ticket.estatus,
            a: ticket.estatus,
            comentario: 'Auto-asignación al usuario'
          });
        }

        ticket.asignadoA = usuarioId;
      }
    }

    if (asignadoA && String(asignadoA) !== String(ticket.asignadoA || '')) {
      pushHistorial(ticket, {
        usuarioId,
        usuarioNombre,
        de: ticket.estatus,
        a: ticket.estatus,
        comentario: `Asignado a usuario ${asignadoA}`
      });
      ticket.asignadoA = asignadoA;
    }

    const noHayCambiosExtra =
      !estatus &&
      typeof prioridad === 'undefined' &&
      typeof requiereMaterial === 'undefined' &&
      typeof resolucion === 'undefined' &&
      !asignar &&
      !asignadoA;

    if (comentario && noHayCambiosExtra) {
      pushHistorial(ticket, {
        usuarioId,
        usuarioNombre,
        de: ticket.estatus,
        a: ticket.estatus,
        comentario
      });
    }

    await ticket.save();

    if (io) {
      io.emit('ticketsActualizados', {
        accion: 'actualizado',
        ticketId: ticket._id.toString(),
        estatus: ticket.estatus,
        tipo: ticket.tipo,
      });
    }

    if (cambioAResuelto && esSoporteOMantenimiento) {
      const tituloNotif = `Ticket resuelto (${ticket.tipo || '—'}) - ${
        ticket.folio || ticket.descripcion || 'Sin folio'
      }`;
      await notificarAdminsFinanzas(io, tituloNotif, 'resuelto');
    }

    if (ticketCerradoPorUsuario && ticket.asignadoA) {
      try {
        const tecnico = await User.findById(ticket.asignadoA, 'roles rol');

        const rolesTec = [
          ...(tecnico?.roles || []),
          tecnico?.rol
        ]
          .filter(Boolean)
          .map(r => String(r).toLowerCase());

        const esTecSoporteOMant = rolesTec.some(r =>
          ['soporte', 'mantenimiento'].includes(r)
        );

        if (esTecSoporteOMant) {
          const tituloNotif = `El usuario cerró el ticket (${ticket.tipo || '—'}) - ${
            ticket.folio || ticket.descripcion || 'Sin folio'
          }`;

          await notificarUsuario(io, ticket.asignadoA, tituloNotif, 'cerrado_usuario');
        }
      } catch (e) {
        console.error('Error creando notificación de cierre por usuario:', e);
      }
    }

    if (cambioDePrioridad && ticket.asignadoA) {
      try {
        const tecnico = await User.findById(ticket.asignadoA, 'roles rol');
        const rolesTec = [
          ...(tecnico?.roles || []),
          tecnico?.rol
        ]
          .filter(Boolean)
          .map(r => String(r).toLowerCase());

        const esTecSoporteOMant = rolesTec.some(r =>
          ['soporte', 'mantenimiento'].includes(r)
        );

        if (esTecSoporteOMant) {
          const notifDoc = await Notification.create({
            usuario: ticket.asignadoA,
            titulo: `Prioridad cambiada a ${ticket.prioridad} – ${
              (ticket.folio || ticket.descripcion || 'Ticket').toString().slice(0, 60)
            }`,
            tipo: 'prioridad'
          });

          if (io) {
            const fechaTxt = new Date(notifDoc.fecha).toLocaleString('es-MX', {
              year: '2-digit',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });

            io.to(`user:${ticket.asignadoA.toString()}`).emit('nuevaNotificacion', {
              titulo: notifDoc.titulo,
              fecha: fechaTxt,
              tipo: notifDoc.tipo || 'prioridad',
              leida: false
            });
          }
        }
      } catch (e) {
        console.error('Error creando notificación de cambio de prioridad:', e);
      }
    }

    const asignadoNuevo = ticket.asignadoA ? ticket.asignadoA.toString() : null;

    if (asignadoNuevo && asignadoNuevo !== asignadoAntes) {
      try {
        const notifDoc = await Notification.create({
          usuario: asignadoNuevo,
          titulo: `Se te asignó un ticket (${ticket.tipo || '—'}) - ${
            ticket.folio || ticket.descripcion || 'Sin folio'
          }`,
          tipo: 'asignado'
        });

        if (io) {
          const fechaTxt = new Date(notifDoc.fecha).toLocaleString('es-MX', {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });

          const payload = {
            titulo: notifDoc.titulo,
            fecha: fechaTxt,
            tipo: notifDoc.tipo || 'asignado',
            leida: false
          };

          io.to(`user:${asignadoNuevo}`).emit('nuevaNotificacion', payload);
        }
      } catch (e) {
        console.error('Error creando notificación de asignación:', e);
      }
    }

    return res.json({
      ok: true,
      mensaje: ticketCerradoPorUsuario
        ? 'Ticket cerrado correctamente por el usuario.'
        : 'Ticket actualizado correctamente'
    });

  } catch (err) {
    console.error('PUT /tickets/:id error:', err);
    res.status(500).json({ mensaje: 'Error al actualizar ticket' });
  }
});

/* ========= Comentarios ADMIN: crear ========= */
router.post('/:id/comentarios-admin', verifyToken, async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto || !String(texto).trim()) {
      return res.status(400).json({ mensaje: 'Comentario requerido' });
    }

    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ mensaje: 'Ticket no encontrado' });

    const usuarioNombre = req.usuario?.nombre || req.usuario?.email || 'Usuario';

    t.comentariosAdmin.push({
      usuario: req.usuario?.id || null,
      usuarioNombre,
      texto: String(texto).trim()
    });

    await t.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('ticketsActualizados', {
        accion: 'comentario-admin',
        ticketId: t._id.toString()
      });
    }

    return res.json({ ok: true, mensaje: 'Comentario guardado' });
  } catch (e) {
    console.error('POST /comentarios-admin', e);
    res.status(500).json({ mensaje: 'Error al guardar comentario' });
  }
});

/* ========= Comentarios ADMIN: leer ========= */
router.get('/:id/comentarios-admin', verifyToken, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id, { comentariosAdmin: 1 }).lean();
    if (!t) return res.status(404).json({ mensaje: 'Ticket no encontrado' });

    const rows = (t.comentariosAdmin || [])
      .slice()
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json(rows);
  } catch (e) {
    console.error('GET /comentarios-admin', e);
    res.status(500).json({ mensaje: 'Error al obtener comentarios' });
  }
});

/* ========= Comentarios (bitácora) ========= */
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

    const io = req.app.get('io');
    if (io) {
      io.emit('ticketsActualizados', {
        accion: 'comentario',
        ticketId: ticket._id.toString()
      });
    }

    res.json({ mensaje: 'Comentario agregado' });
  } catch (err) {
    console.error('POST /tickets/:id/comentarios error:', err);
    res.status(500).json({ mensaje: 'Error al agregar comentario' });
  }
});

/* ========= Tickets archivados (admin/finanzas) ========= */
router.get('/archivados', verifyToken, verifyRole(['admin', 'finanzas']), async (req, res) => {
  try {
    const tickets = await Ticket.find({ archivado: true })
      .populate('creadoPor', 'nombre correo')
      .populate('asignadoA', 'nombre correo')
      .sort({ fechaArchivado: -1, updatedAt: -1 });

    return res.json({ ok: true, tickets });
  } catch (err) {
    console.error('GET /archivados', err);
    return res.status(500).json({ ok: false, mensaje: 'Error al obtener tickets archivados' });
  }
});

/* ========= Archivar ticket (admin/finanzas) ========= */
router.put('/:id/archivar', verifyToken, verifyRole(['admin', 'finanzas']), async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ ok: false, mensaje: 'Ticket no encontrado' });

    if (ticket.archivado) {
      return res.json({ ok: true, mensaje: 'El ticket ya estaba archivado' });
    }

    const usuarioId = req.usuario?.id;
    const usuarioNombre = req.usuario?.nombre || req.usuario?.email || 'Usuario';

    ticket.archivado = true;
    ticket.fechaArchivado = new Date();
    ticket.archivadoPor = usuarioId || null;

    pushHistorial(ticket, {
      usuarioId,
      usuarioNombre,
      de: ticket.estatus,
      a: 'Archivado',
      comentario: 'Ticket archivado'
    });

    await ticket.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('ticketsActualizados', {
        accion: 'archivado',
        ticketId: ticket._id.toString()
      });
    }

    return res.json({ ok: true, mensaje: 'Ticket archivado ✅' });
  } catch (err) {
    console.error('PUT /:id/archivar', err);
    return res.status(500).json({ ok: false, mensaje: 'Error al archivar ticket' });
  }
});

/* ========= Rechazar ticket (admin/finanzas) ========= */
router.put('/:id/rechazar', verifyToken, verifyRole(['admin', 'finanzas']), async (req, res) => {
  try {
    const { comentario } = req.body;

    if (!comentario || !String(comentario).trim()) {
      return res.status(400).json({ ok: false, mensaje: 'Debes escribir un comentario para rechazar.' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ ok: false, mensaje: 'Ticket no encontrado' });

    const usuarioId = req.usuario?.id;
    const usuarioNombre = req.usuario?.nombre || req.usuario?.email || 'Usuario';

    const estatusAntes = ticket.estatus;

    ticket.estatus = 'Rechazado';

    pushHistorial(ticket, {
      usuarioId,
      usuarioNombre,
      de: estatusAntes,
      a: 'Rechazado',
      comentario: `RECHAZADO: ${String(comentario).trim()}`
    });

    ticket.archivado = true;
    ticket.fechaArchivado = new Date();
    ticket.archivadoPor = usuarioId || null;

    await ticket.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('ticketsActualizados', {
        accion: 'rechazado',
        ticketId: ticket._id.toString()
      });
    }

    return res.json({ ok: true, mensaje: 'Ticket rechazado y archivado ✅' });
  } catch (err) {
    console.error('PUT /:id/rechazar', err);
    return res.status(500).json({ ok: false, mensaje: 'Error al rechazar ticket' });
  }
});

/* ========= Historial para tabla (directivos) ========= */
router.get('/historial', verifyToken, async (req, res) => {
  try {
    const roles = (req.usuario?.roles || [req.usuario?.rol || ''])
      .filter(Boolean)
      .map(r => String(r).toLowerCase());

    const puede = ['admin', 'direccion', 'subdireccion', 'finanzas'].some(r => roles.includes(r));
    if (!puede) return res.status(403).json({ mensaje: 'No autorizado' });

    const tickets = await Ticket.find(
      { archivado: { $ne: true } },
      { descripcion: 0, resolucion: 0 }
    )
      .populate('asignadoA', 'nombre correo')
      .populate('creadoPor', 'nombre correo')
      .sort({ fechaCierre: -1, createdAt: -1 });

    res.json(tickets);
  } catch (e) {
    console.error('GET /api/tickets/historial:', e);
    res.status(500).json({ mensaje: 'Error al obtener historial' });
  }
});

/* ========= MIS TICKETS ========= */
router.get('/mis-tickets', verifyToken, async (req, res) => {
  try {
    const userId = req.usuario.id;

    const tickets = await Ticket.find(
      { creadoPor: userId },
      {
        folio: 1,
        tipo: 1,
        estatus: 1,
        archivado: 1,
        fechaArchivado: 1,
        fechaCreacion: 1,
        fechaInicio: 1,
        fechaCierre: 1,
        descripcion: 1
      }
    ).sort({ fechaCreacion: -1 });

    return res.json({ ok: true, tickets });
  } catch (error) {
    console.error('GET /mis-tickets error:', error);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener tus tickets.' });
  }
});

/* ========= Get ticket para encabezado del modal ========= */
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

/* ========= Historial por ticket ========= */
router.get('/:id/historial', verifyToken, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id)
      .populate('historial.usuario', 'nombre')
      .lean();

    if (!t) return res.status(404).json({ mensaje: 'Ticket no encontrado' });

    const rows = (t.historial || [])
      .slice()
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
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
    res.status(500).json({ mensaje: 'Error al obtener historial' });
  }
});

/* ========= Listado principal ========= */
router.get('/', verifyToken, async (req, res) => {
  try {
    const rolesRaw = req.usuario?.roles || [req.usuario?.rol || ''];
    const roles = rolesRaw
      .filter(Boolean)
      .map(r => String(r).toLowerCase());

    const userId = req.usuario?.id;
    const filtro = { archivado: { $ne: true } };

    const esAdminLike = roles.some(r =>
      ['admin', 'direccion', 'subdireccion', 'finanzas'].includes(r)
    );

    if (!esAdminLike) {
      if (roles.includes('soporte')) {
        filtro.tipo = 'Sistemas';
        filtro.asignadoA = userId;
      } else if (roles.includes('mantenimiento')) {
        filtro.tipo = 'Mantenimiento';
        filtro.asignadoA = userId;
      } else {
        filtro.creadoPor = userId;
      }
    }

    const tickets = await Ticket.find(filtro)
      .populate('creadoPor', 'nombre')
      .populate('asignadoA', 'nombre');

    res.json(tickets);
  } catch (err) {
    console.error('GET /tickets error:', err);
    res.status(500).json({ mensaje: 'Error al obtener tickets' });
  }
});

/* ========= Eliminar ticket (solo admin / finanzas) ========= */
router.delete('/:id', verifyToken, verifyRole(['admin', 'finanzas']), async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ mensaje: 'Ticket no encontrado' });
    }

    const tipoTicket = ticket.tipo || '—';
    const folioTicket = ticket.folio || ticket.descripcion || 'Sin folio';

    await ticket.deleteOne();

    const io = req.app.get('io');
    const tituloNotif = `Ticket eliminado (${tipoTicket}) - ${folioTicket}`;
    await notificarAdminsFinanzas(io, tituloNotif, 'eliminado');

    if (io) {
      io.emit('ticketsActualizados', {
        accion: 'eliminado',
        ticketId: id
      });
    }

    return res.json({ mensaje: 'Ticket eliminado correctamente' });
  } catch (err) {
    console.error('Error al eliminar ticket:', err);
    return res.status(500).json({ mensaje: 'Error interno al eliminar el ticket' });
  }
});

/* ========= Subir evidencia ========= */
router.post('/:id/evidencias',
  uploadEvidence.single('file'),
  async (req, res) => {
    try {
      const ticketId = req.params.id;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          ok: false,
          mensaje: 'No se recibió archivo de evidencia',
        });
      }

      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        return res.status(404).json({
          ok: false,
          mensaje: 'Ticket no encontrado',
        });
      }

      const info = await uploadTicketEvidence(ticket, file);

      ticket.driveFolderId = info.folderId;
      ticket.driveFolderLink = info.webViewLink || ticket.driveFolderLink;

      ticket.evidencias.push({
        fileId: info.fileId,
        fileName: info.fileName,
        webViewLink: info.webViewLink,
        webContentLink: info.webContentLink,
      });

      await ticket.save();

      try { fs.unlinkSync(file.path); } catch (e) {}

      return res.status(201).json({
        ok: true,
        mensaje: 'Evidencia subida correctamente',
        evidencia: ticket.evidencias[ticket.evidencias.length - 1],
      });
    } catch (error) {
      console.error('Error subiendo evidencia:', error.message || error);

      return res.status(500).json({
        ok: false,
        mensaje: 'Error al subir la evidencia',
      });
    }
  }
);

module.exports = router;
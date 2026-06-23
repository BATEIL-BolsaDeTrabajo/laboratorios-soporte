const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { ensureTicketFolder } = require('../utils/googleDrive');
const { sendWhatsappText } = require('../utils/whatsapp');

const OPEN_STATUSES = ['Abierto', 'En proceso', 'En espera de material', 'Tiempo excedido'];

function normalizePhone(value = '') {
  return String(value).replace(/[^\d]/g, '');
}

function getMessageText(message = {}) {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || '';
  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      ''
    );
  }
  return `[Mensaje ${message.type || 'no soportado'} recibido por WhatsApp]`;
}

function guessTicketType(text = '') {
  const lower = String(text).toLowerCase();
  if (lower.includes('mantenimiento') || lower.includes('luz') || lower.includes('agua') || lower.includes('clima')) {
    return 'Mantenimiento';
  }

  if (process.env.WHATSAPP_DEFAULT_TICKET_TYPE === 'Mantenimiento') {
    return 'Mantenimiento';
  }

  return 'Sistemas';
}

function buildDescription({ text, from, contactName }) {
  return [
    text,
    '',
    '---',
    `Origen: WhatsApp`,
    `Contacto: ${contactName || 'Sin nombre'}`,
    `Telefono: +${from}`
  ].join('\n').trim();
}

async function getWhatsappUser() {
  if (process.env.WHATSAPP_DEFAULT_USER_ID) {
    const user = await User.findById(process.env.WHATSAPP_DEFAULT_USER_ID);
    if (user) return user;
  }

  const correo = process.env.WHATSAPP_DEFAULT_USER_EMAIL || 'whatsapp@tickets.local';
  let user = await User.findOne({ correo });
  if (user) return user;

  const randomPassword = `whatsapp-${Date.now()}-${Math.random()}`;
  const passwordHash = await bcrypt.hash(randomPassword, 10);

  user = await User.create({
    nombre: process.env.WHATSAPP_DEFAULT_USER_NAME || 'WhatsApp Business',
    correo,
    contraseña: passwordHash,
    roles: ['docente']
  });

  return user;
}

function pushWhatsappHistory(ticket, { text, messageId, contactName, from }) {
  ticket.historial.push({
    fecha: new Date(),
    usuario: ticket.creadoPor,
    usuarioNombre: contactName || `WhatsApp +${from}`,
    de: ticket.estatus,
    a: ticket.estatus,
    comentario: `WhatsApp: ${text}${messageId ? `\nID mensaje: ${messageId}` : ''}`
  });
}

function formatFechaNotificacion(fecha) {
  return new Date(fecha).toLocaleString('es-MX', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function notifyAdmins(io, ticket, actionLabel) {
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

  const titulo = `${actionLabel} por WhatsApp (${ticket.tipo || '-'}) - ${ticket.folio || 'Sin folio'}`;
  const notifications = await Notification.insertMany(
    admins.map(user => ({
      usuario: user._id,
      titulo,
      tipo: actionLabel === 'Nuevo ticket' ? 'nuevo' : 'comentario',
      ticket: ticket._id
    }))
  );

  if (!io) return;

  notifications.forEach(notification => {
    io.to(`user:${notification.usuario.toString()}`).emit('nuevaNotificacion', {
      titulo: notification.titulo,
      fecha: formatFechaNotificacion(notification.fecha),
      tipo: notification.tipo || 'general',
      leida: false
    });
  });
}

async function createOrUpdateTicketFromMessage({ from, contactName, messageId, text, io }) {
  const user = await getWhatsappUser();

  const existing = await Ticket.findOne({
    canal: 'whatsapp',
    'whatsapp.from': from,
    estatus: { $in: OPEN_STATUSES },
    archivado: { $ne: true }
  }).sort({ fechaCreacion: -1 });

  if (existing) {
    if (existing.whatsapp?.lastMessageId === messageId) {
      return { ticket: existing, created: false, duplicate: true };
    }

    pushWhatsappHistory(existing, { text, messageId, contactName, from });
    existing.whatsapp.contactName = contactName || existing.whatsapp.contactName || '';
    existing.whatsapp.lastMessageId = messageId || existing.whatsapp.lastMessageId || '';
    existing.whatsapp.lastMessageAt = new Date();
    await existing.save();

    await notifyAdmins(io, existing, 'Nuevo mensaje');
    return { ticket: existing, created: false, duplicate: false };
  }

  const ticket = await Ticket.create({
    descripcion: buildDescription({ text, from, contactName }),
    tipo: guessTicketType(text),
    creadoPor: user._id,
    estatus: 'Abierto',
    canal: 'whatsapp',
    whatsapp: {
      from,
      contactName: contactName || '',
      lastMessageId: messageId || '',
      lastMessageAt: new Date()
    },
    historial: [{
      fecha: new Date(),
      usuario: user._id,
      usuarioNombre: contactName || `WhatsApp +${from}`,
      de: '',
      a: 'Abierto',
      comentario: `Ticket creado desde WhatsApp${messageId ? `\nID mensaje: ${messageId}` : ''}`
    }]
  });

  try {
    const folder = await ensureTicketFolder(ticket);
    if (folder?.id) {
      ticket.driveFolderId = folder.id;
      ticket.driveFolderLink = folder.webViewLink || null;
      await ticket.save();
    }
  } catch (error) {
    console.error('Error creando carpeta Drive para ticket WhatsApp:', error.message || error);
  }

  await notifyAdmins(io, ticket, 'Nuevo ticket');
  return { ticket, created: true, duplicate: false };
}

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const entries = req.body?.entry || [];
    const io = req.app.get('io');

    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const contactByWaId = new Map(
          (value.contacts || []).map(contact => [
            normalizePhone(contact.wa_id),
            contact.profile?.name || ''
          ])
        );

        for (const message of value.messages || []) {
          const from = normalizePhone(message.from);
          const text = getMessageText(message).trim();
          if (!from || !text) continue;

          const contactName = contactByWaId.get(from) || '';
          const result = await createOrUpdateTicketFromMessage({
            from,
            contactName,
            messageId: message.id,
            text,
            io
          });

          if (result.duplicate) continue;

          if (io) {
            io.emit('ticketsActualizados', {
              accion: result.created ? 'creado-whatsapp' : 'comentario-whatsapp',
              ticketId: result.ticket._id.toString(),
              estatus: result.ticket.estatus,
              tipo: result.ticket.tipo
            });
          }

          const reply = result.created
            ? `Recibimos tu reporte. Se creo el ticket ${result.ticket.folio}.`
            : `Agregamos tu mensaje al ticket ${result.ticket.folio}.`;

          sendWhatsappText(from, reply).catch(error => {
            console.error('Error enviando respuesta de WhatsApp:', error.message || error);
          });
        }
      }
    }
  } catch (error) {
    console.error('POST /api/whatsapp/webhook error:', error);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();

const Notification = require('../models/Notification');
const { verifyToken } = require('../middlewares/auth');

// GET /api/notifications
// Últimas 20 notificaciones del usuario logueado
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.usuario.id || req.usuario._id;

    const notifs = await Notification.find({ usuario: userId })
      .sort({ fecha: -1 })
      .limit(20);

    res.json(notifs);
  } catch (err) {
    console.error('Error GET /api/notifications', err);
    res.status(500).json({ mensaje: 'Error al obtener notificaciones' });
  }
});

// POST /api/notifications
// Crear una notificación para el usuario logueado
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.usuario.id || req.usuario._id;
    const { titulo, tipo, ticketId } = req.body;

    if (!titulo) {
      return res.status(400).json({ mensaje: 'El título es obligatorio' });
    }

    const notif = await Notification.create({
      usuario: userId,
      titulo,
      tipo: tipo || 'general',
      ticket: ticketId || null
    });

    res.status(201).json(notif);
  } catch (err) {
    console.error('Error POST /api/notifications', err);
    res.status(500).json({ mensaje: 'Error al crear notificación' });
  }
});

// POST /api/notifications/marcar-leidas
// Marca todas las no leídas del usuario como leídas
router.post('/marcar-leidas', verifyToken, async (req, res) => {
  try {
    const userId = req.usuario.id || req.usuario._id;

    await Notification.updateMany(
      { usuario: userId, leida: false },
      { $set: { leida: true } }
    );

    res.json({ mensaje: 'Notificaciones marcadas como leídas' });
  } catch (err) {
    console.error('Error POST /api/notifications/marcar-leidas', err);
    res.status(500).json({ mensaje: 'Error al marcar como leídas' });
  }
});

module.exports = router; 
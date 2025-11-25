const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    titulo: {
      type: String,
      required: true,
      trim: true
    },
    tipo: {
      type: String,
      enum: ['nuevo', 'prioridad', 'general','asignado','resuelto'],
      default: 'asignado'
    },
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      default: null
    },
    leida: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: {
      createdAt: 'fecha',
      updatedAt: 'actualizado'
    }
  }
);

module.exports = mongoose.model('Notification', notificationSchema);

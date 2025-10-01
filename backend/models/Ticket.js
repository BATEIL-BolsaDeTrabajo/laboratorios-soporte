// models/Ticket.js
const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
  // Área responsable
  area: { type: String, enum: ['sistemas', 'mantenimiento'], required: true, index: true },

  // Subtipo para área "sistemas"
  // 'laboratorio' = incidente en un lab de cómputo; 'otro' = fuera de laboratorio (oficinas, etc.)
  tipo: { type: String, enum: ['laboratorio', 'otro', null], default: null, index: true },

  // Contexto de ubicación
  laboratorio: { type: String, default: null }, // Laboratorio A/B/C/D/Química/Audiovisual
  equipo: { type: String, default: null },      // Etiqueta del equipo (ej. PC-03)
  ubicacion: { type: String, default: null },   // Para "sistemas/otro"
  salon: { type: String, default: null },       // Para "mantenimiento"

  // Clasificación
  tipoFalla: { type: String, required: true },  // Catálogo elegido desde el formulario
  descripcion: { type: String, required: true },

  // Flujo
  estado: {
    type: String,
    enum: ['Abierto','En atención','Resuelto','Cerrado','Cancelado'],
    default: 'Abierto',
    index: true
  },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  asignadoA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Extras
  requiereMaterial: { type: Boolean, default: false },
  notas: { type: String, default: null }
}, { timestamps: true });

TicketSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Ticket', TicketSchema);

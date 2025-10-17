// models/Ticket.js
const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  descripcion: { type: String, required: true },

  // Área general (compat con lo anterior)
  tipo: { type: String, enum: ['Sistemas', 'Mantenimiento'], required: true, index: true },

  // Detalle adicional (opcionales)
  subtipo: { type: String, enum: ['laboratorio','otro', null], default: null, index: true }, // solo para Sistemas
  laboratorio: { type: String, default: null }, // Lab A/B/C/D/Química/Audiovisual
  equipo: { type: String, default: null },      // etiqueta PC
  ubicacion: { type: String, default: null },   // si es "otro" en sistemas
  salon: { type: String, default: null },       // para mantenimiento
  tipoFalla: { type: String, default: null },   // texto del catálogo
  ubicacion: { type: String, default: '' },

  // MANTENIMIENTO
  salonArea: { type: String, default: '' },

  // GENERAL
  tipoFalla: { type: String, default: '' },
  descripcion: { type: String, default: '' },

  estatus: {
    type: String,
    enum: ['Abierto', 'En proceso', 'Resuelto', 'Cerrado'],
    default: 'Abierto',
    index: true
  },
  requiereMaterial: { type: String, default: '' },
  resolucion: { type: String, default: '' },

  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  asignadoA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  fechaCreacion: { type: Date, default: Date.now },
  fechaCierre: { type: Date, default: null }
}, { timestamps: true });

ticketSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Ticket', ticketSchema);

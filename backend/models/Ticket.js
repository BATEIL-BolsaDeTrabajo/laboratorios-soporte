const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  descripcion: { type: String, required: true },
  tipo: { type: String, enum: ['Sistemas', 'Mantenimiento'], required: true },
  estatus: {
    type: String,
    enum: ['Abierto', 'En proceso', 'Resuelto', 'Cerrado'],
    default: 'Abierto'
  },
  requiereMaterial: { type: String, default: '' }, // Solo lo llena el personal
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  asignadoA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  fechaCreacion: { type: Date, default: Date.now },
  fechaCierre: { type: Date, default: null }
});

module.exports = mongoose.model('Ticket', ticketSchema);
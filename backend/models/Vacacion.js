const mongoose = require('mongoose');

const vacacionSchema = new mongoose.Schema({
  solicitante: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fechaInicio: {
    type: Date,
    required: true
  },
  fechaFin: {
    type: Date,
    required: true
  },
  motivo: {
    type: String
  },
  detalles: {
    type: String
  },
  diasSolicitados: {
    type: Number,
    required: true
  },
  diasDisponiblesAntes: {
    type: Number
  },
  diasRestantes: {
    type: Number
  },
  diasPorPagar: {
    type: Number,
    default: 0
  },
  estatus: {
    type: String,
    enum: ['Pendiente', 'Aceptado', 'Rechazado'],
    default: 'Pendiente'
  },
  revisadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rolRevisor: {
    type: String,
    enum: ['subdireccion', 'finanzas']
  },
  motivoRespuesta: {
    type: String
  },
  fechaSolicitud: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Vacacion', vacacionSchema);

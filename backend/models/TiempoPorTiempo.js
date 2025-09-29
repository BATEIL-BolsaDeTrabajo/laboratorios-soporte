const mongoose = require('mongoose');

const tiempoPorTiempoSchema = new mongoose.Schema({
  docente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  horas: {
    type: Number,
    required: true
  },
  motivo: {
    type: String
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
  motivoRespuesta: {
    type: String
  },
  fechaRegistro: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('TiempoPorTiempo', tiempoPorTiempoSchema);

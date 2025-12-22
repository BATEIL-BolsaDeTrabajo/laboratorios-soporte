// backend/models/AuditoriaInventario.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const auditoriaInventarioSchema = new Schema({
  producto: {
    type: Schema.Types.ObjectId,
    ref: 'Producto'
  },
  accion: {
    type: String, // entrada, salida, ajuste, modificacion
    required: true
  },
  cantidadAntes: {
    type: Number
  },
  cantidadDespues: {
    type: Number
  },
  detalle: {
    type: String, // comentario opcional del cambio
    default: ''
  },
  usuario: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  fecha: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AuditoriaInventario', auditoriaInventarioSchema);

// backend/models/SalidaAlmacen.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const salidaAlmacenSchema = new Schema({
  producto: {
    type: Schema.Types.ObjectId,
    ref: 'Producto',
    required: true
  },
  cantidad: {
    type: Number,
    required: true,
    min: 0
  },
  entregadoA: {
    type: String, // nombre de la persona
    required: true,
    trim: true
  },
  departamento: {
    type: String, // área/departamento donde se usará
    required: true,
    trim: true
  },
  comentarios: {
    type: String, // motivo de uso, reporte, etc.
    default: ''
  },
  fecha: {
    type: Date,
    default: Date.now
  },
  realizadoPor: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SalidaAlmacen', salidaAlmacenSchema);

// backend/models/AjusteInventario.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ajusteInventarioSchema = new Schema({
  producto: {
    type: Schema.Types.ObjectId,
    ref: 'Producto',
    required: true
  },
  tipo: {
    type: String,
    enum: ['merma', 'devolucion', 'error'],
    required: true
  },
  cantidad: {
    type: Number,
    required: true,
    min: 0
  },
  motivo: {
    type: String,
    required: true
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

module.exports = mongoose.model('AjusteInventario', ajusteInventarioSchema);

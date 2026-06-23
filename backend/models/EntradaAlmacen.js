// backend/models/EntradaAlmacen.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const entradaAlmacenSchema = new Schema({
  producto: {
    type: Schema.Types.ObjectId,
    ref: 'Producto',
    required: true
  },
  cantidad: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: (valor) => Number.isFinite(valor) && valor > 0,
      message: 'La cantidad de entrada debe ser mayor a cero.'
    }
  },
  proveedor: {
    type: String,
    default: ''
  },
  folio: {
    type: String,
    default: '' // folio / factura opcional
  },
  fecha: {
    type: Date,
    default: Date.now
  },
  registradoPor: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  clientRequestId: {
    type: String,
    trim: true,
    index: true,
    unique: true,
    sparse: true
  },

  // ✅ Confirmación de recepción física
  recibido: {
    type: Boolean,
    default: false
  },
  fechaRecibido: {
    type: Date,
    default: null
  },
  recibidoPor: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('EntradaAlmacen', entradaAlmacenSchema);

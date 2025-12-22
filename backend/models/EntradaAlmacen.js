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
    min: 0
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
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('EntradaAlmacen', entradaAlmacenSchema);

// backend/models/AuditoriaInventario.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const esNumeroFinitoONulo = (valor) => valor === null || valor === undefined || Number.isFinite(valor);

const auditoriaInventarioSchema = new Schema({
  producto: {
    type: Schema.Types.ObjectId,
    ref: 'Producto'
  },
  accion: {
    type: String,
    required: true
  },
  movimientoId: {
    type: Schema.Types.ObjectId,
    default: null
  },
  movimientoModelo: {
    type: String,
    enum: ['EntradaAlmacen', 'SalidaAlmacen', 'AjusteInventario']
  },
  cantidadMovimiento: {
    type: Number,
    default: null,
    validate: {
      validator: esNumeroFinitoONulo,
      message: 'La cantidad del movimiento debe ser un número válido.'
    }
  },
  cantidadAntes: {
    type: Number,
    validate: {
      validator: esNumeroFinitoONulo,
      message: 'La cantidad anterior debe ser un número válido.'
    }
  },
  cantidadDespues: {
    type: Number,
    validate: {
      validator: esNumeroFinitoONulo,
      message: 'La cantidad posterior debe ser un número válido.'
    }
  },
  detalle: {
    type: String, // comentario opcional del cambio
    default: ''
  },
  usuario: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  usuarioEmail: {
    type: String,
    default: '',
    trim: true
  },
  referencia: {
    type: String,
    default: '',
    trim: true
  },
  requestId: {
    type: String,
    default: '',
    trim: true
  },
  ip: {
    type: String,
    default: '',
    trim: true
  },
  userAgent: {
    type: String,
    default: '',
    trim: true
  },
  metadatos: {
    type: Schema.Types.Mixed,
    default: () => ({})
  },
  fecha: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

auditoriaInventarioSchema.index({ producto: 1, fecha: -1 });
auditoriaInventarioSchema.index({ movimientoModelo: 1, movimientoId: 1 });

module.exports = mongoose.model('AuditoriaInventario', auditoriaInventarioSchema);

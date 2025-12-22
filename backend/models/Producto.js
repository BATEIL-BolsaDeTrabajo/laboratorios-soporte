// backend/models/Producto.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const productoSchema = new Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  categoria: {
    type: String, // papelería, herramientas, limpieza, etc.
    required: true,
    trim: true
  },
  unidadMedida: {
    type: String, // piezas, caja, litros, etc.
    required: true,
    trim: true
  },
  codigo: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  descripcion: {
    type: String,
    default: ''
  },
  stockMinimo: {
    type: Number,
    default: 0
  },
  stockActual: {
    type: Number,
    default: 0
  },
  estado: {
    type: String,
    enum: ['activo', 'inactivo'],
    default: 'activo'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Producto', productoSchema);

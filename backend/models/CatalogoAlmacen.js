const mongoose = require('mongoose');
const { Schema } = mongoose;

const catalogoAlmacenSchema = new Schema({
  tipo: {
    type: String,
    enum: ['categoria', 'unidadMedida', 'departamento', 'tipoSalida'],
    required: true,
    index: true
  },
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  nombreNormalizado: {
    type: String,
    required: true,
    trim: true
  },
  orden: {
    type: Number,
    default: 0,
    min: 0
  },
  activo: {
    type: Boolean,
    default: true
  },
  actualizadoPor: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

catalogoAlmacenSchema.index({ tipo: 1, nombreNormalizado: 1 }, { unique: true });
catalogoAlmacenSchema.index({ tipo: 1, activo: 1, orden: 1, nombre: 1 });

module.exports = mongoose.model('CatalogoAlmacen', catalogoAlmacenSchema);

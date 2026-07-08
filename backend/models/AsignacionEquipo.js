const mongoose = require('mongoose');
const { Schema } = mongoose;

const movimientoAsignacionSchema = new Schema({
  accion: {
    type: String,
    required: true,
    trim: true
  },
  descripcion: {
    type: String,
    required: true,
    trim: true
  },
  usuario: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  fecha: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const asignacionEquipoSchema = new Schema({
  colaborador: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  tipoEquipo: {
    type: String,
    required: true,
    trim: true
  },
  marca: {
    type: String,
    required: true,
    trim: true
  },
  modelo: {
    type: String,
    required: true,
    trim: true
  },
  numeroSerie: {
    type: String,
    required: true,
    trim: true
  },
  numeroInventario: {
    type: String,
    default: '',
    trim: true
  },
  estadoEquipo: {
    type: String,
    enum: ['bueno', 'regular', 'requiere_mantenimiento'],
    default: 'bueno'
  },
  fechaAsignacion: {
    type: Date,
    default: Date.now
  },
  observaciones: {
    type: String,
    default: '',
    trim: true
  },
  estadoAsignacion: {
    type: String,
    enum: ['activo', 'retirado'],
    default: 'activo',
    index: true
  },
  aceptadoPorColaborador: {
    type: Boolean,
    default: false,
    index: true
  },
  fechaAceptacion: {
    type: Date
  },
  fechaRetiro: {
    type: Date
  },
  motivoRetiro: {
    type: String,
    default: '',
    trim: true
  },
  historial: {
    type: [movimientoAsignacionSchema],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AsignacionEquipo', asignacionEquipoSchema);

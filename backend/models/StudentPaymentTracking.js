const mongoose = require('mongoose');

const paymentStatusSchema = new mongoose.Schema(
  {
    value: {
      type: String,
      enum: ['', 'SI', 'NO'],
      default: ''
    },
    updatedAt: {
      type: Date,
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { _id: false }
);

const studentPaymentTrackingSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    matricula: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    nombre: {
      type: String,
      required: true,
      trim: true
    },

    grupo: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    seccion: {
      type: String,
      default: '',
      trim: true
    },

    cycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cycle',
      required: true,
      index: true
    },

    payments: {
      type: Map,
      of: paymentStatusSchema,
      default: {}
    },

    asistencia: {
      type: String,
      enum: ['', 'REGULAR', 'IRREGULAR'],
      default: ''
    },

    motivo: {
      type: String,
      default: '',
      trim: true
    },

    notasAcademicas: {
      type: String,
      default: '',
      trim: true
    },

    notasAdministrativas: {
      type: String,
      default: '',
      trim: true
    },

    lastCajaUploadAt: {
      type: Date,
      default: null
    },

    lastCajaUploadBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Un alumno no debe repetirse dentro del mismo ciclo
studentPaymentTrackingSchema.index(
  { matricula: 1, cycleId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  'StudentPaymentTracking',
  studentPaymentTrackingSchema
);
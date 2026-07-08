const mongoose = require('mongoose');

const subjectGradeSchema = new mongoose.Schema({
  materia: { type: String, required: true },
  calificacion: { type: Number, default: null }
}, { _id: false });

const followUpCommentSchema = new mongoose.Schema({
  texto: { type: String, required: true },
  fecha: { type: Date, default: Date.now },
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  usuarioNombre: { type: String, default: 'Usuario' }
}, { _id: true });

const academicTrackingSchema = new mongoose.Schema({
  ciclo: { type: String, required: true, trim: true },
  grupo: { type: String, required: true, trim: true },
  parcial: { type: String, required: true, trim: true },
  matricula: { type: String, required: true, trim: true },
  nombre: { type: String, required: true, trim: true },
  materias: [subjectGradeSchema],
  promedio: { type: Number, default: null },
  materiasReprobadas: { type: Number, default: 0 },
  accion: {
    type: String,
    enum: ['CITA', 'MENSAJE'],
    default: 'MENSAJE'
  },
  comentarios: [followUpCommentSchema],
  acuerdos: [followUpCommentSchema],
  fuenteArchivo: { type: String, default: null },
  ultimaImportacion: { type: Date, default: Date.now }
}, {
  timestamps: true
});

academicTrackingSchema.index(
  { ciclo: 1, grupo: 1, parcial: 1, matricula: 1 },
  { unique: true }
);

module.exports = mongoose.model('AcademicTracking', academicTrackingSchema);

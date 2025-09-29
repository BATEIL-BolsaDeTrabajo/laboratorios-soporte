// models/Calificacion.js
const mongoose = require('mongoose');

const calificacionSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  matricula: { type: String, required: true },
  especialidad: { type: String, required: true },
  semestre: { type: Number, required: true },
  grupo: { type: String, required: true },
  materia: { type: String, required: true },
  parciales: [{ type: Number }],   // puede contener [null, null, 85, null] si solo se subió el P3
  final: { type: Number },         // opcional
  parcial: { type: Number },       // opcional: si solo es 1 parcial
  periodo: { type: String, required: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Calificacion', calificacionSchema);

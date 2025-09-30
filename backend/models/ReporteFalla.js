const mongoose = require('mongoose');

const reporteSchema = new mongoose.Schema({
  laboratorio: { type: String, required: true },
  equipo: { type: String, required: true }, // Ej: PC1, PC2
  tipoFalla: { type: String, required: true },
  descripcion: { type: String },
  fecha: { type: Date, default: Date.now },
  reportadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // 🆕 Campos necesarios para gestión desde panel
  estatus: { type: String, default: 'Abierto' },
  requiereMaterial: { type: String },
  asignadoA: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('ReporteFalla', reporteSchema);

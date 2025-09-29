const mongoose = require('mongoose');

const LABS = [
  'Laboratorio A',
  'Laboratorio B',
  'Laboratorio C',
  'Laboratorio D',
  'Laboratorio de Química',
  'Audiovisual'
];

const horarioSchema = new mongoose.Schema({
  laboratorio: { type: String, enum: LABS, required: true },
  fecha: { type: Date, required: true },
  hora: { type: String, required: true }, // Ej: "10:00-11:00"
  reservadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  estado: { type: String, enum: ['Disponible', 'Reservado'], default: 'Disponible' }
});

// (Opcional, MUY recomendado para evitar duplicados)
horarioSchema.index({ laboratorio: 1, fecha: 1, hora: 1 }, { unique: true });

module.exports = mongoose.model('Horario', horarioSchema);
module.exports.LABS = LABS;




/*const mongoose = require('mongoose');

const horarioSchema = new mongoose.Schema({
  laboratorio: { type: String, enum: ['Lab 1', 'Lab 2', 'Lab 3'], required: true },
  fecha: { type: Date, required: true },
  hora: { type: String, required: true }, // Ej: "10:00-11:00"
  reservadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  estado: { type: String, enum: ['Disponible', 'Reservado'], default: 'Disponible' }
});

module.exports = mongoose.model('Horario', horarioSchema);
*/
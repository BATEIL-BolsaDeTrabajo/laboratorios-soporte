// models/Ticket.js
const mongoose = require('mongoose');
const Counter  = require('./Counter'); // Asegúrate de tener este archivo creado
const { Schema } = mongoose;

// === Subdocumento de historial de cambios ===
const HistorySchema = new Schema({
  fecha: { type: Date, default: Date.now },
  usuario: { type: Schema.Types.ObjectId, ref: 'User' },
  usuarioNombre: { type: String },        // snapshot del nombre
  de: { type: String },                   // estatus anterior
  a: { type: String },                    // estatus nuevo
  comentario: { type: String },           // si se agrega un comentario
  requiereMaterial: { type: String },     // texto capturado si aplica
  resolucion: { type: String },           // resolución si aplica
  fechaInicio: { type: Date },
  fechaReanudacion: { type: Date },
  fechaCierre: { type: Date },
  tiempoSolucionMin: { type: Number }     // minutos, calculado cuando cierra/resuelve
}, { _id: false });

// === Esquema principal de Ticket ===
const ticketSchema = new mongoose.Schema({
  // Descripción
  descripcion: { type: String, required: true },

  // Área general
  tipo: { type: String, enum: ['Sistemas', 'Mantenimiento'], required: true, index: true },

  // Detalles adicionales
  subtipo: { type: String },
  laboratorio: { type: String, default: null },
  equipo: { type: String, default: null },
  ubicacion: { type: String, default: '' },
  salon: { type: String, default: null },
  tipoFalla: { type: String, default: '' },
  prioridad: { type: String, enum: ['Alta','Media','Baja'], default: null, index: true },

  // Estado general
  estatus: {
    type: String,
    enum: [
      'Abierto',
      'En proceso',
      'En espera de material',
      'Resuelto',
      'Tiempo excedido',
      'Cerrado'
    ],
    default: 'Abierto',
    index: true
  },
  requiereMaterial: { type: String, default: '' },
  resolucion: { type: String, default: '' },

  // Relaciones con usuarios
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  asignadoA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Fechas clave
  fechaCreacion:    { type: Date, default: Date.now },
  fechaInicio:      { type: Date, default: null },
  fechaPausa:       { type: Date, default: null },
  fechaReanudacion: { type: Date, default: null },
  fechaExcedido:    { type: Date, default: null },
  fechaCierre:      { type: Date, default: null },

  // Folio único
  folio: { type: String, unique: true, index: true },

  // Historial de cambios
  historial: { type: [HistorySchema], default: [] }
}, { timestamps: true });

ticketSchema.index({ createdAt: -1 });

// === Generador de folios ===
function buildFolio(tipo, year, seq) {
  const map = { 'sistemas': 'SYS', 'mantenimiento': 'MNT' };
  const pref = map[(tipo || '').toLowerCase()] || 'TCK';
  return `${pref}-${year}-${String(seq).padStart(6, '0')}`;
}

// Asignar folio automáticamente si no existe
ticketSchema.pre('save', async function(next){
  if (this.folio) return next(); // ya tiene folio
  try {
    const year = new Date(this.createdAt || Date.now()).getFullYear();
    const key = `ticket-${(this.tipo || '').toLowerCase()}-${year}`;

    const counter = await Counter.findOneAndUpdate(
      { key },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    this.folio = buildFolio(this.tipo, year, counter.seq);
    next();
  } catch (err) {
    console.error('Error al generar folio:', err);
    next(err);
  }
});

// === Exporta el modelo ===
module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);

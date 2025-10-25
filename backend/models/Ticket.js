// models/Ticket.js
const mongoose = require('mongoose');
const Counter  = require('./Counter'); // Asegúrate de crear este archivo (ver más abajo)

const ticketSchema = new mongoose.Schema({
  // Descripción
  descripcion: { type: String, required: true }, // (deja requerido como lo tenías)

  // Área general
  tipo: { type: String, enum: ['Sistemas', 'Mantenimiento'], required: true, index: true },

  // Detalle adicional (opcionales)
  // OJO: evita enum con null. Déjalo libre o con enum sin default.
  subtipo: { type: String },                 // p.ej. 'laboratorio' | 'otro'
  laboratorio: { type: String, default: null },
  equipo: { type: String, default: null },
  ubicacion: { type: String, default: '' },  // ÚNICO (quitamos duplicado)
  salon: { type: String, default: null },    // Para mantenimiento
  tipoFalla: { type: String, default: '' },  // ÚNICO (quitamos duplicado)

  // Estado y trabajo
  estatus: {
    type: String,
    enum: ['Abierto', 'En proceso', 'En espera de material', 'Resuelto', 'Cerrado'],
    default: 'Abierto',
    index: true
  },
  requiereMaterial: { type: String, default: '' },
  resolucion: { type: String, default: '' },

  // Relaciones (ajusta el ref a tu modelo real de usuarios)
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  asignadoA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Fechas clave (únicas, sin duplicados)
  fechaCreacion:    { type: Date, default: Date.now },
  fechaInicio:      { type: Date, default: null },
  fechaPausa:       { type: Date, default: null },
  fechaReanudacion: { type: Date, default: null },
  fechaCierre:      { type: Date, default: null },

  // Folio
  folio: { type: String, unique: true, index: true }
}, { timestamps: true });

ticketSchema.index({ createdAt: -1 });

// Helper para folio: TIPO + AÑO + consecutivo de 6 dígitos
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
    const key = `ticket-${year}`; // contador por año (si quieres por tipo: `ticket-${(this.tipo||'').toLowerCase()}-${year}`)

    const counter = await Counter.findOneAndUpdate(
      { key },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    this.folio = buildFolio(this.tipo, year, counter.seq);
    next();
  } catch (err) {
    next(err);
  }
});

// Export único (evita recompilar en hot-reload)
module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);


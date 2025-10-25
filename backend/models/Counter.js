// models/Counter.js
const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // p.ej. "ticket-2025"
  seq: { type: Number, default: 0 },
}, { versionKey: false });

module.exports = mongoose.model('Counter', CounterSchema);

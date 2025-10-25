// scripts/folio-migrate.js
require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Counter = require('../models/Counter');

function buildFolio(tipo, year, seq) {
  const map = { 'sistemas': 'SYS', 'mantenimiento': 'MNT' };
  const pref = map[(tipo || '').toLowerCase()] || 'TCK';
  return `${pref}-${year}-${String(seq).padStart(6, '0')}`;
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Agrupamos por año para respetar los contadores por año
    const sinFolio = await Ticket.find({ $or: [{ folio: { $exists: false } }, { folio: null }] }).sort({ createdAt: 1 });
    const groups = {}; // { '2024': [t1,t2,...], '2025': [...] }

    for (const t of sinFolio) {
      const year = new Date(t.createdAt || Date.now()).getFullYear();
      groups[year] = groups[year] || [];
      groups[year].push(t);
    }

    for (const year of Object.keys(groups)) {
      const key = `ticket-${year}`;
      // Lee contador actual o crea desde 0
      let counter = await Counter.findOne({ key });
      if (!counter) counter = await Counter.create({ key, seq: 0 });

      for (const t of groups[year]) {
        counter = await Counter.findOneAndUpdate(
          { key },
          { $inc: { seq: 1 } },
          { new: true, upsert: true }
        );
        t.folio = buildFolio(t.tipo, parseInt(year, 10), counter.seq);
        await t.save();
        console.log('Asignado folio:', t.folio);
      }
    }

    console.log('Migración de folios completada');
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();

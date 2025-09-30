const mongoose = require('mongoose');
require('dotenv').config();

const Calificacion = require('../models/Calificacion');

// Conectar a la base de datos
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('🟢 Conectado a MongoDB');

  const resultado = await Calificacion.updateMany(
    { periodo: "nuevo" },
    { $set: { periodo: "2025-EneroJunio" } }
  );

  console.log(`✅ Documentos actualizados: ${resultado.modifiedCount}`);
  mongoose.disconnect();

}).catch(err => {
  console.error('❌ Error al conectar:', err);
});

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Horario = require('../models/Horario');

const laboratorios = ["Lab 1", "Lab 2", "Lab 3"];
const horas = [
  "8:00 a 8:50",
  "9:20 a 10:10",
  "10:15 a 11:05",
  "11:10 a 12:00",
  "12:05 a 12:55",
  "1:30 a 2:20",
  "2:25 a 3:15",
  "3:20 a 4:10",
  "4:10 a 5:00"
];

// Función para obtener el próximo lunes
/*function obtenerProximoLunes() {
  const hoy = new Date();
  const dia = hoy.getDay(); // 0 = domingo, 1 = lunes...
  const diferencia = (dia === 0 ? 1 : 8 - dia); // si es domingo suma 1, si es lunes suma 7, etc.
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + diferencia);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}*/

// Genera fechas de lunes a viernes
function obtenerFechasSemana() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const diaHoy = hoy.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = sábado
  const diasHastaProximoLunes = (8 - diaHoy) % 7 || 7; // al menos 1 día adelante

  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + diasHastaProximoLunes);

  const fechas = [];
  for (let i = 0; i < 5; i++) {
    const fecha = new Date(lunes);
    fecha.setDate(lunes.getDate() + i);
    fechas.push(fecha);
  }

  return fechas;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log("⛔ Eliminando horarios anteriores...");
  await Horario.deleteMany({});

  console.log("📆 Generando horarios para la próxima semana...");

  const fechas = obtenerFechasSemana();
  const nuevos = [];

  for (const fecha of fechas) {
    laboratorios.forEach(lab => {
      horas.forEach(hora => {
        nuevos.push({
          laboratorio: lab,
          fecha,
          hora,
          estado: "Disponible"
        });
      });
    });
  }

  await Horario.insertMany(nuevos);
  console.log("🎉 Horarios cargados exitosamente para lunes a viernes");

  await mongoose.disconnect();
}

run().catch(err => {
  console.error("❌ Error:", err);
  mongoose.disconnect();
});

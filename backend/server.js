const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
const authRoutes = require('./routes/auth.js');
app.use('/api/auth', authRoutes);

const horarioRoutes = require('./routes/horarios');
app.use('/api/horarios', horarioRoutes);

const fallasRoutes = require('./routes/fallas');
app.use('/api/fallas', fallasRoutes);

const ticketsRoutes = require('./routes/tickets');
app.use('/api/tickets', ticketsRoutes);

const usersRoutes = require('./routes/users');
app.use('/api/users', usersRoutes);

const vacacionesRoutes = require('./routes/vacacionesroutes.js');
app.use('/api/vacaciones', vacacionesRoutes);

const tiempoRoutes = require('./routes/tiempoRoutes');
app.use('/api/tiempo', tiempoRoutes);

const calificacionesRoutes = require('./routes/calificaciones');
app.use('/api/calificaciones', calificacionesRoutes);



app.get('/', (req, res) => {
  res.send('Servidor de gestión de laboratorios funcionando 🚀');
});

const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend')));


// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('🟢 Conectado a MongoDB'))
  .catch(err => console.error('🔴 Error en MongoDB:', err));

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
});


//carga horarios cada domingo
const cron = require('node-cron');
const Horario = require('./models/Horario');

//const laboratorios = ["Lab 1", "Lab 2", "Lab 3"];
const laboratorios = [
  "Laboratorio A",
  "Laboratorio B",
  "Laboratorio C",
  "Laboratorio D",
  "Laboratorio de Química",
  "Audiovisual"
];
const horas = [
  "8:00 a 8:50",
  "8:55 a 9:45",
  "9:50 a 10:40",
  "10:40 a 11:10",
  "11:10 a 12:00",
  "12:05 a 12:55",
  "1:00 a 1:50",
  "1:50 a 2:20",
  "2:20 a 3:10",
  "3:15 a 4:05",
  "4:10 a 5:00"
];

const horasSabado = [
  "9:00 a 10:00",
  "10:00 a 11:00",
  "11:00 a 12:00",
  "12:00 a 1:00"
];


function obtenerProximoLunes() {
  const hoy = new Date();
  const dia = hoy.getDay(); // 0 = domingo
  const lunes = new Date(hoy);
  const diferencia = dia === 0 ? 1 : 8 - dia;
  lunes.setDate(hoy.getDate() + diferencia);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

function obtenerFechasSemanaActualOProxima() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const diaHoy = hoy.getDay();
  const lunes = new Date(hoy);
  const diferencia = diaHoy === 0 ? -6 : 1 - diaHoy; // Domingo → lunes anterior
  lunes.setDate(hoy.getDate() + diferencia);
  lunes.setHours(0, 0, 0, 0);

  const fechas = [];
  for (let i = 0; i < 6; i++) {
    const fecha = new Date(lunes);
    fecha.setDate(lunes.getDate() + i);
    fechas.push(fecha);
  }

  return fechas;
}



/*async function cargarHorariosDeLaSemana() {
  try {
    console.log("📆 Cargando horarios semanales...");

    //await Horario.deleteMany({}); // Limpia los anteriores

    const fechas = obtenerFechasSemanaActualOProxima();
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

    await Horario.deleteMany({
     fecha: { $in: obtenerFechasSemanaActualOProxima() }
    });
    await Horario.insertMany(nuevos);
    console.log("✅ Horarios semanales cargados correctamente.");
  } catch (err) {
    console.error("❌ Error al cargar horarios:", err);
  }
}*/


/*
async function cargarHorariosDeLaSemana() {
  try {
    console.log("📆 Cargando horarios semanales...");

    // Limpia los horarios de la semana actual
    await Horario.deleteMany({
      fecha: { $in: obtenerFechasSemanaActualOProxima() }
    });

    const fechas = obtenerFechasSemanaActualOProxima();
    const nuevos = [];

    for (const fecha of fechas) {
  const esSabado = fecha.getDay() === 6; // 6 = sábado
  const listaHoras = esSabado ? horasSabado : horas;

  laboratorios.forEach(lab => {
    listaHoras.forEach(hora => {
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
    console.log("✅ Horarios semanales cargados correctamente.");
  } catch (err) {
    console.error("❌ Error al cargar horarios:", err);
  }
}
*/


// Conserva reservas: borra SOLO "Disponibles" y repone con upsert
async function cargarHorariosDeLaSemana() {
  try {
    console.log("📆 Cargando horarios semanales (conservando reservas)...");
    const fechas = obtenerFechasSemanaActualOProxima(); // lunes→sábado
    // 1) Borra solo los horarios Disponibles de las fechas objetivo
    await Horario.deleteMany({
      fecha: { $in: fechas },
      estado: 'Disponible'
    });

    // 2) Reponer con upsert (solo crea si no existe)
    const ops = [];
    for (const fecha of fechas) {
      const esSabado = fecha.getDay() === 6; // 6 = sábado
      const listaHoras = esSabado ? horasSabado : horas;
      for (const lab of laboratorios) {
        for (const hora of listaHoras) {
          ops.push({
            updateOne: {
              filter: { laboratorio: lab, fecha, hora },
              update: {
                $setOnInsert: {
                  laboratorio: lab,
                  fecha,
                  hora,
                  estado: 'Disponible',
                  reservadoPor: null
                }
              },
              upsert: true
            }
          });
        }
      }
    }

    if (ops.length) {
      const res = await Horario.bulkWrite(ops, { ordered: false });
      console.log(`✅ Horarios listos. upserts: ${res.upsertedCount || 0}`);
    } else {
      console.log("ℹ️ No hay operaciones para ejecutar.");
    }
  } catch (err) {
    console.error("❌ Error al cargar horarios:", err);
  }
}






// Ejecutar una vez al iniciar el servidor
cargarHorariosDeLaSemana();

// Ejecutar cada domingo a las 00:00
cron.schedule('0 0 * * 0', cargarHorariosDeLaSemana);

//Cargar los dias cuando el usario cumpla la fecha estipulada por RR.HH
const User = require('./models/User');

function actualizarDiasSiCorresponde(usuario) {
  const hoy = new Date();
  if (!usuario.fechaIngreso) return usuario;

  const ingreso = new Date(usuario.fechaIngreso);
  const ultima = usuario.ultimaActualizacionDias ? new Date(usuario.ultimaActualizacionDias) : null;

  const añoActual = hoy.getFullYear();
  const aniversario = new Date(ingreso);
  aniversario.setFullYear(añoActual);

  if (hoy < aniversario) return usuario;
  if (ultima && ultima.getFullYear() === añoActual) return usuario;

  usuario.diasVacacionesDisponibles = (usuario.diasVacacionesDisponibles || 0) + 10;
  usuario.ultimaActualizacionDias = hoy;

  return usuario;
}

async function actualizarDiasVacacionesAutomatica() {
  try {
    console.log("🔁 Ejecutando revisión automática de días de vacaciones...");
    let usuarios = await User.find({});

    usuarios = usuarios.map(actualizarDiasSiCorresponde);
    await Promise.all(usuarios.map(u => u.save()));

    console.log("✅ Días de vacaciones actualizados automáticamente.");
  } catch (err) {
    console.error("❌ Error en actualización automática de vacaciones:", err);
  }
}

// Ejecutar todos los días a las 00:10 a.m.
cron.schedule('10 0 * * *', actualizarDiasVacacionesAutomatica);


// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const notificationsRoutes = require('./routes/notifications');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();

// ===== Middlewares =====
app.use(cors());
app.use(express.json());

// ===== Rutas API =====
app.use('/api/auth', require('./routes/auth.js'));
app.use('/api/horarios', require('./routes/horarios'));
app.use('/api/fallas', require('./routes/fallas'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/users', require('./routes/users'));
app.use('/api/vacaciones', require('./routes/vacacionesroutes.js'));
app.use('/api/tiempo', require('./routes/tiempoRoutes'));
app.use('/api/calificaciones', require('./routes/calificaciones'));
app.use('/api/notifications', notificationsRoutes);
app.use('/api/almacen', require('./routes/almacen'));



// ===== Frontend estático =====
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR));

// ✅ ALIAS para que /almacen/* funcione aunque la carpeta sea /Almacen
app.use("/almacen", express.static(path.join(FRONTEND_DIR, "Almacen")));

// ===== Upload de archivos =====
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===== Ruta raíz =====
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "login.html"));
});

// ===== Modelos y utilidades de negocio =====
const Horario = require('./models/Horario');
const User = require('./models/User');

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

function obtenerFechasSemanaActualOProxima() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const diaHoy = hoy.getDay(); // 0=Dom, 1=Lun...
  const lunes = new Date(hoy);
  const diferencia = diaHoy === 0 ? -6 : 1 - diaHoy; // Si es domingo, ir al lunes anterior
  lunes.setDate(hoy.getDate() + diferencia);
  lunes.setHours(0, 0, 0, 0);

  const fechas = [];
  for (let i = 0; i < 6; i++) { // Lunes a Sábado
    const f = new Date(lunes);
    f.setDate(lunes.getDate() + i);
    fechas.push(f);
  }
  return fechas;
}

// Conserva reservas: borra SOLO "Disponibles" de la semana objetivo y repone con upsert
async function cargarHorariosDeLaSemana() {
  try {
    console.log("📆 Cargando horarios semanales (conservando reservas)...");
    const fechas = obtenerFechasSemanaActualOProxima();

    // 1) Borrar solo disponibles
    await Horario.deleteMany({
      fecha: { $in: fechas },
      estado: 'Disponible'
    });

    // 2) Upserts para reponer
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

// Vacaciones: sumar días en aniversario si corresponde
function actualizarDiasSiCorresponde(usuario) {
  const hoy = new Date();
  if (!usuario.fechaIngreso) return usuario;

  const ingreso = new Date(usuario.fechaIngreso);
  const ultima = usuario.ultimaActualizacionDias ? new Date(usuario.ultimaActualizacionDias) : null;

  const añoActual = hoy.getFullYear();
  const aniversario = new Date(ingreso);
  aniversario.setFullYear(añoActual);

  if (hoy < aniversario) return usuario; // Aún no llega el aniversario este año
  if (ultima && ultima.getFullYear() === añoActual) return usuario; // Ya se actualizó este año

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

// ===== Conexión a Mongo y arranque =====
/*const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('🟢 Conectado a MongoDB');

    app.listen(PORT, () => {
      console.log(`🚀 Servidor en http://localhost:${PORT}`);
    });

    // Ejecutar una vez al iniciar
    cargarHorariosDeLaSemana();
    actualizarDiasVacacionesAutomatica();

    // Schedules
    cron.schedule('0 0 * * 0', cargarHorariosDeLaSemana);     // Cada domingo 00:00
    cron.schedule('10 0 * * *', actualizarDiasVacacionesAutomatica); // Diario 00:10
  })
  .catch(err => {
    console.error('🔴 Error en MongoDB:', err);
    process.exit(1);
  });*/


// ===== Conexión a Mongo y arranque =====
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('🟢 Conectado a MongoDB');

    // 🔌 Crear servidor HTTP manualmente (usando los require de arriba)
    const server = http.createServer(app);

    // 🔔 Iniciar Socket.IO en el mismo servidor
    const io = new Server(server, {
      cors: {
        origin: "*",   // Para Render / local
      },
    });

    // 🔥 Hacer io accesible desde todas las rutas (req.app.get('io'))
    app.set('io', io);

    // 🟡 Manejo de conexiones Socket.IO
    io.on('connection', (socket) => {
      console.log('🔌 Cliente WebSocket conectado');

      socket.on('registrarUsuario', (userId) => {
        if (!userId) return;
        const room = `user:${userId}`;
        socket.join(room);
        console.log(`👤 Usuario unido a sala ${room}`);
      });

      socket.on('disconnect', () => {
        console.log('❌ Cliente WebSocket desconectado');
      });
    });

    // 🚀 Levantar servidor HTTP + Socket.IO
    server.listen(PORT, () => {
      console.log(`🚀 Servidor con WebSockets en http://localhost:${PORT}`);
    });

    // 📅 Ejecutar funciones automáticas
    cargarHorariosDeLaSemana();
    actualizarDiasVacacionesAutomatica();

    // ⏱️ Schedulers
    cron.schedule('0 0 * * 0', cargarHorariosDeLaSemana);          // Cada domingo
    cron.schedule('10 0 * * *', actualizarDiasVacacionesAutomatica); // Diario 00:10
  })
  .catch((err) => {
    console.error('🔴 Error en MongoDB:', err);
    process.exit(1);
  });


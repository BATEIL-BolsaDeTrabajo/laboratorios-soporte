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
app.use('/api/seguimiento-academico', require('./routes/academicTracking'));
app.use('/api/notifications', notificationsRoutes);
app.use('/api/almacen', require('./routes/almacen'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/cycles', require('./routes/cycles'));
app.use('/api/student-payment-tracking', require('./routes/studentPaymentTracking'));
app.use('/api/student-payment-tracking', require('./routes/studentPaymentTrackingImport'));
app.use('/api/student-payment-tracking', require('./routes/studentPaymentTrackingExport'));



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

const { ZONA_HORARIA, obtenerVentana, sumarDias } = require('./utils/ventanaReservas');

function obtenerFechasSemanaActualOProxima() {
  const { lunes } = obtenerVentana();
  return Array.from({ length: 6 }, (_, i) => new Date(sumarDias(lunes, i) + 'T00:00:00'));
}

// Conserva horarios existentes y agrega los faltantes con upsert
async function cargarHorariosDeLaSemana() {
  try {
    console.log("📆 Cargando horarios semanales (conservando reservas)...");
    const fechas = obtenerFechasSemanaActualOProxima();

    // Crear solo los horarios faltantes y conservar los existentes.
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

// Vacaciones: acumular ambos saldos al cumplir cada aniversario.
const { actualizarDiasSiCorresponde } = require('./utils/saldoVacaciones');

async function actualizarDiasVacacionesAutomatica() {
  try {
    console.log("🔁 Ejecutando revisión automática de días de vacaciones...");
    let usuarios = await User.find({});
    usuarios = usuarios.map(u => actualizarDiasSiCorresponde(u));
    await Promise.all(usuarios.filter(u => u.isModified()).map(u => u.save()));
    console.log("✅ Días de vacaciones actualizados automáticamente.");
  } catch (err) {
    console.error("❌ Error en actualización automática de vacaciones:", err);
  }
}

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

    // En pruebas se puede conservar la copia sin cambios automáticos al arrancar.
    if (process.env.ENABLE_SCHEDULED_TASKS !== 'false') {
      cargarHorariosDeLaSemana();
      actualizarDiasVacacionesAutomatica();
      cron.schedule('0 17 * * 0', cargarHorariosDeLaSemana, { timezone: ZONA_HORARIA });
      cron.schedule('10 0 * * *', actualizarDiasVacacionesAutomatica);
    }
  })
  .catch((err) => {
    console.error('🔴 Error en MongoDB:', err);
    process.exit(1);
  });

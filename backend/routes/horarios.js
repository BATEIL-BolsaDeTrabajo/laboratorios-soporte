const express = require('express');
const router = express.Router();
const Horario = require('../models/Horario');
const { verifyToken, verifyRole } = require('../middlewares/auth');

// Obtener horarios por laboratorio y fecha (docentes)
// Obtener horarios por laboratorio y fecha
// Obtener horarios por laboratorio y fecha
router.get('/', verifyToken, async (req, res) => {
  console.log("📥 Consulta recibida:", req.query.fecha, req.query.laboratorio);

  try {
    const { laboratorio, fecha } = req.query;

    const fechaBase = new Date(`${fecha}T00:00:00`);
    const fechaSiguiente = new Date(`${fecha}T23:59:59`);


    console.log("🔍 Rango buscado:", fechaBase.toISOString(), "→", fechaSiguiente.toISOString());

    const horarios = await Horario.find({
      laboratorio,
      fecha: {
        $gte: fechaBase,
        $lt: fechaSiguiente
      }
    }).populate('reservadoPor', 'nombre');

    res.json(horarios);
  } catch (err) {
    console.error("❌ Error al obtener horarios:", err);
    res.status(500).json({ mensaje: 'Error al obtener horarios' });
  }
});


// Reservar un horario (docente)
router.post('/reservar', verifyToken, async (req, res) => {
  try {
    const { horarioId } = req.body;

    const horario = await Horario.findById(horarioId);
    if (!horario) return res.status(404).json({ mensaje: 'Horario no encontrado' });

    if (horario.estado === "Reservado") {
      return res.status(400).json({ mensaje: 'Este horario ya fue reservado' });
    }

    horario.estado = "Reservado";
    horario.reservadoPor = req.usuario.id;

    await horario.save();
    res.json({ mensaje: 'Horario reservado con éxito' });
  } catch (err) {
    console.error("❌ Error al reservar horario:", err);
    res.status(500).json({ mensaje: 'Error al reservar horario' });
  }
});

// Crear nuevo horario manualmente (admin)
router.post('/', verifyToken, verifyRole(['admin']), async (req, res) => {
  try {
    const { laboratorio, fecha, hora } = req.body;

    const nuevo = new Horario({ laboratorio, fecha, hora, estado: "Disponible" });
    await nuevo.save();

    res.status(201).json({ mensaje: 'Horario agregado' });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al crear horario' });
  }
});

// Eliminar todos los horarios (solo admin)
router.delete('/', verifyToken, verifyRole(['admin']), async (req, res) => {
  try {
    await Horario.deleteMany({});
    res.json({ mensaje: 'Todos los horarios fueron eliminados' });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al eliminar horarios' });
  }
});

// Obtener las reservas del docente actual
router.get('/mis-reservas', verifyToken, async (req, res) => {
  try {
    const reservas = await Horario.find({
      reservadoPor: req.usuario.id
    }).sort({ fecha: -1 }).select('laboratorio fecha hora estado');

    res.json(reservas);
  } catch (err) {
    console.error("❌ Error al obtener reservas del docente:", err);
    res.status(500).json({ mensaje: 'Error al obtener reservas' });
  }
});


// Cancelar una reserva (solo si es del mismo docente)
router.post('/cancelar', verifyToken, async (req, res) => {
  try {
    const { horarioId } = req.body;

    const horario = await Horario.findById(horarioId);

    if (!horario) return res.status(404).json({ mensaje: 'Horario no encontrado' });
    if (horario.estado !== 'Reservado' || horario.reservadoPor?.toString() !== req.usuario.id) {
      return res.status(403).json({ mensaje: 'No autorizado para cancelar esta reserva' });
    }

    horario.estado = 'Disponible';
    horario.reservadoPor = null;
    await horario.save();

    res.json({ mensaje: 'Reserva cancelada correctamente' });
  } catch (err) {
    console.error("❌ Error al cancelar reserva:", err);
    res.status(500).json({ mensaje: 'Error al cancelar reserva' });
  }
});



// GET /api/horarios/coordinacion?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&soloReservadas=true|false
router.get('/coordinacion', verifyToken, async (req, res) => {
  try {
    const laboratoriosCoord = [
      'Laboratorio A',
      'Laboratorio B',
      'Laboratorio C',
      'Laboratorio D',
      'Laboratorio de Química',
      'Audiovisual'
    ];

    // Query params
    let { desde, hasta, soloReservadas } = req.query;
    const filtrarReservadas = soloReservadas !== 'false'; // por defecto, solo reservas confirmadas

    // Rango robusto (00:00 a 23:59)
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const ini = desde ? new Date(desde) : new Date(hoy);  ini.setHours(0,0,0,0);
    const fin = hasta ? new Date(hasta) : new Date(hoy);  fin.setHours(23,59,59,999);

    const query = {
      laboratorio: { $in: laboratoriosCoord },
      fecha: { $gte: ini, $lte: fin },
      ...(filtrarReservadas ? { estado: 'Reservado' } : {})
    };

    const reservas = await Horario.find(query)
      .sort({ fecha: 1, hora: 1, laboratorio: 1 })
      .populate('reservadoPor', 'nombre correo');

    res.json(reservas.map(r => ({
      id: r._id,
      laboratorio: r.laboratorio,
      fecha: r.fecha,
      hora: r.hora,
      estado: r.estado,
      reservadoPor: r.reservadoPor ? {
        id: r.reservadoPor._id,
        nombre: r.reservadoPor.nombre,
        correo: r.reservadoPor.correo
      } : null
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error obteniendo reservas' });
  }
});






module.exports = router;

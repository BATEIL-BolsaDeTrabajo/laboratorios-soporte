const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');
const { verifyToken, verifyRole } = require('../middlewares/auth');

const { actualizarDiasSiCorresponde, establecerDiasActivos } = require('../utils/saldoVacaciones');

// 🔍 Obtener todos los usuarios (admin y rrhh)
router.get('/', verifyToken, verifyRole(['admin', 'rrhh', 'finanzas']), async (req, res) => {
  try {
    let usuarios;

    if (req.usuario.roles.includes('admin')) {
      usuarios = await User.find({}, '-contraseña');
    } else {
      // RRHH solo ve campos específicos
      usuarios = await User.find({}, 'nombre correo telefonoWhatsapp roles _id fechaIngreso diasVacacionesDisponibles diasVacacionesPrestacion diasVacacionesAnuales diasVacacionesPrestacionAnuales diasVacacionesAcumulados puesto departamento ultimaActualizacionDias');
    }

    usuarios.forEach(u => actualizarDiasSiCorresponde(u));
    await Promise.all(usuarios.filter(u => u.isModified()).map(u => u.save()));
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener usuarios' });
  }
});

// 📝 Modificar usuario
router.put('/:id', verifyToken, verifyRole(['admin', 'rrhh']), async (req, res) => {
  const { nombre, roles, nuevaContraseña, fechaIngreso, diasVacacionesDisponibles, diasVacacionesPrestacion, diasVacacionesAnuales, diasVacacionesPrestacionAnuales, puesto, departamento, telefonoWhatsapp, correo } = req.body;

  try {
    const usuario = await User.findById(req.params.id);
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    const diasActivos = req.body.diasVacacionesActivosActuales;
    if (typeof diasActivos !== 'undefined' && !Number.isSafeInteger(diasActivos)) {
      return res.status(400).json({ mensaje: 'Los días activos deben ser un número entero.' });
    }

    // ADMIN puede cambiar roles o contraseña
    if (Array.isArray(roles) && req.usuario.roles.includes('admin')) {
      usuario.roles = roles;
    }

    if (Array.isArray(req.body.menuPermissions) && req.usuario.roles.includes('admin')) {
      usuario.menuPermissions = req.body.menuPermissions;
    }

    if (nuevaContraseña && req.usuario.roles.includes('admin')) {
      usuario.contraseña = await bcrypt.hash(nuevaContraseña, 10);
    }

    if (typeof correo !== 'undefined' && (req.usuario.roles.includes('admin') || req.usuario.roles.includes('rrhh'))) {
      const correoLimpio = String(correo || '').trim().toLowerCase();

      if (!correoLimpio) {
        return res.status(400).json({ mensaje: 'El correo no puede quedar vacio' });
      }

      const correoDuplicado = await User.findOne({
        _id: { $ne: usuario._id },
        correo: correoLimpio
      });

      if (correoDuplicado) {
        return res.status(409).json({ mensaje: 'Ese correo ya esta registrado en otro usuario' });
      }

      usuario.correo = correoLimpio;
    }

    if (typeof telefonoWhatsapp !== 'undefined' && (req.usuario.roles.includes('admin') || req.usuario.roles.includes('rrhh'))) {
      usuario.telefonoWhatsapp = String(telefonoWhatsapp || '').replace(/[^\d]/g, '');
    }

    // Admin y RRHH pueden corregir el nombre del usuario.
    if (typeof nombre !== 'undefined' && (req.usuario.roles.includes('admin') || req.usuario.roles.includes('rrhh'))) {
      const nombreLimpio = String(nombre || '').trim();
      if (!nombreLimpio) {
        return res.status(400).json({ mensaje: 'El nombre no puede quedar vacio' });
      }
      usuario.nombre = nombreLimpio;
    }

    // RRHH puede actualizar fecha de ingreso y dias disponibles.
    if (req.usuario.roles.includes('rrhh')) {
      if (fechaIngreso) usuario.fechaIngreso = new Date(`${fechaIngreso}T12:00:00`);
      if (typeof diasVacacionesDisponibles === 'number') {
        usuario.diasVacacionesDisponibles = diasVacacionesDisponibles;
      }
      if (typeof diasVacacionesPrestacion === 'number') {
        usuario.diasVacacionesPrestacion = diasVacacionesPrestacion;
      }
      if (typeof diasVacacionesAnuales === 'number') {
        usuario.diasVacacionesAnuales = diasVacacionesAnuales;
      }
      if (typeof diasVacacionesPrestacionAnuales === 'number') {
        usuario.diasVacacionesPrestacionAnuales = diasVacacionesPrestacionAnuales;
      }
      if (typeof diasActivos !== 'undefined') {
        establecerDiasActivos(usuario, diasActivos);
        usuario.ultimaActualizacionDias = new Date();
      }
  if (puesto) usuario.puesto = puesto;
  if (departamento) usuario.departamento = departamento;
    }

    await usuario.save();
    res.json({ mensaje: 'Usuario actualizado correctamente', saldosVacaciones: {
      diasVacacionesDisponibles: usuario.diasVacacionesDisponibles,
      diasVacacionesPrestacion: usuario.diasVacacionesPrestacion
    } });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al actualizar usuario' });
  }
});

// 🔍 Subdirección: obtener solo docentes
router.get('/docentes', verifyToken, verifyRole(['subdireccion']), async (req, res) => {
  try {
    const docentes = await User.find({ roles: 'docente' }, 'nombre roles _id');
    res.json(docentes);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener docentes' });
  }
});

// Personas que pueden seleccionarse como solicitantes al registrar un autoticket.
router.get('/autoticket-solicitantes', verifyToken, verifyRole(['soporte', 'mantenimiento']), async (req, res) => {
  try {
    const usuarios = await User.find(
      { roles: { $ne: 'admin' } },
      'nombre correo roles'
    ).sort({ nombre: 1 }).lean();
    res.json({ ok: true, usuarios });
  } catch (err) {
    console.error('GET /users/autoticket-solicitantes error:', err);
    res.status(500).json({ ok: false, mensaje: 'No se pudieron obtener los solicitantes.' });
  }
});

// 🔍 Finanzas: obtener solo talleres
router.get('/talleres', verifyToken, verifyRole(['finanzas']), async (req, res) => {
  try {
    const talleres = await User.find({ roles: 'talleres' }, 'nombre roles _id');
    res.json(talleres);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener usuarios de talleres' });
  }
});



// Crear usuario (solo admin y rrhh)
router.post('/crear', verifyToken, verifyRole(['admin', 'rrhh']), async (req, res) => {
  try {
    const { nombre, correo, contraseña, rol, fechaIngreso, diasVacacionesDisponibles, puesto, departamento, telefonoWhatsapp } = req.body;

    // Verifica si el usuario ya existe
    const existe = await User.findOne({ correo });
    if (existe) {
      return res.status(400).json({ mensaje: 'El usuario ya existe con ese correo.' });
    }

    const hashedPassword = await bcrypt.hash(contraseña, 10);

    const nuevo = new User({
      nombre,
      correo,
      contraseña: hashedPassword,
      roles: [rol],
      telefonoWhatsapp: String(telefonoWhatsapp || '').replace(/[^\d]/g, ''),
      fechaIngreso,
      diasVacacionesDisponibles,
      puesto,
      departamento
    });

    await nuevo.save();
    res.status(201).json({ mensaje: 'Usuario creado correctamente.' });
  } catch (error) {
    console.error("❌ Error al crear usuario:", error);
    res.status(500).json({ mensaje: 'Error al crear el usuario.' });
  }
});

// 🔐 Obtener datos del usuario autenticado
router.get('/me', verifyToken, async (req, res) => {
  try {
    const usuario = await User.findById(req.usuario.id).select('-contraseña');
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    actualizarDiasSiCorresponde(usuario);
    if (usuario.isModified()) await usuario.save();
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener el usuario autenticado' });
  }
});

module.exports = router;

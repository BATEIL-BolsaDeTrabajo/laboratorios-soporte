const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');
const { verifyToken, verifyRole } = require('../middlewares/auth');

const DIAS_VACACIONES_ANUALES = 22;

// 👇 FUNCIONES AUXILIARES
function actualizarDiasSiCorresponde(usuario) {
  const hoy = new Date();
  if (!usuario.fechaIngreso) return usuario;

  const ingreso = new Date(usuario.fechaIngreso);
  const ultima = usuario.ultimaActualizacionDias ? new Date(usuario.ultimaActualizacionDias) : null;

  const añoActual = hoy.getFullYear();
  const aniversarioEsteAño = new Date(ingreso);
  aniversarioEsteAño.setFullYear(añoActual);

  if (hoy < aniversarioEsteAño) return usuario;
  if (ultima && ultima.getFullYear() === añoActual) return usuario;

  const diasRestantes = Math.max(usuario.diasVacacionesDisponibles || 0, 0);
  usuario.diasVacacionesAcumulados = (usuario.diasVacacionesAcumulados || 0) + diasRestantes;
  usuario.diasVacacionesDisponibles = DIAS_VACACIONES_ANUALES;
  usuario.ultimaActualizacionDias = hoy;

  return usuario;
}

// 🔍 Obtener todos los usuarios (admin y rrhh)
router.get('/', verifyToken, verifyRole(['admin', 'rrhh', 'finanzas']), async (req, res) => {
  try {
    let usuarios;

    if (req.usuario.roles.includes('admin')) {
      usuarios = await User.find({}, '-contraseña');
    } else {
      // RRHH solo ve campos específicos
      usuarios = await User.find({}, 'nombre roles _id fechaIngreso diasVacacionesDisponibles diasVacacionesAcumulados ultimaActualizacionDias');
      usuarios = usuarios.map(u => actualizarDiasSiCorresponde(u));
      await Promise.all(usuarios.map(u => u.save()));
    }

    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener usuarios' });
  }
});

// 📝 Modificar usuario
router.put('/:id', verifyToken, verifyRole(['admin', 'rrhh']), async (req, res) => {
  const { roles, nuevaContraseña, fechaIngreso, diasVacacionesDisponibles, actualizarDiasManual, puesto, departamento, telefonoWhatsapp, correo } = req.body;

  try {
    const usuario = await User.findById(req.params.id);
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    // ADMIN puede cambiar roles o contraseña
    if (roles && req.usuario.roles.includes('admin')) {
      usuario.roles = roles;
    }

    if (nuevaContraseña && req.usuario.roles.includes('admin')) {
      usuario.contraseña = await bcrypt.hash(nuevaContraseña, 10);
    }

    if (typeof correo !== 'undefined' && req.usuario.roles.includes('admin')) {
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

    if (typeof telefonoWhatsapp !== 'undefined' && req.usuario.roles.includes('admin')) {
      usuario.telefonoWhatsapp = String(telefonoWhatsapp || '').replace(/[^\d]/g, '');
    }

    // RRHH puede actualizar fecha de ingreso y días disponibles
    if (req.usuario.roles.includes('rrhh')) {
      if (fechaIngreso) usuario.fechaIngreso = new Date(`${fechaIngreso}T12:00:00`);
      if (typeof diasVacacionesDisponibles === 'number') {
        usuario.diasVacacionesDisponibles = diasVacacionesDisponibles;
      }
      if (actualizarDiasManual) {
        usuario.ultimaActualizacionDias = new Date();
      }
  if (puesto) usuario.puesto = puesto;
  if (departamento) usuario.departamento = departamento;
    }

    await usuario.save();
    res.json({ mensaje: 'Usuario actualizado correctamente' });
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
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener el usuario autenticado' });
  }
});

module.exports = router;

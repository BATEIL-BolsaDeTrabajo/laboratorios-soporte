const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/User');

// Registro
router.post('/register', async (req, res) => {
  const { nombre, correo, contraseña, roles } = req.body;
  try {
    const usuarioExistente = await User.findOne({ correo });
    if (usuarioExistente) return res.status(400).json({ mensaje: 'El correo ya está registrado' });

    const contraseñaHasheada = await bcrypt.hash(contraseña, 10);
    const nuevoUsuario = new User({
      nombre,
      correo,
      contraseña: contraseñaHasheada,
      roles
    });

    await nuevoUsuario.save();

    res.status(201).json({ mensaje: 'Usuario registrado correctamente' });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al registrar usuario' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { correo, contraseña } = req.body;
  try {
    const usuario = await User.findOne({ correo });
    if (!usuario) return res.status(400).json({ mensaje: 'Correo incorrecto' });

    const valido = await bcrypt.compare(contraseña, usuario.contraseña);
    if (!valido) return res.status(400).json({ mensaje: 'Contraseña incorrecta' });

    const token = jwt.sign(
      {
        id: usuario._id,
        nombre: usuario.nombre,
        roles: usuario.roles,
        email: usuario.correo, // ✅ agregado
      },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );


    res.json({ token });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al iniciar sesión' });
  }
});

module.exports = router;
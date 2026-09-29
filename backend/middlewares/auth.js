const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ mensaje: 'Token no proporcionado' });

  try {
    const decoded = jwt.verify(token.split(' ')[1], process.env.JWT_SECRET);
    req.usuario = decoded; // incluye .id, .nombre, .roles
    next();
  } catch (err) {
    res.status(401).json({ mensaje: 'Token inválido' });
  }
}

function verifyRole(rolesPermitidos) {
  return (req, res, next) => {
    const rolesUsuario = req.usuario.roles || [];

    const tieneAcceso = rolesUsuario.some(rol => rolesPermitidos.includes(rol));
    if (!tieneAcceso) {
      return res.status(403).json({ mensaje: 'Acceso denegado' });
    }

    next();
  };
}

// Para operaciones que deben reconocer cambios de rol sin volver a iniciar sesión.
function verifyCurrentRole(rolesPermitidos) {
  return async (req, res, next) => {
    try {
      const User = require('../models/User');
      const usuario = await User.findById(req.usuario.id).select('roles');
      if (!usuario) return res.status(401).json({ mensaje: 'Usuario no encontrado' });
      req.usuario.roles = usuario.roles || [];
    } catch (err) {
      return res.status(500).json({ mensaje: 'No se pudieron verificar los permisos actuales' });
    }
    return verifyRole(rolesPermitidos)(req, res, next);
  };
}

module.exports = { verifyToken, verifyRole, verifyCurrentRole };

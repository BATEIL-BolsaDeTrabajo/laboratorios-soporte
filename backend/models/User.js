const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  correo: { type: String, required: true, unique: true },
  contraseña: { type: String, required: true },
  roles: {
    type: [String],
    enum: ['docente', 'admin', 'soporte', 'mantenimiento', 'direccion', 'subdireccion', 'rrhh', 'finanzas', 'talleres'],
    default: ['docente']
  },
  diasVacacionesDisponibles: {
    type: Number,
    default: 0
  },
  fechaIngreso: {
    type: Date
  },
  ultimaActualizacionDias: {
    type: Date
  },
  puesto: {
    type: String
  },
  departamento: {
    type: String
  }
});

module.exports = mongoose.model('User', userSchema);


module.exports = mongoose.model('User', userSchema);
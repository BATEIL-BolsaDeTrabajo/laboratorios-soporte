const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  correo: { type: String, required: true, unique: true },
  telefonoWhatsapp: { type: String, default: '' },
  contraseña: { type: String, required: true },
  roles: {
    type: [String],
    enum: ['docente', 'admin', 'soporte', 'mantenimiento', 'direccion', 'subdireccion', 'rrhh', 'finanzas', 'talleres','coordinacionD','almacen','coordinador','caja'],
    default: ['docente']
  },
  menuPermissions: {
    type: [String],
    default: undefined
  },
  diasVacacionesDisponibles: {
    type: Number,
    default: 0
  },
  diasVacacionesPrestacion: {
    type: Number,
    default: 0
  },
  diasVacacionesAnuales: {
    type: Number,
    default: 22
  },
  diasVacacionesPrestacionAnuales: {
    type: Number,
    default: 0
  },
  // Campo legado: conservar hasta comprobar que todos los saldos se consolidaron.
  // La actualización de vacaciones lo integra al saldo de aniversario y lo deja en cero.
  diasVacacionesAcumulados: {
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

function numero(valor, respaldo = 0) {
  const resultado = Number(valor ?? respaldo);
  return Number.isFinite(resultado) ? resultado : respaldo;
}

function obtenerDiasActivos(usuario) {
  return numero(usuario.diasVacacionesDisponibles)
    + numero(usuario.diasVacacionesAcumulados)
    + numero(usuario.diasVacacionesPrestacion);
}

function fechaLaboral(valor) {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(fecha);
  const obtener = tipo => Number(partes.find(parte => parte.type === tipo).value);
  return Date.UTC(obtener('year'), obtener('month') - 1, obtener('day'));
}

function actualizarDiasSiCorresponde(usuario, ahora = new Date()) {
  usuario.diasVacacionesDisponibles = numero(usuario.diasVacacionesDisponibles)
    + numero(usuario.diasVacacionesAcumulados);
  usuario.diasVacacionesAcumulados = 0;
  if (!usuario.fechaIngreso) return usuario;

  // La fecha de ingreso es una fecha de calendario guardada también desde inputs date.
  const ingreso = new Date(usuario.fechaIngreso);
  if (Number.isNaN(ingreso.getTime())) return usuario;
  const hoy = fechaLaboral(ahora);
  const añoActual = new Date(hoy).getUTCFullYear();
  const aniversario = año => Date.UTC(año, ingreso.getUTCMonth(), ingreso.getUTCDate());
  const ultimoAño = hoy >= aniversario(añoActual) ? añoActual : añoActual - 1;
  if (ultimoAño <= ingreso.getUTCFullYear()) return usuario;

  const ultima = usuario.ultimaActualizacionDias ? fechaLaboral(usuario.ultimaActualizacionDias) : null;
  // Sin historial, abonar solo el último aniversario: no reconstruir saldos históricos.
  const primerAño = ultima === null ? ultimoAño
    : Math.max(ingreso.getUTCFullYear() + 1, new Date(ultima).getUTCFullYear());
  let abonos = 0;
  for (let año = primerAño; año <= ultimoAño; año += 1) {
    if (ultima === null || aniversario(año) > ultima) abonos += 1;
  }
  if (abonos) {
    usuario.diasVacacionesDisponibles += abonos * numero(usuario.diasVacacionesAnuales, 22);
    usuario.diasVacacionesPrestacion = numero(usuario.diasVacacionesPrestacion)
      + abonos * numero(usuario.diasVacacionesPrestacionAnuales);
    usuario.ultimaActualizacionDias = ahora;
  }
  return usuario;
}

function calcularConsumoVacaciones(diasSolicitados, usuario) {
  const saldoTotalAntes = obtenerDiasActivos(usuario);
  const prestacion = numero(usuario.diasVacacionesPrestacion);
  const consumoPrestacion = Math.min(diasSolicitados, Math.max(prestacion, 0));
  return {
    saldoTotalAntes,
    saldoTotalRestante: saldoTotalAntes - diasSolicitados,
    diasPorPagar: Math.max(diasSolicitados - saldoTotalAntes, 0),
    diasPrestacionRestantes: prestacion - consumoPrestacion,
    diasAniversarioRestantes: numero(usuario.diasVacacionesDisponibles)
      + numero(usuario.diasVacacionesAcumulados) - (diasSolicitados - consumoPrestacion)
  };
}

function establecerDiasActivos(usuario, total) {
  if (!Number.isSafeInteger(total)) throw new TypeError('Los días activos deben ser un número entero.');
  // Conservar la prestación pendiente hasta el total indicado; el resto es aniversario.
  usuario.diasVacacionesPrestacion = Math.min(Math.max(numero(usuario.diasVacacionesPrestacion), 0), Math.max(total, 0));
  usuario.diasVacacionesDisponibles = total - usuario.diasVacacionesPrestacion;
  usuario.diasVacacionesAcumulados = 0;
}

module.exports = { obtenerDiasActivos, actualizarDiasSiCorresponde, calcularConsumoVacaciones, establecerDiasActivos };

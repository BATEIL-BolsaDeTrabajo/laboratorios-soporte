const ZONA_HORARIA = 'America/Mexico_City';

function sumarDias(fecha, dias) {
  const valor = new Date(`${fecha}T12:00:00Z`);
  valor.setUTCDate(valor.getUTCDate() + dias);
  return valor.toISOString().slice(0, 10);
}

function obtenerVentana(ahora = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(ahora).map(p => [p.type, p.value]));
  const hoy = `${partes.year}-${partes.month}-${partes.day}`;
  const dia = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  const lunes = sumarDias(hoy, dia === 0 ? (Number(partes.hour) >= 17 ? 1 : -6) : 1 - dia);
  const hasta = sumarDias(lunes, 5);
  return { hoy, lunes, desde: hoy > lunes ? hoy : lunes, hasta,
    habilitada: hoy <= hasta, zonaHoraria: ZONA_HORARIA };
}

function validarFecha(fecha, ahora = new Date()) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      !Number.isFinite(Date.parse(`${fecha}T12:00:00Z`)) ||
      new Date(`${fecha}T12:00:00Z`).toISOString().slice(0, 10) !== fecha) {
    return 'Selecciona una fecha válida.';
  }
  if (new Date(`${fecha}T12:00:00Z`).getUTCDay() === 0) {
    return 'Solo se puede reservar de lunes a sábado. Los domingos no hay servicio.';
  }
  const ventana = obtenerVentana(ahora);
  if (fecha < ventana.hoy) return 'No se pueden reservar fechas pasadas.';
  if (fecha < ventana.lunes || fecha > ventana.hasta) {
    return 'Las reservas de la siguiente semana se habilitan el domingo a las 5:00 p. m. (hora de Ciudad de México).';
  }
  return null;
}

// Los horarios existentes se guardan como medianoche local del servidor.
function fechaDeHorario(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

module.exports = { ZONA_HORARIA, sumarDias, obtenerVentana, validarFecha, fechaDeHorario };

const token = localStorage.getItem('token');
if (!token) window.location.href = 'login.html';

function elemento(tag, clase, texto) {
  const nodo = document.createElement(tag);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

function mostrarMensaje(texto, error = false) {
  const mensaje = document.getElementById('mensaje');
  mensaje.textContent = texto;
  mensaje.className = error ? 'error' : '';
  mensaje.hidden = !texto;
}

function diaReserva(reserva) {
  return reserva.fechaCalendario || reserva.fecha.slice(0, 10);
}

function fechaVisual(fecha) {
  // Una fecha académica es un día, no un instante UTC.
  return new Date(fecha.slice(0, 10) + 'T12:00:00');
}

function hoyAcademico(ahora = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(ahora).map(p => [p.type, p.value]));
  return partes.year + '-' + partes.month + '-' + partes.day;
}

function fechaLarga(fecha) {
  return fechaVisual(fecha).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Los horarios del sistema usan 1:00 a 5:00 para los turnos de la tarde.
function minutosInicio(hora) {
  const coincidencia = /^(\d{1,2}):(\d{2})/.exec(hora);
  if (!coincidencia) return 0;
  const horas = Number(coincidencia[1]);
  return (horas < 8 ? horas + 12 : horas) * 60 + Number(coincidencia[2]);
}

function generarTarjeta(reserva, activa) {
  const columna = elemento('div', 'col-md-6 col-lg-4');
  const card = elemento('article', `reserva-card${activa ? '' : ' pasada'}`);
  const top = elemento('div', 'reserva-top');
  const fecha = fechaVisual(diaReserva(reserva));
  const bloque = elemento('div', 'fecha-bloque');
  bloque.append(elemento('span', 'fecha-dia', fecha.getDate().toString().padStart(2, '0')),
    elemento('span', 'fecha-mes', fecha.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })));
  top.append(bloque, elemento('span', 'horario-status', activa ? 'Confirmada' : 'Pasada'));
  card.append(top, elemento('h3', '', reserva.laboratorio), elemento('p', 'reserva-fecha', fechaLarga(diaReserva(reserva))),
    elemento('p', 'reserva-hora', reserva.hora));
  const footer = elemento('div', 'reserva-footer');
  footer.append(elemento('small', '', activa ? 'Espacio reservado para ti' : 'Guardada en tu historial'));
  if (activa) {
    const boton = elemento('button', 'cancelar-reserva', 'Cancelar reserva');
    boton.type = 'button';
    boton.setAttribute('aria-label', `Cancelar reserva de ${reserva.laboratorio}, ${fechaLarga(diaReserva(reserva))}, ${reserva.hora}`);
    boton.addEventListener('click', () => cancelar(reserva, boton));
    footer.append(boton);
  }
  card.append(footer);
  columna.append(card);
  return columna;
}

function mostrarVacio(contenedor, titulo, detalle, reintentar = false) {
  const columna = elemento('div', 'col-12');
  const panel = elemento('div', 'empty-state');
  panel.append(elemento('h3', '', titulo), elemento('p', '', detalle));
  if (reintentar) {
    const boton = elemento('button', 'reintentar', 'Volver a intentar');
    boton.type = 'button';
    boton.addEventListener('click', cargarReservas);
    panel.append(boton);
  }
  columna.append(panel);
  contenedor.replaceChildren(columna);
}

async function cargarReservas() {
  const activasCont = document.getElementById('reservas-activas');
  const pasadasCont = document.getElementById('reservas-pasadas');
  for (const cont of [activasCont, pasadasCont]) {
    cont.setAttribute('aria-busy', 'true');
    mostrarVacio(cont, 'Consultando tus reservas…', 'Espera un momento.');
  }
  try {
    const res = await fetch('/api/horarios/mis-reservas', { headers: { Authorization: `Bearer ${token}` } });
    const reservas = await res.json();
    if (!res.ok || !Array.isArray(reservas)) throw new Error(reservas.mensaje || 'No se pudieron obtener tus reservas.');
    const hoy = hoyAcademico();
    const activas = reservas.filter(r => diaReserva(r) >= hoy).sort((a, b) => diaReserva(a).localeCompare(diaReserva(b)) || minutosInicio(a.hora) - minutosInicio(b.hora));
    const pasadas = reservas.filter(r => diaReserva(r) < hoy).sort((a, b) => diaReserva(b).localeCompare(diaReserva(a)));
    document.getElementById('total-activas').textContent = activas.length;
    document.getElementById('total-pasadas').textContent = pasadas.length;
    document.getElementById('proxima-espacio').textContent = activas[0]?.laboratorio || 'Tu agenda está libre';
    document.getElementById('proxima-fecha').textContent = activas.length ? fechaLarga(diaReserva(activas[0])) : 'Elige un espacio y prepara tu próxima clase.';
    document.getElementById('proxima-hora').textContent = activas[0]?.hora || 'Puedes reservar de lunes a sábado';
    activasCont.replaceChildren(...activas.map(r => generarTarjeta(r, true)));
    pasadasCont.replaceChildren(...pasadas.map(r => generarTarjeta(r, false)));
    if (!activas.length) mostrarVacio(activasCont, 'No tienes reservas activas', 'Usa “Reservar un espacio” para organizar tu próxima clase.');
    if (!pasadas.length) mostrarVacio(pasadasCont, 'Tu historial comienza con tu primera reserva', 'Aquí aparecerán tus reservas cuando su fecha haya pasado.');
    return true;
  } catch (error) {
    document.getElementById('total-activas').textContent = '—';
    document.getElementById('total-pasadas').textContent = '—';
    document.getElementById('proxima-espacio').textContent = 'Agenda no disponible';
    document.getElementById('proxima-fecha').textContent = 'Intenta cargar tus reservas nuevamente.';
    document.getElementById('proxima-hora').textContent = '';
    mostrarVacio(activasCont, 'No pudimos cargar tus reservas', error.message, true);
    mostrarVacio(pasadasCont, 'Historial no disponible', 'Volveremos a consultarlo cuando reintentes.');
    return false;
  } finally {
    activasCont.removeAttribute('aria-busy');
    pasadasCont.removeAttribute('aria-busy');
  }
}

async function cancelar(reserva, boton) {
  if (!confirm(`¿Cancelar tu reserva de ${reserva.laboratorio} del ${fechaLarga(diaReserva(reserva))}, ${reserva.hora}?`)) return;
  boton.disabled = true;
  boton.textContent = 'Cancelando…';
  try {
    const res = await fetch('/api/horarios/cancelar', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ horarioId: reserva._id })
    });
    const datos = await res.json();
    if (!res.ok) throw new Error(datos.mensaje || 'No se pudo cancelar la reserva.');
    mostrarMensaje('Reserva cancelada. El espacio vuelve a estar disponible.');
    await cargarReservas();
  } catch (error) {
    mostrarMensaje(error.message || 'No se pudo confirmar la cancelación. Vuelve a consultar tus reservas.', true);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Cancelar reserva';
  }
}

if (token) cargarReservas();

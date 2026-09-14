const token = localStorage.getItem('token');
if (!token) window.location.href = 'login.html';
const fechaInput = document.getElementById('fecha');
const contenedor = document.getElementById('horarios');
const buscar = document.getElementById('buscar-horarios');
let consulta = 0;

function mostrarMensaje(texto, error = false) {
  const mensaje = document.getElementById('mensaje-reserva');
  mensaje.textContent = texto;
  mensaje.className = error ? 'error' : '';
  mensaje.hidden = !texto;
}

function mostrarVacio(titulo, detalle) {
  contenedor.replaceChildren();
  const columna = document.createElement('div');
  columna.className = 'col-12';
  const panel = document.createElement('div');
  panel.className = 'empty-state';
  const heading = document.createElement('h3');
  heading.textContent = titulo;
  const texto = document.createElement('p');
  texto.textContent = detalle;
  panel.append(heading, texto);
  columna.append(panel);
  contenedor.append(columna);
}

async function cargarHorarios() {
  const id = ++consulta;
  if (!await actualizarVentana() || id !== consulta) return;
  if (!fechaInput.reportValidity()) return;
  const laboratorio = document.getElementById('laboratorio').value;
  const fecha = fechaInput.value;
  buscar.disabled = true;
  buscar.textContent = 'Consultando…';
  contenedor.setAttribute('aria-busy', 'true');
  mostrarVacio('Buscando horarios…', 'Estamos consultando la disponibilidad del espacio.');
  try {
    const res = await fetch(`/api/horarios?${new URLSearchParams({ laboratorio, fecha })}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const datos = await res.json();
    if (id !== consulta) return;
    if (!res.ok) throw new Error(datos.mensaje || 'No se pudieron consultar los horarios.');
    const disponibles = datos.filter(h => h.estado !== 'Reservado').length;
    const fechaTexto = new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    document.getElementById('resumen-horarios').textContent = `${laboratorio} · ${fechaTexto} · ${disponibles} disponibles`;
    contenedor.replaceChildren();
    if (!datos.length) mostrarVacio('Todavía no hay horarios para esta fecha', 'Intenta consultar nuevamente en unos momentos.');
    datos.forEach(horario => {
      const reservado = horario.estado === 'Reservado';
      const columna = document.createElement('div');
      columna.className = 'col-sm-6 col-lg-4';
      const card = document.createElement('article');
      card.className = `horario-card${reservado ? ' ocupado' : ''}`;
      const estado = document.createElement('span');
      estado.className = 'horario-status';
      estado.textContent = reservado ? 'Reservado' : 'Disponible';
      const hora = document.createElement('h3');
      hora.textContent = horario.hora;
      const detalle = document.createElement('p');
      detalle.textContent = reservado ? `Reservado por: ${horario.reservadoPor?.nombre || 'Docente'}` : laboratorio;
      const accion = document.createElement(reservado ? 'span' : 'button');
      accion.textContent = reservado ? 'Horario ocupado' : 'Reservar este horario';
      if (reservado) accion.className = 'ocupado-label';
      else {
        accion.type = 'button';
        accion.setAttribute('aria-label', `Reservar ${laboratorio}, ${fechaTexto}, ${horario.hora}`);
        accion.addEventListener('click', () => reservarHorario(horario._id, accion));
      }
      card.append(estado, hora, detalle, accion);
      columna.append(card);
      contenedor.append(columna);
    });
  } catch (error) {
    if (id === consulta) mostrarVacio('No pudimos cargar los horarios', error.message);
  } finally {
    if (id === consulta) {
      buscar.disabled = fechaInput.disabled;
      buscar.textContent = 'Buscar horarios →';
      contenedor.removeAttribute('aria-busy');
    }
  }
}

async function reservarHorario(horarioId, boton) {
  boton.disabled = true;
  boton.textContent = 'Reservando…';
  try {
    const res = await fetch('/api/horarios/reservar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ horarioId })
    });
    const datos = await res.json();
    mostrarMensaje(datos.mensaje || (res.ok ? 'Reserva confirmada.' : 'No se pudo reservar el horario.'), !res.ok);
    await cargarHorarios();
  } catch (error) {
    mostrarMensaje('No se pudo confirmar la reserva. Consulta los horarios antes de intentar nuevamente.', true);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Reservar este horario';
  }
}

async function actualizarVentana() {
  const estado = document.getElementById('estado-reservas');
  fechaInput.required = true;
  try {
    const res = await fetch('/api/horarios/ventana', {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
    });
    if (!res.ok) throw new Error('No se pudo consultar la disponibilidad. Intenta nuevamente.');
    const ventana = await res.json();
    fechaInput.min = ventana.desde;
    fechaInput.max = ventana.hasta;
    fechaInput.disabled = !ventana.habilitada;
    if (contenedor.getAttribute('aria-busy') !== 'true') buscar.disabled = !ventana.habilitada;
    const formato = valor => new Date(`${valor}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
    estado.textContent = ventana.habilitada
      ? `Puedes reservar del ${formato(ventana.desde)} al ${formato(ventana.hasta)}. Los domingos no hay servicio.`
      : 'Las reservas se abren hoy a las 5:00 p. m., hora de Ciudad de México.';
    if (!ventana.habilitada) mostrarVacio('La siguiente semana está por abrir', 'Vuelve el domingo a partir de las 5:00 p. m. para reservar.');
    if (ventana.habilitada && !fechaInput.value) fechaInput.value = ventana.desde;
    return ventana.habilitada;
  } catch (error) {
    estado.textContent = error.message;
    return false;
  }
}

document.getElementById('form-reservas').addEventListener('submit', event => {
  event.preventDefault();
  mostrarMensaje('');
  cargarHorarios();
});
for (const campo of [fechaInput, document.getElementById('laboratorio')]) {
  campo.addEventListener('change', () => {
    consulta++;
    contenedor.removeAttribute('aria-busy');
    buscar.disabled = fechaInput.disabled;
    buscar.textContent = 'Buscar horarios →';
    mostrarMensaje('');
    document.getElementById('resumen-horarios').textContent = 'Consulta la disponibilidad para planear tu clase.';
    mostrarVacio('Consulta los horarios de tu selección', 'Haz clic en Buscar horarios para ver la disponibilidad.');
  });
}
actualizarVentana();
setInterval(actualizarVentana, 30000);

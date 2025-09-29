// Proteger acceso: si no hay token, redirige a login
const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "login.html";
}

// Cerrar sesión
function logout() {
  localStorage.removeItem("token");
  window.location.href = "login.html";
}

async function cargarHorarios() {
  console.log("✅ Función cargarHorarios() ejecutada");

  const laboratorio = document.getElementById("laboratorio").value;
  const fechaInput = document.getElementById("fecha").value;

 const fechaISO = fechaInput; // ya viene en formato 'YYYY-MM-DD'

  console.log("Consultando horarios...", laboratorio, fechaISO);

  const res = await fetch(`/api/horarios?laboratorio=${laboratorio}&fecha=${fechaISO}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  console.log("Código de respuesta:", res.status);

  const datos = await res.json();
  console.log("Respuesta JSON:", datos);

  const contenedor = document.getElementById("horarios");
  contenedor.innerHTML = "";

  datos.forEach(horario => {
    const reservado = horario.estado === "Reservado";
    const nombreDocente = horario.reservadoPor?.nombre || "";

    const div = document.createElement("div");
    div.className = "col-md-4 mb-3";

    div.innerHTML = `
      <div class="card ${reservado ? 'border-danger' : 'border-success'}">
        <div class="card-body">
          <h5 class="card-title">${horario.hora}</h5>
          <p class="card-text">
            Estado: <strong>${horario.estado}</strong><br>
            ${reservado ? `Reservado por: ${nombreDocente}` : ""}
          </p>
          ${!reservado ? `<button onclick="reservarHorario('${horario._id}')" class="btn btn-success">Reservar</button>` : ""}
        </div>
      </div>
    `;
    contenedor.appendChild(div);
  });
}

async function reservarHorario(horarioId) {
  const res = await fetch("/api/horarios/reservar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ horarioId })
  });

  const data = await res.json();
  alert(data.mensaje);
  cargarHorarios(); // Vuelve a cargar los horarios después de reservar
}
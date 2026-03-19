const API = "";
const token = localStorage.getItem("token");

const form = document.getElementById("formRegistrarUsuario");
const alerta = document.getElementById("alerta");
const btnGuardar = document.getElementById("btnGuardar");

const inputNombre = document.getElementById("nombre");
const inputCorreo = document.getElementById("correo");
const inputContraseña = document.getElementById("contraseña");
const inputRol = document.getElementById("rol");
const inputFechaIngreso = document.getElementById("fechaIngreso");
const inputDiasVacaciones = document.getElementById("diasVacacionesDisponibles");
const inputPuesto = document.getElementById("puesto");
const inputDepartamento = document.getElementById("departamento");

function obtenerUsuarioActual() {
  try {
    return JSON.parse(localStorage.getItem("usuario")) || null;
  } catch {
    return null;
  }
}

function obtenerRolesDesdeStorageOToken() {
  let roles = [];

  try {
    const usuario = JSON.parse(localStorage.getItem("usuario") || "{}");
    if (Array.isArray(usuario.roles)) {
      roles = usuario.roles;
    } else if (usuario.rol) {
      roles = [usuario.rol];
    }
  } catch {}

  if (!roles.length && token && token.split(".").length === 3) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (Array.isArray(payload.roles)) {
        roles = payload.roles;
      } else if (payload.rol) {
        roles = [payload.rol];
      }
    } catch (e) {
      console.error("Error leyendo roles del token:", e);
    }
  }

  return roles.map(r => String(r).trim().toLowerCase());
}

function mostrarAlerta(tipo, mensaje) {
  alerta.innerHTML = `
    <div class="alert alert-${tipo} alert-dismissible fade show" role="alert">
      ${mensaje}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
}

function limpiarFormulario() {
  form.reset();
  inputDiasVacaciones.value = 0;
}

function validarAcceso() {
  if (!token) {
    alert("Tu sesión no es válida. Inicia sesión nuevamente.");
    window.location.href = "login.html";
    return false;
  }

  const roles = obtenerRolesDesdeStorageOToken();
  const permitido = roles.includes("admin") || roles.includes("rrhh");

  if (!permitido) {
    alert("No tienes permisos para entrar a esta página.");
    window.location.href = "index.html";
    return false;
  }

  return true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = inputNombre.value.trim();
  const correo = inputCorreo.value.trim().toLowerCase();
  const contraseña = inputContraseña.value.trim();
  const rol = inputRol.value;
  const fechaIngreso = inputFechaIngreso.value || null;
  const diasVacacionesDisponibles = Number(inputDiasVacaciones.value || 0);
  const puesto = inputPuesto.value.trim();
  const departamento = inputDepartamento.value.trim();

  if (!nombre || !correo || !contraseña || !rol) {
    mostrarAlerta("warning", "Completa los campos obligatorios.");
    return;
  }

  btnGuardar.disabled = true;
  btnGuardar.textContent = "Guardando...";

  try {
    const res = await fetch(`${API}/api/users/crear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        nombre,
        correo,
        contraseña,
        rol,
        fechaIngreso,
        diasVacacionesDisponibles,
        puesto,
        departamento
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarAlerta("danger", data.mensaje || "No se pudo crear el usuario.");
      return;
    }

    mostrarAlerta("success", "Usuario creado correctamente.");
    limpiarFormulario();
  } catch (error) {
    console.error("Error al crear usuario:", error);
    mostrarAlerta("danger", "Ocurrió un error al crear el usuario.");
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar usuario";
  }
});

validarAcceso();
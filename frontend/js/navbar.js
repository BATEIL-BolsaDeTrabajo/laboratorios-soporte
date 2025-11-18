// js/navbar.js

// ================== CARGAR NAVBAR ==================
fetch("/navbar.html?v=10")
  .then((res) => res.text())
  .then((html) => {
    const cont =
      document.getElementById("navbar-container") ||
      document.getElementById("navbar");
    if (!cont) {
      console.warn("Falta <div id='navbar-container'></div>");
      return;
    }
    cont.innerHTML = html;

    // Después de inyectar el HTML:
    configurarMenuPorRoles();
    mostrarUsuarioNavbar();
  })
  .catch((err) => console.error("Error cargando navbar:", err));

// ================== LOGOUT ==================
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
  window.location.href = "login.html";
}

// ================== OBTENER ROLES ==================
function obtenerRolesDesdeStorageOToken() {
  let roles = [];

  // 1) Intentar desde localStorage.usuario
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "{}");
    if (Array.isArray(u.roles)) roles = u.roles;
    else if (u.rol) roles = [u.rol];
  } catch {}

  // 2) Si no hay roles, intentar decodificar el token
  if (!roles.length) {
    const t = localStorage.getItem("token");
    if (t && t.split(".").length === 3) {
      try {
        const payload = JSON.parse(atob(t.split(".")[1]));
        if (Array.isArray(payload.roles)) roles = payload.roles;
        else if (payload.rol) roles = [payload.rol];
      } catch (e) {
        console.error("Error decodificando token para roles:", e);
      }
    }
  }

  return roles
    .filter(Boolean)
    .map((r) => String(r).trim().toLowerCase());
}

// ================== CONFIGURAR MENÚ POR ROLES ==================
function configurarMenuPorRoles() {
  const roles = obtenerRolesDesdeStorageOToken();
  const has = (r) => roles.includes(r);

  const show = (ids) =>
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("d-none");
    });

  let visible = false;

  // DOCENTE / TALLERES
  if (has("docente") || has("talleres")) {
    show([
      "item-docente-header",
      "item-docente-crear",
      "item-docente-reservar",
      "item-docente-mis",
      // "item-docente-falla",
      // "item-docente-vacaciones",
      // "item-docente-historial",
      "item-docente-divider",
    ]);
    visible = true;
  }

  // ADMIN
  if (has("admin")) {
    show([
      "item-admin-header",
      "item-admin-dashboard",
      "item-admin-usuarios",
      "item-admin-tickets",
      "item-admin-asignables",
      "item-admin-divider",
    ]);
    visible = true;

    // badge de tickets asignables
    const token = localStorage.getItem("token");
    fetch("/api/tickets/asignables", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((tks) => {
        const b = document.getElementById("badge-asignables");
        if (b && Array.isArray(tks)) b.innerText = tks.length;
      })
      .catch(() => {});
  }

  // SOPORTE
  if (has("soporte")) {
    show([
      "item-soporte-header",
      "item-soporte-tickets",
      "item-soporte-labs",
      "item-soporte-divider",
    ]);
    visible = true;
  }

  // MANTENIMIENTO
  if (has("mantenimiento")) {
    show([
      "item-mantenimiento-header",
      "item-mantenimiento-tickets",
      "item-mantenimiento-divider",
    ]);
    visible = true;
  }

  // RRHH
  if (has("rrhh")) {
    show([
      "item-rrhh-header",
      "item-rrhh-solicitudes",
      "item-rrhh-ticketsoporte",
      "item-rrhh-gestiondias",
      "item-rrhh-histDiasyTiempo",
      "item-rrhh-RegistrarUsuario",
      "item-rrhh-divider",
    ]);
    visible = true;
  }

  // DIRECCIÓN
  if (has("direccion")) {
    show([
      "item-direccion-header",
      "item-direccion-crear",
      "item-direccion-panelCalificaciones",
      "item-direccion-subirCalificaciones",
      "item-direccion-historial",
      "item-direccion-divider",
    ]);
    visible = true;
  }

  // SUBDIRECCIÓN
  if (has("subdireccion")) {
    show([
      "item-subdireccion-header",
      "item-subdireccion-crear",
      "item-subdireccion-revision",
      "item-subdireccion-tiempo",
      "item-subdireccion-soltxt",
      "item-subdireccion-panelCalificaciones",
      "item-subdireccion-subirCalificaciones",
      "item-subdireccion-historial",
      "item-subdireccion-divider",
    ]);
    visible = true;
  }

  // FINANZAS
  if (has("finanzas")) {
    show([
      "item-finanzas-header",
      "item-finanzas-dashboard",
      "item-finanzas-crear",
      "item-finanzas-tickets",
      "item-finanzas-revision",
      "item-finanzas-tiempo",
      "item-finanzas-revisiontiempo",
      "item-finanzas-historial",
      "item-finanzas-divider",
    ]);
    visible = true;
  }

  // COORDINACIÓN D
  if (has("coordinacion") || has("coordinaciond")) {
    show([
      "item-coordinacionD-header",
      "item-coordinacionD-crear",
      "item-coordinacionD-reservas",
      "item-coordinacionD-divider",
    ]);
    visible = true;
  }

  // si hay algo que mostrar, quitamos d-none al dropdown
  if (visible) {
    const dd = document.getElementById("menu-roles-dropdown");
    if (dd) dd.classList.remove("d-none");
  }
}

// ================== OBTENER USUARIO ==================
function obtenerUsuarioActual() {
  // 1) Intentar de localStorage.usuario
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    if (u && u.nombre) return u;
  } catch {}

  // 2) Intentar desde el token
  const t = localStorage.getItem("token");
  if (t && t.split(".").length === 3) {
    try {
      const payload = JSON.parse(atob(t.split(".")[1]));
      return {
        nombre:
          payload.nombre ||
          payload.name ||
          payload.fullName ||
          payload.email ||
          "Usuario",
        roles: payload.roles || (payload.rol ? [payload.rol] : []),
      };
    } catch (e) {
      console.error("Error decodificando token para usuario:", e);
    }
  }

  return null;
}

// ================== MOSTRAR NOMBRE EN NAVBAR ==================
// ================== MOSTRAR NOMBRE + INICIAL EN NAVBAR ==================
function mostrarUsuarioNavbar() {
  const usuario = obtenerUsuarioActual();   // 👈 usamos la función que ya tenías

  console.log("Usuario navbar:", usuario);  // te sirve para verlo en la consola

  if (!usuario || !usuario.nombre) return;

  const nombre = String(usuario.nombre).trim();
  const inicial = nombre && nombre.charAt(0)
    ? nombre.charAt(0).toUpperCase()
    : "?";

  // Elementos del DOM
  const spanNombre = document.getElementById("nav-username");
  const avatar     = document.getElementById("nav-user-avatar");
  const liCont     = document.getElementById("user-info-nav");

  if (!spanNombre || !avatar || !liCont) return;

  // Asignar valores visibles
  spanNombre.textContent = nombre;   // 👉 nombre a la derecha del círculo
  avatar.textContent     = inicial;  // 👉 letra dentro del círculo

  // Mostrar el bloque
  liCont.style.display = "flex";
}




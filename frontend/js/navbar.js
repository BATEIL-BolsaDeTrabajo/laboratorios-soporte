// js/navbar.js

(function cargarToastsGlobales() {
  if (window.mostrarToast || document.querySelector('script[data-app-toasts="true"]')) return;

  const script = document.createElement("script");
  script.src = "/js/toasts.js";
  script.dataset.appToasts = "true";
  document.head.appendChild(script);
})();

(function cargarIconosGlobales() {
  if (document.querySelector('link[data-app-icons="true"]')) return;

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css";
  stylesheet.referrerPolicy = "no-referrer";
  stylesheet.dataset.appIcons = "true";
  document.head.appendChild(stylesheet);
})();

// ================== CARGAR NAVBAR ==================
  fetch("/navbar.html?v=20")
  .then((res) => res.text())
  .then(async (html) => {
    const cont =
      document.getElementById("navbar-container") ||
      document.getElementById("navbar");

    if (!cont) {
      console.warn("Falta <div id='navbar-container'></div>");
      return;
    }

    const iconosNavbar = {
      "💻": "fa-laptop-code", "🗓️": "fa-calendar-days", "🗓": "fa-calendar-days", "📋": "fa-clipboard-list",
      "🛠️": "fa-screwdriver-wrench", "🎫": "fa-ticket", "📅": "fa-calendar-check",
      "📊": "fa-chart-column", "📤": "fa-file-arrow-up", "📚": "fa-book-open",
      "📄": "fa-file-lines", "📝": "fa-pen-to-square", "📁": "fa-folder-open",
      "🧮": "fa-calculator", "📘": "fa-building", "🎓": "fa-graduation-cap",
      "⏱": "fa-stopwatch", "⬆": "fa-arrow-up", "⬇": "fa-arrow-down"
    };
    Object.entries(iconosNavbar).forEach(([emoji, icono]) => {
      html = html.replaceAll(emoji, `<i class="fa-solid ${icono} nav-icon" aria-hidden="true"></i>`);
    });
    cont.innerHTML = html;
    normalizarEnlacesNavbar(cont);

    await sincronizarUsuarioActual();
    configurarMenuPorRoles();
    mostrarUsuarioNavbar();
    inicializarNotificaciones();
  })
  .catch((err) => console.error("Error cargando navbar:", err));

function normalizarEnlacesNavbar(contenedor) {
  contenedor.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute("href") || "";
    const esRutaInternaRelativa =
      href &&
      !href.startsWith("/") &&
      !href.startsWith("#") &&
      !href.startsWith("http://") &&
      !href.startsWith("https://") &&
      !href.startsWith("mailto:") &&
      !href.startsWith("tel:");

    if (esRutaInternaRelativa) {
      link.setAttribute("href", `/${href}`);
    }
  });
}

// ================== LOGOUT ==================
function logout() {
  try {
    if (socket && typeof socket.disconnect === "function") {
      socket.disconnect();
    }
  } catch (e) {
    console.warn("No se pudo cerrar socket:", e);
  }

  localStorage.removeItem("token");
  localStorage.removeItem("usuario");

  // IMPORTANTE: ruta absoluta
  window.location.replace("/login.html");
}

// dejar disponible globalmente
window.logout = logout;

async function sincronizarUsuarioActual() {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch("/api/users/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;

    const usuario = await res.json();
    localStorage.setItem("usuario", JSON.stringify({
      ...usuario,
      _id: usuario._id || usuario.id,
      email: usuario.correo || usuario.email
    }));
  } catch (error) {
    console.warn("No se pudo actualizar la información del usuario", error);
  }
}

// ================== OBTENER ROLES ==================
function obtenerRolesDesdeStorageOToken() {
  let roles = [];

  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "{}");
    if (Array.isArray(u.roles)) roles = u.roles;
    else if (u.rol) roles = [u.rol];
  } catch {}

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

// Las cuentas antiguas no tienen esta propiedad y conservan todas las
// opciones de sus roles. Un arreglo (también vacío) es una selección explícita.
const MENU_PERMISSION_ITEM_IDS = [
  "docente-crear", "docente-mistickets", "docente-reservar", "docente-mis", "docente-vacaciones", "docente-historial",
  "soporte-autoticket", "soporte-tickets", "soporte-labs",
  "mantenimiento-autoticket", "mantenimiento-tickets",
  "admin-dashboard", "admin-usuarios", "admin-tickets", "admin-asignables", "admin-ciclos", "admin-colegiatura", "admin-seguimientoAcademico",
  "rrhh-solicitudes", "rrhh-ticketsoporte", "rrhh-mistickets", "rrhh-gestiondias", "rrhh-histDiasyTiempo", "rrhh-RegistrarUsuario",
  "direccion-crear", "direccion-mistickets", "direccion-panelCalificaciones", "direccion-subirCalificaciones", "direccion-seguimientoAcademico", "direccion-historial", "direccion-ciclos", "direccion-colegiatura",
  "subdireccion-crear", "subdireccion-mistickets", "subdireccion-revision", "subdireccion-tiempo", "subdireccion-soltxt", "subdireccion-panelCalificaciones", "subdireccion-subirCalificaciones", "subdireccion-seguimientoAcademico", "subdireccion-historial", "subdireccion-ciclos", "subdireccion-colegiatura",
  "finanzas-dashboard", "finanzas-crear", "finanzas-archtickets", "finanzas-mistickets", "finanzas-tickets", "finanzas-historial", "finanzas-colegiatura", "finanzas-revision", "finanzas-tiempo", "finanzas-revisiontiempo",
  "almacen-dashboard", "almacen-productos", "almacen-entradas", "almacen-recibidos", "almacen-salidas", "almacen-ajustes", "almacen-configuracion", "almacen-asignacion-equipo",
  "coordinacionD-crear", "coordinacionD-mistickets", "coordinacionD-reservas",
  "coordinador-crear", "coordinador-mistickets", "coordinador-colegiatura", "coordinador-seguimientoAcademico",
  "caja-crear", "caja-mistickets", "caja-colegiatura"
];

function obtenerPermisosMenuUsuario() {
  const usuario = obtenerUsuarioActual();
  if (Array.isArray(usuario?.menuPermissions)) return usuario.menuPermissions;

  try {
    const token = localStorage.getItem("token");
    const payload = token ? JSON.parse(atob(token.split(".")[1])) : null;
    return Array.isArray(payload?.menuPermissions) ? payload.menuPermissions : null;
  } catch {
    return null;
  }
}

function aplicarPermisosMenu() {
  const permisos = obtenerPermisosMenuUsuario();
  if (permisos === null) return;

  const permitidos = new Set(permisos);
  // Un administrador nunca debe perder el acceso a la administración de usuarios.
  // Esto también recupera cuentas admin que hayan quedado con un arreglo vacío.
  if (obtenerRolesDesdeStorageOToken().includes("admin")) {
    MENU_PERMISSION_ITEM_IDS
      .filter((key) => key.startsWith("admin-"))
      .forEach((key) => permitidos.add(key));
  }
  MENU_PERMISSION_ITEM_IDS.forEach((key) => {
    if (!permitidos.has(key)) document.getElementById(`item-${key}`)?.classList.add("d-none");
  });

  document.querySelectorAll("#dropdown-items .dropdown-header").forEach((header) => {
    if (header.id === "item-mi-cuenta-header") return;
    let nodo = header.nextElementSibling;
    let tieneOpcion = false;
    while (nodo && !nodo.classList.contains("dropdown-header")) {
      if (nodo.querySelector("a.dropdown-item") && !nodo.classList.contains("d-none")) tieneOpcion = true;
      nodo = nodo.nextElementSibling;
    }
    if (!tieneOpcion) header.classList.add("d-none");
  });

  document.querySelectorAll("#dropdown-items hr.dropdown-divider").forEach((divider) => {
    const item = divider.closest("li");
    if (item?.previousElementSibling?.classList.contains("d-none")) item.classList.add("d-none");
  });
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

  if (has("docente") || has("talleres")) {
    show([
      "item-docente-header",
      "item-docente-crear",
      "item-docente-reservar",
      "item-docente-mistickets",
      "item-docente-mis",
      "item-docente-vacaciones",
      "item-docente-historial",
      "item-docente-divider",
    ]);
    visible = true;
  }

  if (has("admin")) {
    show([
      "item-admin-header",
      "item-admin-dashboard",
      "item-admin-usuarios",
      "item-admin-tickets",
      "item-admin-asignables",
      "item-admin-ciclos",
      "item-admin-colegiatura",
      "item-admin-seguimientoAcademico",
      "item-admin-divider",
    ]);
    visible = true;

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

  if (has("soporte")) {
    show([
      "item-soporte-header",
      "item-soporte-autoticket",
      "item-soporte-tickets",
      "item-soporte-labs",
      "item-soporte-divider",
    ]);
    visible = true;
  }

  if (has("mantenimiento")) {
    show([
      "item-mantenimiento-header",
      "item-mantenimiento-autoticket",
      "item-mantenimiento-tickets",
      "item-mantenimiento-divider",
    ]);
    visible = true;
  }

  if (has("rrhh")) {
    show([
      "item-rrhh-header",
      "item-rrhh-solicitudes",
      "item-rrhh-ticketsoporte",
      "item-direccion-mistickets",
      "item-rrhh-mistickets",
      "item-rrhh-gestiondias",
      "item-rrhh-histDiasyTiempo",
      "item-rrhh-RegistrarUsuario",
      "item-rrhh-divider",
    ]);
    visible = true;
  }

  if (has("direccion")) {
    show([
      "item-direccion-header",
      "item-direccion-crear",
      "item-direccion-mistickets",
      "item-direccion-panelCalificaciones",
      "item-direccion-subirCalificaciones",
      "item-direccion-seguimientoAcademico",
      "item-direccion-historial",
      "item-direccion-colegiatura",
      "item-direccion-ciclos",
      "item-direccion-divider",
    ]);
    visible = true;
  }

  if (has("subdireccion")) {
    show([
      "item-subdireccion-header",
      "item-subdireccion-crear",
      "item-subdireccion-mistickets",
      "item-subdireccion-revision",
      "item-subdireccion-tiempo",
      "item-subdireccion-soltxt",
      "item-subdireccion-panelCalificaciones",
      "item-subdireccion-subirCalificaciones",
      "item-subdireccion-seguimientoAcademico",
      "item-subdireccion-historial",
      "item-subdireccion-ciclos",
      "item-subdireccion-colegiatura",
      "item-subdireccion-divider",
    ]);
    visible = true;
  }

  if (has("finanzas")) {
    show([
      "item-finanzas-header",
      "item-finanzas-dashboard",
      "item-finanzas-crear",
      "item-finanzas-mistickets",
      "item-finanzas-tickets",
      "item-finanzas-revision",
      "item-finanzas-tiempo",
      "item-finanzas-revisiontiempo",
      "item-finanzas-historial",
      "item-finanzas-divider",
      "item-finanzas-asignables",
      "item-finanzas-archtickets",
      "item-finanzas-colegiatura",
    ]);
    visible = true;
  }

  if (has("almacen") || has("finanzas")) {
    show([
      "item-almacen-header",
      "item-almacen-dashboard",
      "item-almacen-productos",
      "item-almacen-entradas",
      "item-almacen-recibidos",
      "item-almacen-salidas",
      "item-almacen-ajustes",
      "item-almacen-configuracion",
      "item-almacen-asignacion-equipo",
      "item-almacen-divider",
    ]);
    visible = true;
  }

  if (has("coordinacion") || has("coordinaciond")) {
    show([
      "item-coordinacionD-header",
      "item-coordinacionD-crear",
      "item-coordinacionD-mistickets",
      "item-coordinacionD-reservas",
      "item-coordinacionD-divider",
    ]);
    visible = true;
  }

  if (has("coordinador")) {
    show([
      "item-coordinador-header",
      "item-coordinador-crear",
      "item-coordinador-mistickets",
      "item-coordinador-colegiatura",
      "item-coordinador-seguimientoAcademico",
      "item-coordinador-divider",
    ]);
    visible = true;
  }

  if (has("caja")) {
    show([
      "item-caja-header",
      "item-caja-crear",
      "item-caja-mistickets",
      "item-caja-colegiatura",
      "item-caja-divider",
    ]);
    visible = true;
  }

  aplicarPermisosMenu();
  visible = MENU_PERMISSION_ITEM_IDS.some((key) => !document.getElementById(`item-${key}`)?.classList.contains("d-none"));

  if (visible) {
    const dd = document.getElementById("menu-roles-dropdown");
    if (dd) dd.classList.remove("d-none");
  }

  aplicarRestriccionAlmacenMenuYRedireccion();
}

// ================== OBTENER USUARIO ==================
function obtenerUsuarioActual() {
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    if (u && u.nombre) {
      if (!u._id && u.id) {
        u._id = u.id;
      }
      return u;
    }
  } catch (e) {
    console.error("Error leyendo usuario desde localStorage:", e);
  }

  const t = localStorage.getItem("token");
  if (t && t.split(".").length === 3) {
    try {
      const payload = JSON.parse(atob(t.split(".")[1]));

      const id =
        payload._id ||
        payload.id ||
        payload.userId ||
        payload.sub ||
        null;

      return {
        _id: id,
        nombre:
          payload.nombre ||
          payload.name ||
          payload.fullName ||
          payload.email ||
          "Usuario",
        roles: payload.roles || (payload.rol ? [payload.rol] : []),
        email: payload.email || null,
      };
    } catch (e) {
      console.error("Error decodificando token para usuario:", e);
    }
  }

  return null;
}

// ================== RESTRICCIÓN ALMACÉN ==================
function aplicarRestriccionAlmacenMenuYRedireccion() {
  const usuario = obtenerUsuarioActual();
  if (!usuario) return;

  const email = (usuario.email || "").toLowerCase();
  const restrictedEmail = "almacen@bateil.edu.mx";
  const isRestricted = email === restrictedEmail;

  if (!isRestricted) return;

  document.getElementById("item-almacen-entradas")?.classList.add("d-none");

  const path = (window.location.pathname || "").toLowerCase();
  if (path.includes("entradas")) {
    alert("Tu cuenta no tiene permiso para acceder a este módulo.");
    window.location.href = "/almacen/dashboard-almacen.html";
  }
}

// ================== MOSTRAR USUARIO ==================
function mostrarUsuarioNavbar() {
  const usuario = obtenerUsuarioActual();
  if (!usuario || !usuario.nombre) return;

  const nombre = String(usuario.nombre).trim();
  const inicial =
    nombre && nombre.charAt(0) ? nombre.charAt(0).toUpperCase() : "?";

  const spanNombre = document.getElementById("nav-username");
  const avatar = document.getElementById("nav-user-avatar");
  const liCont = document.getElementById("user-info-nav");

  if (!spanNombre || !avatar || !liCont) return;

  spanNombre.textContent = nombre;
  avatar.textContent = inicial;
  liCont.style.display = "flex";

  initSocket(usuario);
}

// ================== NOTIFICACIONES ==================
let notifLista = [];
let notifTicketsPrev = null;
let notifInterval = null;
let notifSound = null;
let socket = null;

function inicializarNotificaciones() {
  const li = document.getElementById("nav-notifications");
  if (!li) return;

  li.style.display = "block";
  cargarSonidoNotificacion();
  cargarNotificacionesServidor();

  if (notifInterval) clearInterval(notifInterval);
  notifInterval = setInterval(cargarNotificacionesServidor, 30000);
}

async function cargarNotificacionesServidor() {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch("/api/notifications", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      console.warn("No se pudieron cargar las notificaciones del servidor");
      return;
    }

    const data = await res.json();

    const roles = obtenerRolesDesdeStorageOToken();
    const esAdminLike =
      roles.includes("admin") || roles.includes("finanzas");
    const esTecLike =
      roles.includes("soporte") || roles.includes("mantenimiento");

    const tiposPermitidos = new Set(["resuelto", "prioridad", "comentario"]);

    if (esAdminLike) {
      tiposPermitidos.add("nuevo");
      tiposPermitidos.add("eliminado");
    }

    if (esTecLike) {
      tiposPermitidos.add("asignado");
      tiposPermitidos.add("cerrado_usuario");
    }

    if (!tiposPermitidos.size) {
      notifLista = [];
    } else {
      notifLista = data
        .filter((n) => tiposPermitidos.has(n.tipo))
        .map((n) => {
          const fechaTxt = new Date(n.fecha).toLocaleString("es-MX", {
            year: "2-digit",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });

          return {
            titulo: n.titulo,
            fecha: fechaTxt,
            tipo: n.tipo || "general",
            leida: !!n.leida,
          };
        });
    }

    renderNotificaciones();
  } catch (err) {
    console.error("Error al cargar notificaciones del servidor", err);
  }
}

function procesarCambiosTickets(lista) {
  notifTicketsPrev = lista.map((t) => ({
    id: String(t._id),
    prioridad: t.prioridad || "Sin prioridad",
  }));
}

function crearNotificacion(titulo, tipo = "general") {
  const fecha = new Date();
  const fechaTxt = fecha.toLocaleString("es-MX", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    titulo,
    fecha: fechaTxt,
    tipo,
    leida: false,
  };
}

function renderNotificaciones() {
  const li = document.getElementById("nav-notifications");
  const badge = document.getElementById("nav-notif-count");
  const lista = document.getElementById("nav-notif-list");

  if (!li || !badge || !lista) return;

  const total = notifLista.length;
  const sinLeer = notifLista.filter((n) => !n.leida).length;

  if (sinLeer === 0) {
    badge.style.display = "none";
  } else {
    badge.style.display = "inline-block";
    badge.textContent = sinLeer > 9 ? "9+" : String(sinLeer);
  }

  let html = '<li class="dropdown-header">Notificaciones</li>';

  if (total === 0) {
    html += `
      <li>
        <span class="dropdown-item-text text-muted small">
          Sin notificaciones.
        </span>
      </li>`;
  } else {
    notifLista.forEach((n) => {
      let icono = "🔔";
      if (n.tipo === "nuevo") icono = "🆕";
      else if (n.tipo === "prioridad") icono = "⚠️";
      else if (n.tipo === "asignado") icono = "📌";
      else if (n.tipo === "resuelto") icono = "✅";

      if (n.tipo === "cerrado_usuario") icono = "✅";
      else if (n.tipo === "comentario") icono = "💬";
      else if (n.tipo === "eliminado") icono = "🗑️";

      html += `
        <li>
          <div class="dropdown-item small text-wrap">
            <div class="fw-semibold">
              ${icono} ${n.titulo}
            </div>
            <div class="small text-white-50">${n.fecha}</div>
          </div>
        </li>`;
    });
  }

  lista.innerHTML = html;
  li.style.display = "block";
}

async function marcarNotificacionesLeidas() {
  if (!Array.isArray(notifLista) || !notifLista.length) return;

  notifLista = notifLista.map((n) => ({
    ...n,
    leida: true,
  }));

  renderNotificaciones();

  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    await fetch("/api/notifications/marcar-leidas", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    console.error(
      "Error al marcar notificaciones como leídas en servidor",
      err
    );
  }
}

function cargarSonidoNotificacion() {
  try {
    notifSound = new Audio("/notification.mp3");
    notifSound.volume = 0.5;
  } catch (e) {
    console.warn("No se pudo cargar el sonido de notificación:", e);
  }
}

function reproducirSonidoNotificacion() {
  if (!notifSound) return;
  try {
    notifSound.currentTime = 0;
    notifSound.play().catch((err) => {
      console.debug("No se pudo reproducir el sonido de notificación:", err);
    });
  } catch (e) {
    console.debug("Error al reproducir sonido de notificación:", e);
  }
}

function animarCampanita() {
  const bell = document.querySelector("#nav-notifications a");
  if (!bell) return;

  bell.classList.add("bell-anim");
  setTimeout(() => {
    bell.classList.remove("bell-anim");
  }, 900);
}

function initSocket(usuario) {
  if (!window.io) {
    console.warn("Socket.IO client no disponible");
    return;
  }

  if (!usuario || (!usuario._id && !usuario.id)) {
    console.warn("Usuario inválido para WebSocket");
    return;
  }

  const userId = usuario._id || usuario.id;
  socket = io();

  socket.on("connect", () => {
    console.log("✅ WebSocket conectado");
    socket.emit("registrarUsuario", userId);
  });

  socket.on("disconnect", () => {
    console.log("❌ WebSocket desconectado");
  });

  socket.on("nuevaNotificacion", (notif) => {
    console.log("🔔 Notificación en vivo:", notif);

    const fechaTxt = new Date(notif.fecha).toLocaleString("es-MX", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const normalizada = {
      titulo: notif.titulo,
      fecha: fechaTxt,
      tipo: notif.tipo || "general",
      leida: !!notif.leida,
    };

    notifLista.unshift(normalizada);

    renderNotificaciones();
    reproducirSonidoNotificacion();
    animarCampanita();
  });
}

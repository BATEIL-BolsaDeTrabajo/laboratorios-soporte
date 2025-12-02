// js/navbar.js

// ================== CARGAR NAVBAR ==================
fetch("/navbar.html?v=11")   // subí la v para evitar caché
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
    inicializarNotificaciones();
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
      "item-docente-mistickets",
      "item-docente-mis",
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
      "item-direccion-mistickets",  
      "item-rrhh-mistickets", 
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
      "item-direccion-mistickets",
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
      "item-subdireccion-mistickets",  
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
      "item-finanzas-mistickets", 
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
      "item-coordinacionD-mistickets",
      "item-coordinacionD-reservas",
      "item-coordinacionD-divider",
    ]);
    visible = true;
  }

  if (visible) {
    const dd = document.getElementById("menu-roles-dropdown");
    if (dd) dd.classList.remove("d-none");
  }
}

// ================== OBTENER USUARIO ==================
function obtenerUsuarioActual() {
  // 1) Intentar leer desde localStorage.usuario
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

  // 2) Si no hay usuario en localStorage, intentar desde el token
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

// ================== MOSTRAR NOMBRE + INICIAL EN NAVBAR ==================
function mostrarUsuarioNavbar() {
  const usuario = obtenerUsuarioActual();
  console.log("Usuario navbar:", usuario);

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

  console.log("🔎 Usuario antes de iniciar socket:", usuario);
  initSocket(usuario);
}

// ================== NOTIFICACIONES TICKETS ==================
let notifLista = [];
let notifTicketsPrev = null;
let notifInterval = null;
let notifSound = null;
let socket = null;

// Inicializar campanita
function inicializarNotificaciones() {
  const li = document.getElementById("nav-notifications");
  if (!li) return;

  li.style.display = "block";

  cargarSonidoNotificacion();
  cargarNotificacionesServidor();

  // 🔁 Refrescar cada 30 segundos para cargar notificaciones guardadas
  if (notifInterval) clearInterval(notifInterval);
  notifInterval = setInterval(cargarNotificacionesServidor, 30000);
}   // 👈 ESTA LLAVE FALTABA

// Cargar notificaciones ya guardadas en el servidor
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

    // 👇 Sacamos roles del usuario actual
    const roles = obtenerRolesDesdeStorageOToken();
    const esAdminLike =
      roles.includes("admin") || roles.includes("finanzas");
    const esTecLike =
      roles.includes("soporte") || roles.includes("mantenimiento");

    let tiposPermitidos = [];

    // Admin / Finanzas → nuevo + resuelto
    if (esAdminLike) {
      tiposPermitidos.push("nuevo", "resuelto");
    }

    // Soporte / Mantenimiento → asignado + prioridad
    if (esTecLike) {
      tiposPermitidos.push("asignado", "prioridad");
    }

    // Si por alguna razón no tiene ninguno de esos roles
    if (!tiposPermitidos.length) {
      notifLista = [];
    } else {
      notifLista = data
        .filter((n) => tiposPermitidos.includes(n.tipo))
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

// Detectar nuevos tickets o cambios de prioridad

function procesarCambiosTickets(lista) {
  const nuevaFoto = lista.map((t) => ({
    id: String(t._id),
    prioridad: t.prioridad || "Sin prioridad",
  }));

  // Solo actualizamos el snapshot para futuras comparaciones si quieres
  notifTicketsPrev = nuevaFoto;
}



// Crear objeto notificación
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

// Pintar notificaciones en la campanita
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

// 🔹 AHORA SÍ ES ASYNC
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

// ================== SONIDO DE NOTIFICACIÓN ==================
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
  socket = io(); // misma URL del servidor (local o Render)

  socket.on("connect", () => {
    console.log("✅ WebSocket conectado");
    socket.emit("registrarUsuario", userId);
  });

  socket.on("disconnect", () => {
    console.log("❌ WebSocket desconectado");
  });

  // Cuando llegue una notificación nueva en vivo desde el backend
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

    // Insertar al inicio
    notifLista.unshift(normalizada);

    // 👇 Solo mantener asignado y prioridad
    /*notifLista = notifLista.filter(
      (n) => n.tipo === "asignado" || n.tipo === "prioridad"
    );*/

    // Actualizar UI y efectos
    renderNotificaciones();
    reproducirSonidoNotificacion();
    animarCampanita();
  });
}

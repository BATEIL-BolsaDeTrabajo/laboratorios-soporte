// /js/navbar.js — versión final con Soporte y Mantenimiento independientes
fetch("/navbar.html?v=7")
  .then(res => res.text())
  .then(html => {
    const cont = document.getElementById("navbar-container") || document.getElementById("navbar");
    if (!cont) return console.warn("Falta <div id='navbar-container'></div>");
    cont.innerHTML = html;

    // === Obtener roles ===
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
        } catch {}
      }
    }
    roles = roles.filter(Boolean).map(r => String(r).trim().toLowerCase());
    // console.log("[navbar roles]:", roles);

    const show = ids => ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("d-none");
    });

    let visible = false;
    const has = r => roles.includes(r);

    // ===== DOCENTE =====
    if (has("docente") || has("talleres")) {
      show([
        "item-docente-header","item-docente-crear","item-docente-reservar","item-docente-mis",
        "item-docente-falla","item-docente-vacaciones","item-docente-historial","item-docente-divider"
      ]);
      visible = true;
    }

    // ===== ADMIN =====
    if (has("admin")) {
      show([
        "item-admin-header","item-admin-dashboard","item-admin-usuarios",
        "item-admin-tickets","item-admin-asignables","item-admin-divider"
      ]);
      visible = true;

      const token = localStorage.getItem("token");
      fetch("/api/tickets/asignables",{headers:{Authorization:`Bearer ${token}`}})
        .then(r=>r.ok?r.json():[])
        .then(tks=>{
          const b = document.getElementById("badge-asignables");
          if (b && Array.isArray(tks)) b.innerText = tks.length;
        }).catch(()=>{});
    }

    // ===== SOPORTE (Panel de Sistemas) =====
    if (has("soporte")) {
      show(["item-soporte-header","item-soporte-tickets","item-soporte-divider"]);
      visible = true;
    }

    // ===== MANTENIMIENTO (Panel General) =====
    if (has("mantenimiento")) {
      show(["item-mantenimiento-header","item-mantenimiento-tickets","item-mantenimiento-divider"]);
      visible = true;
    }

    // ===== RRHH =====
    if (has("rrhh")) {
      show([
        "item-rrhh-header","item-rrhh-solicitudes","item-rrhh-ticketsoporte",
        "item-rrhh-gestiondias","item-rrhh-histDiasyTiempo","item-rrhh-RegistrarUsuario","item-rrhh-divider"
      ]);
      visible = true;
    }

    // ===== DIRECCIÓN =====
    if (has("direccion")) {
      show([
        "item-direccion-header","item-direccion-crear","item-direccion-panelCalificaciones",
        "item-direccion-subirCalificaciones","item-direccion-divider"
      ]);
      visible = true;
    }

    // ===== SUBDIRECCIÓN =====
    if (has("subdireccion")) {
      show([
        "item-subdireccion-header","item-subdireccion-crear","item-subdireccion-revision",
        "item-subdireccion-tiempo","item-subdireccion-soltxt",
        "item-subdireccion-panelCalificaciones","item-subdireccion-subirCalificaciones","item-subdireccion-divider"
      ]);
      visible = true;
    }

    // ===== FINANZAS =====
    if (has("finanzas")) {
      show([
        "item-finanzas-header","item-finanzas-crear","item-finanzas-revision",
        "item-finanzas-tiempo","item-finanzas-revisiontiempo","item-finanzas-tickets","item-finanzas-divider"
      ]);
      visible = true;
    }

    // ===== COORDINACIÓN D =====
    if (has("coordinacion") || has("coordinaciond")) {
      show(["item-coordinacionD-header","item-coordinacionD-crear","item-coordinacionD-reservas","item-coordinacionD-divider"]);
      visible = true;
    }

    // Mostrar dropdown si hay algo
    if (visible) {
      const dd = document.getElementById("menu-roles-dropdown");
      if (dd) dd.classList.remove("d-none");
    }
  });

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
  window.location.href = "login.html";
}


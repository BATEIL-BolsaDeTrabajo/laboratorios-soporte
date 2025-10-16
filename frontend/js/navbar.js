// /js/navbar.js — versión “como antes”, pero más tolerante
fetch("navbar.html?v=2") // cache-busting simple
  .then(res => res.text())
  .then(html => {
    const mount =
      document.getElementById("navbar-container") ||
      document.getElementById("navbar");
    if (!mount) {
      console.warn("Falta <div id='navbar-container'></div> en la página.");
      return;
    }
    mount.innerHTML = html;

    // === Obtener roles ===
    let roles = [];
    try {
      const u = JSON.parse(localStorage.getItem("usuario") || "{}");
      if (Array.isArray(u.roles)) roles = u.roles;
      else if (u.rol) roles = [u.rol];
    } catch {}

    // Fallback: leer del token si hace falta
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

    // Normalizar
    roles = roles.filter(Boolean).map(r => String(r).trim().toLowerCase());
    // console.log("[navbar] roles:", roles);

    let visible = false;

    const showMany = (ids) => {
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove("d-none");
      });
      visible = true;
    };

    roles.forEach(rol => {
      // DOCENTE / TALLERES
      if (rol === "docente" || rol === "talleres") {
        showMany([
          "item-docente-header",
          "item-docente-crear",
          "item-docente-reservar",
          "item-docente-mis",
          "item-docente-falla",
          "item-docente-vacaciones",
          "item-docente-historial",
          "item-docente-divider"
        ]);
      }

      // ADMIN
      if (rol === "admin") {
        showMany([
          "item-admin-header",
          "item-admin-dashboard",
          "item-admin-usuarios",
          "item-admin-tickets",
          "item-admin-asignables",
          "item-admin-divider"
        ]);

        // Badge de asignables
        const token = localStorage.getItem("token");
        fetch("/api/tickets/asignables", {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(r => r.ok ? r.json() : [])
          .then(tkts => {
            const badge = document.getElementById("badge-asignables");
            if (badge && Array.isArray(tkts)) badge.innerText = tkts.length;
          })
          .catch(() => {});
      }

      // SOPORTE y MANTENIMIENTO (igual que tu versión: un id por rol)
      if (rol === "soporte" || rol === "mantenimiento") {
        const el = document.getElementById(`item-${rol}`);
        if (el) { el.classList.remove("d-none"); visible = true; }
      }

      // RRHH
      if (rol === "rrhh") {
        showMany([
          "item-rrhh-header",
          "item-rrhh-solicitudes",
          "item-rrhh-ticketsoporte",
          "item-rrhh-gestiondias",
          "item-rrhh-histDiasyTiempo",
          "item-rrhh-divider"
        ]);
      }

      // DIRECCIÓN
      if (rol === "direccion") {
        showMany([
          "item-direccion-header",
          "item-direccion-crear",
          "item-direccion-panelCalificaciones",
          "item-direccion-subirCalificaciones",
          "item-direccion-divider"
        ]);
      }

      // SUBDIRECCIÓN
      if (rol === "subdireccion") {
        showMany([
          "item-subdireccion-header",
          "item-subdireccion-crear",
          "item-subdireccion-revision",
          "item-subdireccion-tiempo",
          "item-subdireccion-soltxt",
          "item-subdireccion-panelCalificaciones",
          "item-subdireccion-subirCalificaciones",
          "item-subdireccion-divider"
        ]);
      }

      // FINANZAS
      if (rol === "finanzas") {
        showMany([
          "item-finanzas-header",
          "item-finanzas-crear",
          "item-finanzas-revision",
          "item-finanzas-tiempo",
          "item-finanzas-revisiontiempo",
          "item-finanzas-divider"
        ]);
      }

      // COORDINACIÓN D (si lo usas)
      if (rol === "coordinacion" || rol === "coordinaciond") {
        showMany([
          "item-coordinacionD-header",
          "item-coordinacionD-crear",
          "item-coordinacionD-reservas",
          "item-coordinacionD-divider"
        ]);
      }
    });

    if (visible) {
      const dropdown = document.getElementById("menu-roles-dropdown");
      if (dropdown) dropdown.classList.remove("d-none");
    }
  });

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
  window.location.href = "login.html";
}
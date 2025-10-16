// /js/navbar.js — muestra el menú de SOPORTE usando el bloque de MANTENIMIENTO si es necesario
fetch("/navbar.html?v=5") // rompe caché
  .then(res => res.text())
  .then(html => {
    const cont = document.getElementById("navbar-container") || document.getElementById("navbar");
    if (!cont) return console.warn("Falta <div id='navbar-container'></div> en la página.");
    cont.innerHTML = html;

    // === Obtener roles (usuario.roles | usuario.rol | token) ===
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
    // console.log("[navbar] roles:", roles);

    const show = ids => ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("d-none");
    });

    let visible = false;

    // DOCENTE
    if (roles.includes("docente") || roles.includes("talleres")) {
      show([
        "item-docente-header","item-docente-crear","item-docente-reservar","item-docente-mis",
        "item-docente-falla","item-docente-vacaciones","item-docente-historial","item-docente-divider"
      ]);
      visible = true;
    }

    // ADMIN
    if (roles.includes("admin")) {
      show([
        "item-admin-header","item-admin-dashboard","item-admin-usuarios",
        "item-admin-tickets","item-admin-asignables","item-admin-divider"
      ]);
      visible = true;

      // badge asignables (opcional)
      const token = localStorage.getItem("token");
      fetch("/api/tickets/asignables",{headers:{Authorization:`Bearer ${token}`}})
        .then(r=>r.ok?r.json():[])
        .then(tks=>{
          const b = document.getElementById("badge-asignables");
          if (b && Array.isArray(tks)) b.innerText = tks.length;
        }).catch(()=>{});
    }

    // SOPORTE o MANTENIMIENTO -> usa el bloque existente de "mantenimiento"
    if (roles.includes("soporte") || roles.includes("mantenimiento")) {
      // IDs del bloque que tienes actualmente en navbar.html
      show(["item-mantenimiento-header","item-mantenimiento-tickets","item-mantenimiento-divider"]);
      // Por si tienes variantes con "soporte" en algún archivo
      show(["item-soporte","item-soporte-header","item-soporte-tickets","item-soporte-divider"]);
      visible = true;
    }

    // RRHH
    if (roles.includes("rrhh")) {
      show([
        "item-rrhh-header","item-rrhh-solicitudes","item-rrhh-ticketsoporte",
        "item-rrhh-gestiondias","item-rrhh-histDiasyTiempo","item-rrhh-RegistrarUsuario","item-rrhh-divider"
      ]);
      visible = true;
    }

    // DIRECCIÓN
    if (roles.includes("direccion")) {
      show([
        "item-direccion-header","item-direccion-crear","item-direccion-panelCalificaciones",
        "item-direccion-subirCalificaciones","item-direccion-divider"
      ]);
      visible = true;
    }

    // SUBDIRECCIÓN
    if (roles.includes("subdireccion")) {
      show([
        "item-subdireccion-header","item-subdireccion-crear","item-subdireccion-revision",
        "item-subdireccion-tiempo","item-subdireccion-soltxt",
        "item-subdireccion-panelCalificaciones","item-subdireccion-subirCalificaciones","item-subdireccion-divider"
      ]);
      visible = true;
    }

    // FINANZAS
    if (roles.includes("finanzas")) {
      show([
        "item-finanzas-header","item-finanzas-crear","item-finanzas-revision",
        "item-finanzas-tiempo","item-finanzas-revisiontiempo","item-finanzas-divider"
      ]);
      visible = true;
    }

    // COORDINACIÓN D
    if (roles.includes("coordinacion") || roles.includes("coordinaciond")) {
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

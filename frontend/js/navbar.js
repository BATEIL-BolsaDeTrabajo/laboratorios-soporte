fetch("navbar.html")
  .then(res => res.text())
  .then(html => {
    document.getElementById("navbar-container").innerHTML = html;

    const usuario = JSON.parse(localStorage.getItem("usuario")) || {};
    const roles = usuario.roles || [];
    let visible = false;

    roles.forEach(rol => {
      // DOCENTE
      if (rol === "docente" || rol === "talleres") {
        const ids = [
          "item-docente-header",
          "item-docente-crear",
          "item-docente-reservar",
          "item-docente-mis",
          "item-docente-falla",
          "item-docente-vacaciones",
          "item-docente-historial",
          "item-docente-divider"
        ];
        ids.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.remove("d-none");
        });
        visible = true;
      }

      // ADMIN
      if (rol === "admin") {
        const ids = [
          "item-admin-header",
          "item-admin-dashboard",
          "item-admin-usuarios",
          "item-admin-tickets",
          "item-admin-asignables",
          "item-admin-divider"
        ];
        ids.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.remove("d-none");
        });
        fetch("/api/tickets/asignables", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        })
          .then(res => res.json())
          .then(tickets => {
            const badge = document.getElementById("badge-asignables");
            if (badge) badge.innerText = tickets.length;
          });
        visible = true;
      }

      // SOPORTE y MANTENIMIENTO
      if (rol === "soporte" || rol === "mantenimiento") {
        const el = document.getElementById(`item-${rol}`);
        if (el) {
          el.classList.remove("d-none");
          visible = true;
        }
      }

      // RRHH
      if (rol === "rrhh") {
        const ids = [
          "item-rrhh-header",
          "item-rrhh-solicitudes",
          "item-rrhh-ticketsoporte",
          "item-rrhh-gestiondias",
          "item-rrhh-histDiasyTiempo",
          "item-rrhh-RegistrarUsuario",
          "item-rrhh-divider"
        ];
        ids.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.remove("d-none");
        });
        visible = true;
      }

      // DIRECCIÓN
      if (rol === "direccion") {
        const ids = [
          "item-direccion-header",
          "item-direccion-crear",
          "item-direccion-divider",
          "item-direccion-panelCalificaciones",
          "item-direccion-subirCalificaciones"
        ];
        ids.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.remove("d-none");
        });
        visible = true;
      }

      // SUBDIRECCIÓN
      if (rol === "subdireccion") {
        const ids = [
          "item-subdireccion-header",
          "item-subdireccion-crear",
          "item-subdireccion-revision",
          "item-subdireccion-tiempo",
          "item-subdireccion-soltxt",
          "item-subdireccion-divider",
          "item-subdireccion-panelCalificaciones",
          "item-subdireccion-subirCalificaciones"
        ];
        ids.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.remove("d-none");
        });
        visible = true;
      }

      // FINANZAS
      if (rol === "finanzas") {
        const ids = [
          "item-finanzas-header",
          "item-finanzas-crear",
          "item-finanzas-revision",
          "item-finanzas-tiempo",
          "item-finanzas-revisiontiempo",
          "item-finanzas-divider"
        ];
        ids.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.remove("d-none");
        });
        visible = true;
      }

      if (rol === "coordinacionD") {
        const ids = [
          "item-coordinacionD-header",
          "item-coordinacionD-crear",
          "item-coordinacionD-reservas",
          "item-coordinacionD-divider"
        ];
      ids.forEach(id => {
        const el = document.getElementById(id);
       if (el) el.classList.remove("d-none");
      });
       visible = true;
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
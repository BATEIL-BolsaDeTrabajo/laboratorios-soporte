(function () {
  const TIPOS = ["success", "danger", "warning", "info"];
  const ICONOS = {
    success: "✓",
    danger: "!",
    warning: "!",
    info: "i"
  };

  function asegurarEstilos() {
    if (document.querySelector('link[data-app-toasts="true"]')) return;
    if (document.querySelector('link[href$="css/toasts.css"], link[href="/css/toasts.css"]')) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/css/toasts.css";
    link.dataset.appToasts = "true";
    document.head.appendChild(link);
  }

  function escapeHtml(texto) {
    return String(texto || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getToastStack() {
    let stack = document.getElementById("toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "toast-stack";
      stack.className = "toast-stack";
      stack.setAttribute("aria-live", "polite");
      stack.setAttribute("aria-atomic", "true");
      document.body.appendChild(stack);
    }
    return stack;
  }

  function mostrarToast(texto, tipo = "info", opciones = {}) {
    asegurarEstilos();
    const stack = getToastStack();
    const tipoNormalizado = TIPOS.includes(tipo) ? tipo : "info";
    const duracion = Number(opciones.duracion || 4500);

    const toast = document.createElement("div");
    toast.className = `app-toast app-toast-${tipoNormalizado}`;
    toast.setAttribute("role", tipoNormalizado === "danger" ? "alert" : "status");
    toast.innerHTML = `
      <span class="app-toast-icon" aria-hidden="true">${ICONOS[tipoNormalizado]}</span>
      <div class="app-toast-message">${escapeHtml(texto)}</div>
      <button type="button" class="app-toast-close" aria-label="Cerrar notificación">&times;</button>
      <span class="app-toast-progress" aria-hidden="true"></span>
    `;

    const cerrarToast = () => {
      if (toast.classList.contains("removing")) return;
      toast.classList.add("removing");
      setTimeout(() => toast.remove(), 180);
    };

    toast.querySelector(".app-toast-close").addEventListener("click", cerrarToast);
    stack.appendChild(toast);

    if (duracion > 0) {
      setTimeout(cerrarToast, duracion);
    }
  }

  function tipoDesdeTexto(texto) {
    const valor = String(texto || "").toLowerCase();
    if (valor.includes("error") || valor.includes("no se pudo") || valor.includes("no tienes") || valor.includes("expir")) {
      return "danger";
    }
    if (valor.includes("selecciona") || valor.includes("revisa") || valor.includes("bajo stock") || valor.includes("permiso")) {
      return "warning";
    }
    if (valor.includes("correct") || valor.includes("guardad") || valor.includes("registrad") || valor.includes("actualizad") || valor.includes("cancelad") || valor.includes("eliminad")) {
      return "success";
    }
    return "info";
  }

  window.mostrarToast = mostrarToast;
  window.mostrarMensajeToast = mostrarToast;

  if (!window.__nativeAlert) {
    window.__nativeAlert = window.alert.bind(window);
    window.alert = function (mensaje) {
      mostrarToast(mensaje, tipoDesdeTexto(mensaje));
    };
  }
})();

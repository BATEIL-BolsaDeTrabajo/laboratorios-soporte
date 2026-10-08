// El servidor sigue validando el JWT; aquí solo se controla la navegación.
(function vigilarSesion() {
  let temporizador;
  let redirigiendo = false;

  function cerrarSesion() {
    if (redirigiendo) return;
    redirigiendo = true;
    clearTimeout(temporizador);
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    window.location.replace("/login.html");
  }

  function comprobarSesion() {
    clearTimeout(temporizador);
    if (redirigiendo) return;

    try {
      const token = localStorage.getItem("token");
      const partes = token ? token.split(".") : [];
      if (partes.length !== 3) return cerrarSesion();

      const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
      if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
        return cerrarSesion();
      }

      const restante = payload.exp * 1000 - Date.now();
      if (restante <= 0) return cerrarSesion();
      temporizador = setTimeout(comprobarSesion, Math.min(restante, 2147483647));
    } catch {
      cerrarSesion();
    }
  }

  window.addEventListener("focus", comprobarSesion);
  window.addEventListener("pageshow", comprobarSesion);
  document.addEventListener("visibilitychange", comprobarSesion);
  window.addEventListener("storage", (evento) => {
    if (evento.key === "token" || evento.key === null) comprobarSesion();
  });
  comprobarSesion();
})();

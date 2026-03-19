const API = "";
const token = localStorage.getItem("token");

const selectCycle = document.getElementById("selectCycle");
const selectMonth = document.getElementById("selectMonth");
const filterGrupo = document.getElementById("filterGrupo");
const btnLoad = document.getElementById("btnLoad");
const btnImport = document.getElementById("btnImport");
const fileCaja = document.getElementById("fileCaja");
const tbody = document.getElementById("tbody");
const thead = document.getElementById("thead");
const summaryDiv = document.getElementById("summary");
const searchInput = document.getElementById("search");
const btnExportExcel = document.getElementById("btnExportExcel");

function getRoles() {
  try {
    const u = JSON.parse(localStorage.getItem("usuario"));
    return u?.roles || [];
  } catch {
    return [];
  }
}

const roles = getRoles();

const canEditAcademic =
  roles.includes("admin") ||
  roles.includes("direccion") ||
  roles.includes("subdireccion") ||
  roles.includes("coordinador");

const canEditAdminNotes =
  roles.includes("admin") ||
  roles.includes("direccion") ||
  roles.includes("subdireccion") ||
  roles.includes("caja");

let activeCyclesCache = [];
let currentRowsCache = [];
let currentMonthsCache = [];

// ===============================
// HEADERS
// ===============================
function authHeaders() {
  return {
    Authorization: `Bearer ${token}`
  };
}

function authHeadersJson() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

// ===============================
// CICLOS
// ===============================
async function loadCycles() {
  try {
    const res = await fetch(`${API}/api/cycles/active`, {
      headers: authHeaders()
    });

    const cycles = await res.json();
    activeCyclesCache = Array.isArray(cycles) ? cycles : [];

    selectCycle.innerHTML = '<option value="">Seleccione</option>';

    activeCyclesCache.forEach(c => {
      selectCycle.innerHTML += `<option value="${c._id}">${c.name}</option>`;
    });
  } catch (error) {
    console.error("Error cargando ciclos activos:", error);
    selectCycle.innerHTML = '<option value="">Error al cargar</option>';
  }
}

function loadMonthsForSelectedCycle() {
  const cycleId = selectCycle.value;
  const cycle = activeCyclesCache.find(c => c._id === cycleId);

  selectMonth.innerHTML = '<option value="">Seleccione</option>';

  if (!cycle || !Array.isArray(cycle.months)) return;

  [...cycle.months]
    .sort((a, b) => a.order - b.order)
    .forEach(m => {
      selectMonth.innerHTML += `<option value="${m.key}">${m.label}</option>`;
    });

  filterGrupo.innerHTML = '<option value="">Todos los grupos</option>';
  currentRowsCache = [];
  currentMonthsCache = [];
  thead.innerHTML = "";
  tbody.innerHTML = "";
  summaryDiv.innerHTML = "";
}

// ===============================
// EVENTOS
// ===============================
selectCycle.addEventListener("change", loadMonthsForSelectedCycle);
btnImport.addEventListener("click", importCajaExcel);
btnLoad.addEventListener("click", loadTable);

if (filterGrupo) {
  filterGrupo.addEventListener("change", applyFiltersAndRender);
}

if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      loadTable();
    }
  });
}

if (btnExportExcel) {
  btnExportExcel.addEventListener("click", exportExcel);
}

// ===============================
// IMPORTAR EXCEL
// ===============================
async function importCajaExcel() {
  const cycleId = selectCycle.value;
  const monthKey = selectMonth.value;
  const file = fileCaja.files[0];

  if (!cycleId) {
    alert("Selecciona un ciclo");
    return;
  }

  if (!monthKey) {
    alert("Selecciona un mes");
    return;
  }

  if (!file) {
    alert("Selecciona el archivo Excel de caja");
    return;
  }

  const formData = new FormData();
  formData.append("cycleId", cycleId);
  formData.append("monthKey", monthKey);
  formData.append("file", file);

  try {
    const res = await fetch(`${API}/api/student-payment-tracking/import-caja`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const contentType = res.headers.get("content-type") || "";
    let data;

    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      console.error("Respuesta no JSON:", text);
      alert("El servidor devolvió una respuesta inesperada. Revisa la consola.");
      return;
    }

    if (!res.ok) {
      alert(data.mensaje || "Error al importar archivo");
      return;
    }

    alert(
      `Archivo procesado correctamente\n\n` +
      `Ciclo: ${data.cycle}\n` +
      `Mes: ${data.monthKey}\n` +
      `Alumnos detectados: ${data.totalPeriodoCorrecto}\n` +
      `Creados: ${data.created}\n` +
      `Marcados en NO: ${data.updatedToNo}\n` +
      `Marcados en SI: ${data.updatedToSi}`
    );

    await loadTable();
  } catch (error) {
    console.error("Error al subir el archivo:", error);
    alert("Error al subir el archivo");
  }
}

// ===============================
// TABLA
// ===============================
async function loadTable() {
  const cycleId = selectCycle.value;
  const search = searchInput.value.trim();

  if (!cycleId) {
    alert("Selecciona un ciclo");
    return;
  }

  try {
    const res = await fetch(
      `${API}/api/student-payment-tracking?cycleId=${cycleId}&search=${encodeURIComponent(search)}`,
      { headers: authHeaders() }
    );

    const rows = await res.json();

    if (!Array.isArray(rows) || !rows.length) {
      currentRowsCache = [];
      currentMonthsCache = [];
      filterGrupo.innerHTML = '<option value="">Todos los grupos</option>';
      thead.innerHTML = "";
      tbody.innerHTML = "<tr><td colspan='100' class='text-center'>Sin datos</td></tr>";
      summaryDiv.innerHTML = "";
      return;
    }

    const cycle = rows[0].cycleId;
    const months = Array.isArray(cycle?.months)
      ? [...cycle.months].sort((a, b) => a.order - b.order)
      : [];

    currentRowsCache = rows;
    currentMonthsCache = months;

    fillGroupFilter(rows);
    renderHeader(months);
    applyFiltersAndRender();
    await loadSummary(cycleId);
  } catch (error) {
    console.error("Error cargando tabla:", error);
    currentRowsCache = [];
    currentMonthsCache = [];
    thead.innerHTML = "";
    tbody.innerHTML = "<tr><td colspan='100' class='text-center'>Error al cargar datos</td></tr>";
    summaryDiv.innerHTML = "";
  }
}

function applyFiltersAndRender() {
  let filteredRows = [...currentRowsCache];
  const grupoSeleccionado = filterGrupo?.value || "";

  if (grupoSeleccionado) {
    filteredRows = filteredRows.filter(r => (r.grupo || "") === grupoSeleccionado);
  }

  renderRows(filteredRows, currentMonthsCache);
}

function fillGroupFilter(rows) {
  if (!filterGrupo) return;

  const valorActual = filterGrupo.value || "";
  const grupos = [...new Set(rows.map(r => (r.grupo || "").trim()).filter(Boolean))].sort();

  filterGrupo.innerHTML = '<option value="">Todos los grupos</option>';

  grupos.forEach(g => {
    filterGrupo.innerHTML += `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`;
  });

  if (grupos.includes(valorActual)) {
    filterGrupo.value = valorActual;
  }
}

function renderHeader(months) {
  let html = `
    <tr>
      <th class="num-col">#</th>
      <th class="nombre-col">Nombre</th>
      <th class="grupo-col">Grupo</th>
  `;

  months.forEach(m => {
    html += `<th class="mes-col">${escapeHtml(m.label)}</th>`;
  });

  html += `
      <th class="asistencia-col">Asistencia</th>
      <th class="motivo-col">Motivo</th>
      <th class="notas-acad-col">Notas Acad.</th>
      <th class="notas-admin-col">Notas Adm.</th>
    </tr>
  `;

  thead.innerHTML = html;
}

function renderRows(rows, months) {
  tbody.innerHTML = "";

  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="${months.length + 7}" class="text-center">Sin datos</td></tr>`;
    return;
  }

  rows.forEach((row, index) => {
    let html = `
      <tr>
        <td class="num-col">${index + 1}</td>
        <td class="nombre-col">${escapeHtml(row.nombre || "")}</td>
        <td class="grupo-col">${escapeHtml(row.grupo || "")}</td>
    `;

    months.forEach(m => {
      const payment = row.payments?.[m.key];
      const val = payment?.value || "";

      let estadoClass = "";
      if (val === "SI") estadoClass = "estado-si";
      if (val === "NO") estadoClass = "estado-no";

      html += `<td class="mes-col ${estadoClass}">${escapeHtml(val)}</td>`;
    });

    const asistenciaClass =
      row.asistencia === "REGULAR"
        ? "asistencia-regular"
        : row.asistencia === "IRREGULAR"
        ? "asistencia-irregular"
        : "";

    html += `
      <td class="asistencia-col ${asistenciaClass}">
        <select
          class="form-select form-select-sm asistencia-select"
          data-id="${row._id}"
          ${!canEditAcademic ? "disabled" : ""}
        >
          <option value="" ${!row.asistencia ? "selected" : ""}></option>
          <option value="REGULAR" ${row.asistencia === "REGULAR" ? "selected" : ""}>REGULAR</option>
          <option value="IRREGULAR" ${row.asistencia === "IRREGULAR" ? "selected" : ""}>IRREGULAR</option>
        </select>
      </td>

      <td class="motivo-col">
        <input
          type="text"
          class="form-control form-control-sm motivo-input"
          data-id="${row._id}"
          value="${escapeHtml(row.motivo || "")}"
          ${!canEditAcademic ? "readonly" : ""}
        >
      </td>

      <td class="notas-acad-col">
        <textarea
          class="form-control form-control-sm notas-acad-input"
          data-id="${row._id}"
          rows="2"
          ${!canEditAcademic ? "readonly" : ""}
        >${escapeHtml(row.notasAcademicas || "")}</textarea>
      </td>

      <td class="notas-admin-col">
        <textarea
          class="form-control form-control-sm notas-admin-input"
          data-id="${row._id}"
          rows="2"
          ${!canEditAdminNotes ? "readonly" : ""}
        >${escapeHtml(row.notasAdministrativas || "")}</textarea>
      </td>
      </tr>
    `;

    tbody.insertAdjacentHTML("beforeend", html);
  });

  attachAcademicEvents();
  attachAdminNotesEvents();
}

// ===============================
// HELPERS
// ===============================
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===============================
// GUARDAR ACADEMICO
// ===============================
function attachAcademicEvents() {
  if (!canEditAcademic) return;

  const asistenciaSelects = document.querySelectorAll(".asistencia-select");
  const motivoInputs = document.querySelectorAll(".motivo-input");
  const notasAcadInputs = document.querySelectorAll(".notas-acad-input");

  asistenciaSelects.forEach(el => {
    el.addEventListener("change", () => saveAcademicRow(el.dataset.id));
  });

  motivoInputs.forEach(el => {
    el.addEventListener("blur", () => saveAcademicRow(el.dataset.id));
  });

  notasAcadInputs.forEach(el => {
    el.addEventListener("blur", () => saveAcademicRow(el.dataset.id));
  });
}

async function saveAcademicRow(id) {
  const asistencia = document.querySelector(`.asistencia-select[data-id="${id}"]`)?.value || "";
  const motivo = document.querySelector(`.motivo-input[data-id="${id}"]`)?.value || "";
  const notasAcademicas = document.querySelector(`.notas-acad-input[data-id="${id}"]`)?.value || "";

  try {
    const res = await fetch(`${API}/api/student-payment-tracking/${id}/academic`, {
      method: "PATCH",
      headers: authHeadersJson(),
      body: JSON.stringify({
        asistencia,
        motivo,
        notasAcademicas
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.mensaje || "Error al guardar información académica");
      return;
    }
  } catch (error) {
    console.error("Error guardando información académica:", error);
    alert("Error al guardar información académica");
  }
}

// ===============================
// GUARDAR NOTAS ADMIN
// ===============================
function attachAdminNotesEvents() {
  if (!canEditAdminNotes) return;

  const notasAdminInputs = document.querySelectorAll(".notas-admin-input");

  notasAdminInputs.forEach(el => {
    el.addEventListener("blur", () => saveAdminNotesRow(el.dataset.id));
  });
}

async function saveAdminNotesRow(id) {
  const notasAdministrativas =
    document.querySelector(`.notas-admin-input[data-id="${id}"]`)?.value || "";

  try {
    const res = await fetch(`${API}/api/student-payment-tracking/${id}/admin-notes`, {
      method: "PATCH",
      headers: authHeadersJson(),
      body: JSON.stringify({
        notasAdministrativas
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.mensaje || "Error al guardar notas administrativas");
      return;
    }
  } catch (error) {
    console.error("Error guardando notas administrativas:", error);
    alert("Error al guardar notas administrativas");
  }
}

// ===============================
// RESUMEN
// ===============================
async function loadSummary(cycleId) {
  try {
    const res = await fetch(`${API}/api/student-payment-tracking/summary/${cycleId}`, {
      headers: authHeaders()
    });

    const data = await res.json();

    let html = `
      <div class="resumen-card">
        <div><strong>Matrícula total:</strong> ${data.total}</div>
        <div class="resumen-grid">
    `;

    for (const key in data.months) {
      const m = data.months[key];
      html += `
        <div class="resumen-item">
          <div class="titulo">${escapeHtml(m.label)}</div>
          <div class="valor">${m.si}</div>
          <div class="detalle">
            SI: ${m.si} | NO: ${m.no} | ${m.porcentajeSi}%
          </div>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    summaryDiv.innerHTML = html;
  } catch (error) {
    console.error("Error cargando resumen:", error);
    summaryDiv.innerHTML = "";
  }
}

function exportExcel() {
  const cycleId = selectCycle.value;
  const grupo = filterGrupo?.value || "";
  const search = searchInput?.value.trim() || "";

  if (!cycleId) {
    alert("Selecciona un ciclo");
    return;
  }

  const params = new URLSearchParams({
    cycleId,
    grupo,
    search
  });

  const url = `${API}/api/student-payment-tracking/export-excel?${params.toString()}`;

  fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
    .then(async (res) => {
      if (!res.ok) {
        let mensaje = "Error al exportar Excel";
        try {
          const data = await res.json();
          mensaje = data.mensaje || mensaje;
        } catch {}
        throw new Error(mensaje);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      const disposition = res.headers.get("Content-Disposition") || "";
      let fileName = "colegiatura.xlsx";
      const match = disposition.match(/filename="(.+)"/);
      if (match && match[1]) {
        fileName = match[1];
      }

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    })
    .catch((error) => {
      console.error("Error al exportar Excel:", error);
      alert(error.message || "Error al exportar Excel");
    });
}

// ===============================
// INIT
// ===============================
loadCycles();
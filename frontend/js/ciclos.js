const API = "";
const token = localStorage.getItem("token");

const tbody = document.querySelector("#tablaCiclos tbody");
const formCycle = document.getElementById("formCycle");
const cycleName = document.getElementById("cycleName");
const cycleActive = document.getElementById("cycleActive");
const monthsContainer = document.getElementById("monthsContainer");
const btnAddMonth = document.getElementById("btnAddMonth");

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

function addMonthRow(key = "", label = "", order = "") {
  const div = document.createElement("div");
  div.className = "row g-2 mb-2 month-row";
  div.innerHTML = `
    <div class="col-md-4">
      <input type="text" class="form-control month-key" placeholder="key (ej. enero)" value="${key}">
    </div>
    <div class="col-md-4">
      <input type="text" class="form-control month-label" placeholder="label (ej. ENE)" value="${label}">
    </div>
    <div class="col-md-3">
      <input type="number" class="form-control month-order" placeholder="Orden" value="${order}">
    </div>
    <div class="col-md-1 d-flex align-items-center">
      <button type="button" class="btn btn-danger btn-sm btn-remove-month">X</button>
    </div>
  `;
  monthsContainer.appendChild(div);

  div.querySelector(".btn-remove-month").addEventListener("click", () => {
    div.remove();
  });
}

btnAddMonth.addEventListener("click", () => addMonthRow());

async function loadCycles() {
  try {
    const res = await fetch(`${API}/api/cycles`, {
      headers: authHeaders()
    });

    const data = await res.json();
    tbody.innerHTML = "";

    data.forEach(cycle => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${cycle.name}</td>
        <td>${cycle.months.map(m => m.label).join(", ")}</td>
        <td>
          ${cycle.isActive
            ? '<span class="badge bg-success">Sí</span>'
            : '<span class="badge bg-secondary">No</span>'}
        </td>
        <td>
          <button class="btn btn-sm btn-success me-2 btn-activate" data-id="${cycle._id}">
            Activar
          </button>
          <button class="btn btn-sm btn-warning btn-deactivate" data-id="${cycle._id}">
            Desactivar
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll(".btn-activate").forEach(btn => {
      btn.addEventListener("click", async () => {
        await fetch(`${API}/api/cycles/${btn.dataset.id}/activate`, {
          method: "PATCH",
          headers: authHeaders()
        });
        loadCycles();
      });
    });

    document.querySelectorAll(".btn-deactivate").forEach(btn => {
      btn.addEventListener("click", async () => {
        await fetch(`${API}/api/cycles/${btn.dataset.id}/deactivate`, {
          method: "PATCH",
          headers: authHeaders()
        });
        loadCycles();
      });
    });

  } catch (error) {
    console.error("Error cargando ciclos:", error);
  }
}

formCycle.addEventListener("submit", async (e) => {
  e.preventDefault();

  const months = [...document.querySelectorAll(".month-row")].map(row => ({
    key: row.querySelector(".month-key").value.trim(),
    label: row.querySelector(".month-label").value.trim(),
    order: Number(row.querySelector(".month-order").value)
  })).filter(m => m.key && m.label);

  const body = {
    name: cycleName.value.trim(),
    isActive: cycleActive.checked,
    months
  };

  const res = await fetch(`${API}/api/cycles`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.mensaje || "Error al guardar ciclo");
    return;
  }

  alert("Ciclo creado correctamente");
  formCycle.reset();
  monthsContainer.innerHTML = "";
  addMonthRow("inscripcion", "Inscripción", 1);
  bootstrap.Modal.getInstance(document.getElementById("modalCycle")).hide();
  loadCycles();
});

addMonthRow("inscripcion", "Inscripción", 1);
loadCycles();
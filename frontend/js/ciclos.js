const API = "";
const token = localStorage.getItem("token");

const tbody = document.querySelector("#tablaCiclos tbody");
const formCycle = document.getElementById("formCycle");
const cycleName = document.getElementById("cycleName");
const cycleActive = document.getElementById("cycleActive");
const monthsContainer = document.getElementById("monthsContainer");
const btnAddMonth = document.getElementById("btnAddMonth");
const btnNewCycle = document.getElementById("btnNewCycle");
const cycleModalTitle = document.getElementById("cycleModalTitle");
const btnSaveCycle = document.getElementById("btnSaveCycle");
const modalCycleElement = document.getElementById("modalCycle");

let editingCycleId = null;

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
      <input type="text" class="form-control month-key" placeholder="key (ej. enero)">
    </div>
    <div class="col-md-4">
      <input type="text" class="form-control month-label" placeholder="label (ej. ENE)">
    </div>
    <div class="col-md-3">
      <input type="number" class="form-control month-order" placeholder="Orden">
    </div>
    <div class="col-md-1 d-flex align-items-center">
      <button type="button" class="btn btn-danger btn-sm btn-remove-month">X</button>
    </div>
  `;
  monthsContainer.appendChild(div);

  div.querySelector(".month-key").value = key;
  div.querySelector(".month-label").value = label;
  div.querySelector(".month-order").value = order;

  div.querySelector(".btn-remove-month").addEventListener("click", () => {
    div.remove();
  });
}

btnAddMonth.addEventListener("click", () => addMonthRow());

function resetCycleForm() {
  editingCycleId = null;
  formCycle.reset();
  monthsContainer.innerHTML = "";
  addMonthRow("inscripcion", "Inscripción", 1);
  cycleModalTitle.textContent = "Nuevo ciclo";
  btnSaveCycle.textContent = "Guardar ciclo";
}

function openEditCycle(cycle) {
  editingCycleId = cycle._id;
  cycleName.value = cycle.name;
  cycleActive.checked = Boolean(cycle.isActive);
  monthsContainer.innerHTML = "";

  [...cycle.months]
    .sort((a, b) => a.order - b.order)
    .forEach(month => addMonthRow(month.key, month.label, month.order));

  cycleModalTitle.textContent = `Editar ciclo ${cycle.name}`;
  btnSaveCycle.textContent = "Guardar cambios";
  bootstrap.Modal.getOrCreateInstance(modalCycleElement).show();
}

btnNewCycle.addEventListener("click", resetCycleForm);

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
          <button class="btn btn-sm btn-primary me-2 btn-edit" data-id="${cycle._id}">
            Editar
          </button>
          <button class="btn btn-sm btn-success me-2 btn-activate" data-id="${cycle._id}">
            Activar
          </button>
          <button class="btn btn-sm btn-warning me-2 btn-deactivate" data-id="${cycle._id}">
            Desactivar
          </button>
          <button class="btn btn-sm btn-danger btn-delete" data-id="${cycle._id}">
            Eliminar
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

    document.querySelectorAll(".btn-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const cycle = data.find(item => item._id === btn.dataset.id);
        if (cycle) openEditCycle(cycle);
      });
    });

    document.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        const cycle = data.find(item => item._id === btn.dataset.id);
        const confirmed = confirm(
          `¿Seguro que deseas eliminar el ciclo "${cycle?.name || "seleccionado"}"? Esta acción no se puede deshacer.`
        );

        if (!confirmed) return;

        btn.disabled = true;

        try {
          const res = await fetch(`${API}/api/cycles/${btn.dataset.id}`, {
            method: "DELETE",
            headers: authHeaders()
          });
          const data = await res.json();

          if (!res.ok) {
            alert(data.mensaje || "Error al eliminar ciclo");
            return;
          }

          alert(data.mensaje || "Ciclo eliminado correctamente");
          await loadCycles();
        } catch (error) {
          console.error("Error eliminando ciclo:", error);
          alert("No se pudo conectar con el servidor para eliminar el ciclo");
        } finally {
          btn.disabled = false;
        }
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
    months
  };

  if (!editingCycleId) body.isActive = cycleActive.checked;

  const endpoint = editingCycleId
    ? `${API}/api/cycles/${editingCycleId}`
    : `${API}/api/cycles`;

  const res = await fetch(endpoint, {
    method: editingCycleId ? "PUT" : "POST",
    headers: authHeaders(),
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.mensaje || "Error al guardar ciclo");
    return;
  }

  if (editingCycleId) {
    const statusAction = cycleActive.checked ? "activate" : "deactivate";
    const statusRes = await fetch(`${API}/api/cycles/${editingCycleId}/${statusAction}`, {
      method: "PATCH",
      headers: authHeaders()
    });

    if (!statusRes.ok) {
      const statusData = await statusRes.json();
      alert(statusData.mensaje || "El ciclo se actualizó, pero no se pudo cambiar su estado");
      return;
    }
  }

  alert(data.mensaje || (editingCycleId ? "Ciclo actualizado correctamente" : "Ciclo creado correctamente"));
  bootstrap.Modal.getInstance(modalCycleElement).hide();
  resetCycleForm();
  await loadCycles();
});

resetCycleForm();
loadCycles();

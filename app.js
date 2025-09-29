console.log("✅ app.js loaded at", new Date().toISOString());

let currentPatientId = null;

// Utility: escape HTML
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return text.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Utility: format datetime
function formatDateTime(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleDateString();
  } catch {
    return dt;
  }
}

// ---------- Patients ----------

// Render patients
function renderPatients(rows) {
  const tbody = document.querySelector("#patientsTable tbody");
  tbody.innerHTML = "";
  if (!rows || rows.length === 0) {
    tbody.innerHTML = "<tr><td colspan='4'>No patients found</td></tr>";
    return;
  }
  rows.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.sex ?? "")}</td>
      <td>
        <button class="btn btn-sm btn-info" onclick="openVisits(${p.id}, '${escapeHtml(p.name)}')">Visits</button>
        <button class="btn btn-sm btn-warning" onclick="editPatient(${p.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deletePatient(${p.id})">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// Load patients
async function loadPatients() {
  console.log("📡 Fetching patients...");
  const res = await fetch("/api/patients");
  const data = await res.json();
  console.log("📋 Patients loaded:", data);
  renderPatients(data);
}

// Add / update patient
const patientForm = document.getElementById("patientForm");
patientForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("patientId").value;
  const payload = {
    name: document.getElementById("name").value,
    sex: document.getElementById("sex").value,
  };
  console.log("📤 Saving patient:", payload);

  const url = id ? `/api/patients/${id}` : "/api/patients";
  const method = id ? "PUT" : "POST";
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    alert("✅ Patient saved");
    patientForm.reset();
    document.getElementById("patientId").value = "";
    loadPatients();
  } else {
    const err = await res.text();
    console.error("❌ Error saving patient:", err);
    alert("Error saving patient");
  }
});

// Edit patient
async function editPatient(pid) {
  console.log("✏️ Editing patient", pid);
  const res = await fetch(`/api/patients/${pid}`);
  const p = await res.json();
  if (p.error) { alert(p.error); return; }
  document.getElementById("patientId").value = p.id;
  document.getElementById("name").value = p.name;
  document.getElementById("sex").value = p.sex || "";
  document.getElementById("deletePatientBtn").style.display = "inline-block";
}

// Delete patient
async function deletePatient(pid) {
  if (!confirm("Delete this patient and all visits?")) return;
  console.log("🗑️ Deleting patient", pid);
  const res = await fetch(`/api/patients/${pid}`, { method: "DELETE" });
  const resp = await res.json();
  if (resp.message) {
    alert("✅ Patient deleted");
    loadPatients();
  } else {
    alert("Error deleting patient");
  }
}

// Reset patient form
document.getElementById("patientReset").addEventListener("click", () => {
  patientForm.reset();
  document.getElementById("patientId").value = "";
  document.getElementById("deletePatientBtn").style.display = "none";
});

// ---------- Live Search with debounce ----------
let searchTimeout = null;
document.getElementById("searchBox").addEventListener("input", (e) => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();

  searchTimeout = setTimeout(async () => {
    if (!q) {
      loadPatients(); // reload all when empty
      return;
    }
    console.log("🔍 Searching patients:", q);
    const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderPatients(data);
  }, 400); // adjust debounce delay
});

// ---------- Visits ----------

// Render visits
function renderVisits(rows) {
  console.log("📋 Rendering visits:", rows);
  const visitsTable = document.getElementById("visitsTable");
  visitsTable.innerHTML = "";
  if (!rows || rows.length === 0) {
    visitsTable.innerHTML = "<tr><td colspan='9'>No visits yet</td></tr>";
    return;
  }
  rows.forEach(v => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateTime(v.visit_date || v.date)}</td>
      <td>${escapeHtml(v.age ?? "")}</td>
      <td>${escapeHtml(v.address ?? "")}</td>
      <td>${escapeHtml(v.status ?? "")}</td>
      <td>${escapeHtml(v.history || "")}</td>
      <td>${escapeHtml(v.pe || "")}</td>
      <td>${escapeHtml(v.diagnosis || "")}</td>
      <td>${escapeHtml(v.management || "")}</td>
      <td>
        <button class="btn btn-sm btn-warning" onclick="openEditVisit(${v.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="confirmDeleteVisit(${v.id})">Delete</button>
      </td>`;
    visitsTable.appendChild(tr);
  });
}

// Load visits
async function loadVisits(pid) {
  console.log("📡 Fetching visits for patient", pid);
  const res = await fetch(`/api/patients/${pid}/visits`);
  const data = await res.json();
  renderVisits(data);
}

// Open visits modal
function openVisits(pid, name) {
  console.log("🧾 Opening visits for", pid, name);
  currentPatientId = pid;
  document.getElementById("visitsPatientName").innerText = name;
  loadVisits(pid);
  new bootstrap.Modal(document.getElementById("visitsModal")).show();
}

// Add visit
const visitForm = document.getElementById("visitForm");
visitForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentPatientId) { alert("No patient selected"); return; }
  const payload = {
    visit_date: document.getElementById("v_visit_date").value || null,
    age: document.getElementById("v_age").value || null,
    address: document.getElementById("v_address").value || "",
    status: document.getElementById("v_status").value || "",
    history: document.getElementById("v_history").value || "",
    pe: document.getElementById("v_pe").value || "",
    diagnosis: document.getElementById("v_diagnosis").value || "",
    management: document.getElementById("v_management").value || "",
  };
  console.log("📤 Adding visit:", payload);
  const res = await fetch(`/api/patients/${currentPatientId}/visits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    alert("✅ Visit added");
    visitForm.reset();
    loadVisits(currentPatientId);
  } else {
    const err = await res.text();
    console.error("❌ Error adding visit:", err);
    alert("Error adding visit");
  }
});

// Edit visit
function openEditVisit(vid) {
  console.log("✏️ Opening edit modal for visit", vid);
  fetch(`/api/visits/${vid}`)
    .then(r => r.json())
    .then(v => {
      if (v.error) { alert(v.error); return; }
      document.getElementById("edit_visit_id").value = v.id;
      document.getElementById("edit_visit_date").value = v.visit_date ? v.visit_date.split(" ")[0] : "";
      document.getElementById("edit_age").value = v.age || "";
      document.getElementById("edit_address").value = v.address || "";
      document.getElementById("edit_status").value = v.status || "";
      document.getElementById("edit_history").value = v.history || "";
      document.getElementById("edit_pe").value = v.pe || "";
      document.getElementById("edit_diagnosis").value = v.diagnosis || "";
      document.getElementById("edit_management").value = v.management || "";
      new bootstrap.Modal(document.getElementById("editVisitModal")).show();
    })
    .catch(err => { console.error("❌ Error loading visit:", err); alert("Error loading visit"); });
}

document.getElementById("editVisitForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const vid = document.getElementById("edit_visit_id").value;
  const payload = {
    visit_date: document.getElementById("edit_visit_date").value || null,
    age: document.getElementById("edit_age").value || null,
    address: document.getElementById("edit_address").value || "",
    status: document.getElementById("edit_status").value || "",
    history: document.getElementById("edit_history").value || "",
    pe: document.getElementById("edit_pe").value || "",
    diagnosis: document.getElementById("edit_diagnosis").value || "",
    management: document.getElementById("edit_management").value || ""
  };
  console.log("📤 Updating visit:", payload);
  const res = await fetch(`/api/visits/${vid}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    alert("✅ Visit updated");
    bootstrap.Modal.getInstance(document.getElementById("editVisitModal")).hide();
    loadVisits(currentPatientId);
  } else {
    const err = await res.text();
    console.error("❌ Error updating visit:", err);
    alert("Error updating visit");
  }
});

// Delete visit
function confirmDeleteVisit(vid) {
  if (!confirm("Delete this visit?")) return;
  console.log("🗑️ Deleting visit", vid);
  fetch(`/api/visits/${vid}`, { method: "DELETE" })
    .then(r => r.json())
    .then(resp => {
      if (resp.message) {
        alert("✅ Visit deleted");
        loadVisits(currentPatientId);
      } else {
        alert("Error deleting visit");
      }
    })
    .catch(err => console.error("❌ Error deleting visit:", err));
}

// ---------- Init ----------
loadPatients();

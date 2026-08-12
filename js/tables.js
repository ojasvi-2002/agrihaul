// ============================================================
// js/tables.js  —  Table Rendering & Filtering
// ============================================================
// All functions that build HTML table rows from data objects.
// Column names match your AgriDispatch.xlsx exactly.
//
// FIXED IN THIS AUDIT:
//   - Every field that can originate from a farmer's SMS, a driver's
//     name, or the Add Farmer/Add Truck forms was being interpolated
//     straight into innerHTML with no escaping. A farmer texting a
//     "name" of e.g. <img src=x onerror=...> (or anyone submitting
//     that through the Add Farmer modal) would have it execute in the
//     ops dashboard — a stored XSS hole. Everything user-controlled
//     now goes through escapeHtml() first.
//   - Added a Delete action to the Farmers and Trucks tables (see
//     requestDeleteFarmer() / requestDeleteTruck() in app.js). Dynamic
//     values are passed via data-* attributes rather than interpolated
//     into the onclick string, so a stray quote in a name/phone can't
//     break out of the handler and inject arbitrary JS.
// ============================================================

// ── ESCAPING HELPER ───────────────────────────────────────────
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

// ── DASHBOARD METRICS ────────────────────────────────────────
function renderMetrics(farmers, trucks, dispatches) {
  const available  = trucks.filter(t => t.Status === "Available").length;
  const enRoute    = trucks.filter(t => t.Status === "En Route").length;
  const maintenance= trucks.filter(t => t.Status === "Maintenance").length;

  const todayStr   = new Date().toISOString().slice(0,10);
  const todayTrips = dispatches.filter(d => d.Date === todayStr);
  const totalWeight= todayTrips.reduce((s, d) => s + parseFloat(d.WeightKG || 0), 0);

  setEl("m-available",  available);
  setEl("m-available-sub", `${enRoute} en route · ${maintenance} maintenance`);
  setEl("m-dispatched", todayTrips.length);
  setEl("m-weight",     totalWeight >= 1000
    ? (totalWeight/1000).toFixed(1) + " t"
    : totalWeight + " kg");
  setEl("m-farmers",    farmers.length);

  // Sidebar stat footer
  setEl("sf-available",  available);
  setEl("sf-enroute",    enRoute);
  setEl("sf-farmers",    farmers.length);

  // Nav badge
  setEl("dispatchBadge", dispatches.length);
}

// ── RECENT DISPATCH TABLE (dashboard) ────────────────────────
function renderRecentDispatches(dispatches) {
  const tbody = document.getElementById("recentDispatchTable");
  if (!tbody) return;
  tbody.innerHTML = dispatches.slice(0, 8).map(d => `
    <tr>
      <td class="mono">${escapeHtml(d.Time)}</td>
      <td class="primary">${escapeHtml(d.Farmer)}</td>
      <td>${escapeHtml(d.Village)}</td>
      <td class="mono">${Number(d.WeightKG || 0).toLocaleString()} kg</td>
      <td>${escapeHtml(d.Driver)}</td>
      <td class="mono">${escapeHtml(d.DistanceKM)} km</td>
    </tr>`).join("");
}

// ── DASHBOARD TRUCK SNAPSHOT (right column) ──────────────────
function renderDashTrucks(trucks) {
  const tbody = document.getElementById("dashTruckTable");
  if (!tbody) return;
  tbody.innerHTML = trucks.slice(0, 12).map(t => `
    <tr>
      <td class="mono primary">${escapeHtml(t.TruckID)}</td>
      <td>${escapeHtml((t.DriverName || "").split(" ")[0])}</td>
      <td>${statusBadge(t.Status)}</td>
    </tr>`).join("");
}

// ── FULL DISPATCH LOG TABLE ───────────────────────────────────
let _allDispatches = [];

function renderDispatchTable(dispatches, highlightFirst = false) {
  const tbody = document.getElementById("dispatchTable");
  if (!tbody) return;
  tbody.innerHTML = dispatches.map((d, i) => `
    <tr ${highlightFirst && i === 0 ? 'class="row-new"' : ""}>
      <td class="mono">${escapeHtml(d.Date)}</td>
      <td class="mono">${escapeHtml(d.Time)}</td>
      <td class="primary">${escapeHtml(d.Farmer)}</td>
      <td>${escapeHtml(d.Village)}</td>
      <td class="mono">${Number(d.WeightKG || 0).toLocaleString()}</td>
      <td>${escapeHtml(d.Driver)}</td>
      <td class="mono">${escapeHtml(d.TruckID)}</td>
      <td class="mono">${escapeHtml(d.DistanceKM)} km</td>
    </tr>`).join("");
}

function filterDispatch() {
  const q = (document.getElementById("dispatchSearch")?.value || "").toLowerCase();
  const filtered = _allDispatches.filter(d =>
    `${d.Farmer} ${d.Village} ${d.Driver} ${d.TruckID}`.toLowerCase().includes(q)
  );
  renderDispatchTable(filtered);
}

// ── FULL TRUCKS TABLE ─────────────────────────────────────────
let _allTrucks = [];

function renderTruckTable(trucks) {
  const tbody = document.getElementById("truckTable");
  if (!tbody) return;
  tbody.innerHTML = trucks.map(t => `
    <tr>
      <td class="mono primary">${escapeHtml(t.TruckID)}</td>
      <td>${escapeHtml(t.DriverName)}</td>
      <td class="mono" style="font-size:11px">${escapeHtml(t.Phone)}</td>
      <td>${statusBadge(t.Status)}</td>
      <td class="mono">${escapeHtml(t.Lat)}</td>
      <td class="mono">${escapeHtml(t.Lon)}</td>
      <td class="mono" style="font-size:11px">${escapeHtml(t.LastUpdated)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm"
          data-truck-id="${escapeHtml(t.TruckID)}"
          onclick="cycleStatus(this.dataset.truckId)">
          Toggle
        </button>
        <button class="btn btn-danger btn-sm"
          data-truck-id="${escapeHtml(t.TruckID)}"
          data-truck-label="${escapeHtml(t.TruckID + ' — ' + (t.DriverName || ''))}"
          onclick="requestDeleteTruck(this.dataset.truckId, this.dataset.truckLabel)">
          Delete
        </button>
      </td>
    </tr>`).join("");
}

function filterTrucks() {
  const q = (document.getElementById("truckSearch")?.value || "").toLowerCase();
  const filtered = _allTrucks.filter(t =>
    `${t.TruckID} ${t.DriverName}`.toLowerCase().includes(q)
  );
  renderTruckTable(filtered);
}

// ── FULL FARMERS TABLE ────────────────────────────────────────
let _allFarmers = [];

function renderFarmerTable(farmers) {
  const tbody = document.getElementById("farmerTable");
  if (!tbody) return;
  tbody.innerHTML = farmers.map(f => `
    <tr>
      <td class="primary">${escapeHtml(f.Name)}</td>
      <td class="mono" style="font-size:11px">${escapeHtml(f.Phone)}</td>
      <td>${escapeHtml(f.Village)}</td>
      <td class="mono">${escapeHtml(f.Lat)}</td>
      <td class="mono">${escapeHtml(f.Lon)}</td>
      <td class="mono" style="font-size:11px">${escapeHtml(f.Registered)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-danger btn-sm"
          data-phone="${escapeHtml(f.Phone)}"
          data-name="${escapeHtml(f.Name)}"
          onclick="requestDeleteFarmer(this.dataset.phone, this.dataset.name)">
          Delete
        </button>
      </td>
    </tr>`).join("");
}

function filterFarmers() {
  const q = (document.getElementById("farmerSearch")?.value || "").toLowerCase();
  const filtered = _allFarmers.filter(f =>
    `${f.Name} ${f.Village} ${f.Phone}`.toLowerCase().includes(q)
  );
  renderFarmerTable(filtered);
}

// ── INCOMING REQUESTS TABLE ───────────────────────────────────
// Renders the parsed SMS intake queue built by buildRequestQueue()
// in intake.js. Actions differ by status, so the row markup is
// generated per-request rather than as one shared template.

const REQUEST_STATUS = {
  ready:     { label: "Ready to confirm",          cls: "available" },
  confirmed: { label: "Confirmed, needs a truck",   cls: "dispatched" },
  dispatched:{ label: "Dispatched",                 cls: "available" },
  review:    { label: "Needs review",               cls: "unavailable" },
  duplicate: { label: "Possible duplicate",         cls: "unavailable" },
};

function requestStatusBadge(status) {
  const s = REQUEST_STATUS[status] || REQUEST_STATUS.review;
  return `<span class="badge ${s.cls}">${escapeHtml(s.label)}</span>`;
}

let _allRequests = [];

function renderRequestsTable(queue, trucks) {
  const tbody = document.getElementById("requestsTable");
  if (!tbody) return;

  const availableTrucks = (trucks || []).filter(t => t.Status === "Available");
  const truckOptions = availableTrucks
    .map(t => `<option value="${escapeHtml(t.TruckID)}">${escapeHtml(t.TruckID)} — ${escapeHtml((t.DriverName || "").split(" ")[0])}</option>`)
    .join("");

  tbody.innerHTML = queue.map(r => {
    const f = r.fields;
    const parsedSummary = [f.name, f.product,
      f.quantity != null ? `${f.quantity} ${f.unit}` : null, f.location]
      .filter(Boolean).map(escapeHtml).join(" · ") || "—";

    let actions = "";
    if (r.status === "review") {
      actions = `<div class="form-hint" style="margin:0 0 4px">${escapeHtml(r.issues.join(", "))}</div>
        <button class="btn btn-ghost btn-sm" onclick="discardRequest('${r.id}')">Discard</button>`;
    } else if (r.status === "duplicate") {
      actions = `<button class="btn btn-ghost btn-sm" onclick="confirmRequest('${r.id}')">Keep anyway</button>
        <button class="btn btn-ghost btn-sm" onclick="discardRequest('${r.id}')">Discard</button>`;
    } else if (r.status === "ready") {
      actions = `<button class="btn btn-ghost btn-sm" onclick="confirmRequest('${r.id}')">
        ${r.farmerKnown ? "Confirm" : "Approve &amp; register farmer"}</button>`;
    } else if (r.status === "confirmed") {
      actions = `<select class="form-select" id="truckSel-${r.id}" style="font-size:11px;padding:5px 8px">
          <option value="">Assign truck…</option>${truckOptions}
        </select>
        <button class="btn btn-ghost btn-sm" onclick="dispatchRequest('${r.id}', document.getElementById('truckSel-${r.id}').value)">Dispatch</button>`;
    } else {
      actions = `<span class="form-hint">Logged in Dispatch Log</span>`;
    }

    return `
    <tr>
      <td class="mono" style="font-size:11px">${escapeHtml(r.receivedAt)}</td>
      <td class="mono" style="font-size:11px">${escapeHtml(r.phone)}</td>
      <td class="mono" style="font-size:11px">${escapeHtml(r.raw)}</td>
      <td>${parsedSummary}</td>
      <td>${requestStatusBadge(r.status)}</td>
      <td>${actions}</td>
    </tr>`;
  }).join("");
}

function updateRequestsBadge(queue) {
  const pending = queue.filter(r => r.status === "ready" || r.status === "review").length;
  const el = document.getElementById("requestsBadge");
  if (!el) return;
  el.textContent = pending;
  el.classList.toggle("warn", queue.some(r => r.status === "review"));
}

function filterRequests() {
  const q = (document.getElementById("requestSearch")?.value || "").toLowerCase();
  const filtered = _allRequests.filter(r =>
    `${r.phone} ${r.raw} ${r.fields.name} ${r.fields.product} ${r.fields.location}`
      .toLowerCase().includes(q)
  );
  renderRequestsTable(filtered, _allTrucks);
}

// ── SMALL UTILITIES ───────────────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

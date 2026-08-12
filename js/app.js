// ============================================================
// js/app.js  —  Page Routing, Auth Flow, Actions
// ============================================================
// THIS FILE WAS MISSING FROM THE REPO.
//
// What shipped as js/app.js was actually a stray copy of js/data.js
// (same seed data, same fetchSheet/postToSheet/loadAllData code, just
// a slightly older version). That means none of the behaviour
// index.html already wires up by name — doLogin(), doSignUp(),
// setLoginMode(), showPage(), toggleTheme(), openModal()/closeModal(),
// addTruck(), addFarmer(), cycleStatus(), ingestMessages(),
// loadIntakeExample(), simulateIncomingSMS(), simulateDispatch(),
// confirmRequest()/dispatchRequest()/discardRequest(), doLogout() —
// existed anywhere in the codebase. Every one of those onclick
// handlers would throw "ReferenceError: X is not defined" the moment
// it was clicked, and the login button did literally nothing. This
// file replaces that duplicate with the real application logic.
//
// Load order (index.html): config.js → auth.js → data.js → intake.js
// → map.js → tables.js → app.js — so every helper this file calls
// (signInWithPassword, loadAllData, renderFarmerTable, escapeHtml,
// buildRequestQueue, haversineKm, statusBadge, …) is already defined
// by the time these functions run.
// ============================================================

// ── APP STATE ────────────────────────────────────────────────
let _farmers      = [];
let _trucks       = [];
let _dispatches   = [];
let _rawRequests  = [];
let _requestQueue = [];

let _authView  = "signin";   // "signin" | "signup"
let _loginMode = "password"; // "password" | "magiclink" | "otp"
let _otpStage  = "request";  // "request" | "verify"

let _pendingDelete  = null;  // { type: "farmer"|"truck", key, label }
let _refreshTimer   = null;
let _toastTimer     = null;
let _clockTimer     = null;

// ── BOOTSTRAP ────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  restoreTheme();
  startClock();
  wireEnterKey();
  enterSigninView();

  // Catches the redirect back from a magic-link email, and keeps
  // things in sync if the session is revoked/refreshed in another tab.
  onAuthChange((session) => {
    const inApp = document.getElementById("mainApp").style.display === "grid";
    if (session && !inApp) {
      finishLogin();
    } else if (!session && inApp) {
      showLoginScreen();
    }
  });

  try {
    const profile = await loadSession();
    if (profile) {
      await enterApp();
      return;
    }
  } catch (err) {
    console.warn("[AgriHaul] Session check failed:", err.message);
  }
  showLoginScreen();
}

function showLoginScreen() {
  document.getElementById("mainApp").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
  clearInterval(_refreshTimer);
}

async function enterApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("mainApp").style.display = "grid";

  const profile = currentProfile();
  document.getElementById("clientLabel").textContent =
    profile?.client_name || window.CONFIG?.APP?.CLIENT_NAME || "AgriHaul";

  applyRolePermissions();

  try {
    await loadAndRenderAll();
  } catch (err) {
    console.error("[AgriHaul] Initial data load failed:", err);
    showToast("Couldn't load data. Check the console for details.", true);
  }

  startAutoRefresh();

  const role = currentRole() || "viewer";
  const firstPage = (ROLE_PAGES[role] || ["dashboard"])[0] || "dashboard";
  showPage(firstPage, document.querySelector(`[data-page="${firstPage}"]`));
}

// ── THEME TOGGLE ─────────────────────────────────────────────
function restoreTheme() {
  const saved = localStorage.getItem("agrihaulTheme");
  if (saved === "light") document.documentElement.classList.add("light");
  syncThemeButtons();
}

function toggleTheme() {
  document.documentElement.classList.toggle("light");
  localStorage.setItem(
    "agrihaulTheme",
    document.documentElement.classList.contains("light") ? "light" : "dark"
  );
  syncThemeButtons();
}

function syncThemeButtons() {
  const icon = document.documentElement.classList.contains("light") ? "☾" : "☀";
  const loginBtn = document.getElementById("loginThemeBtn");
  const appBtn = document.getElementById("themeBtn");
  if (loginBtn) loginBtn.textContent = icon;
  if (appBtn) appBtn.textContent = icon;
}

// ── LIVE CLOCK (topbar) ──────────────────────────────────────
function startClock() {
  const el = document.getElementById("liveTime");
  if (!el) return;
  const tick = () => { el.textContent = new Date().toLocaleTimeString(); };
  tick();
  clearInterval(_clockTimer);
  _clockTimer = setInterval(tick, 1000);
}

// ── TOAST ────────────────────────────────────────────────────
function showToast(message, isError = false) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("toast-error", !!isError);
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

// ── MODALS (generic open/close by name → #modal-<name>) ─────
function openModal(name) {
  document.getElementById("modal-" + name)?.classList.add("open");
}

function closeModal(name) {
  document.getElementById("modal-" + name)?.classList.remove("open");
}

function clearFields(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

// ============================================================
// LOGIN / SIGNUP
// ============================================================

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function wireEnterKey() {
  ["loginEmail", "loginPass", "loginOtp", "loginName"].forEach(id => {
    document.getElementById(id)?.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); handleAuthSubmit(); }
    });
  });
}

// The one button on the login card dispatches to login or signup
// depending on which view is currently showing, so index.html only
// ever needs a single, stable onclick target.
function handleAuthSubmit() {
  if (_authView === "signup") return doSignUp();
  return doLogin();
}

function setLoginMode(mode) {
  _loginMode = mode;
  _otpStage = "request";

  ["password", "magiclink", "otp"].forEach(m => {
    const tab = document.getElementById("tab-" + m);
    if (!tab) return;
    tab.classList.toggle("btn-primary", m === mode);
    tab.classList.toggle("btn-ghost", m !== mode);
  });

  const passField = document.getElementById("loginPassField");
  const otpField  = document.getElementById("loginOtpField");
  if (passField) passField.style.display = mode === "password" ? "" : "none";
  if (otpField)  otpField.style.display  = "none";
  const otpInput = document.getElementById("loginOtp");
  if (otpInput) otpInput.value = "";

  updateLoginButtonLabel();
}

function updateLoginButtonLabel() {
  const btn = document.getElementById("loginBtn");
  if (!btn) return;
  if (_authView === "signup") { btn.textContent = "Create account →"; return; }
  if (_loginMode === "password")   btn.textContent = "Sign in →";
  else if (_loginMode === "magiclink") btn.textContent = "Email me a link →";
  else if (_loginMode === "otp")   btn.textContent = _otpStage === "request" ? "Send code →" : "Verify code →";
}

function enterSignupView() {
  _authView = "signup";
  const tabs = document.getElementById("loginModeTabs");
  const nameField = document.getElementById("loginNameField");
  const passField = document.getElementById("loginPassField");
  const otpField  = document.getElementById("loginOtpField");
  if (tabs) tabs.style.display = "none";
  if (nameField) nameField.style.display = "";
  if (passField) passField.style.display = "";
  if (otpField)  otpField.style.display = "none";

  const status = document.getElementById("loginStatus");
  if (status) status.innerHTML = 'Already have an account? <a href="#" onclick="enterSigninView();return false;">Sign in</a>';
  updateLoginButtonLabel();
}

function enterSigninView() {
  _authView = "signin";
  const tabs = document.getElementById("loginModeTabs");
  const nameField = document.getElementById("loginNameField");
  if (tabs) tabs.style.display = "flex";
  if (nameField) nameField.style.display = "none";

  const status = document.getElementById("loginStatus");
  if (status) status.innerHTML = 'New here? <a href="#" onclick="toggleAuthView();return false;">Create an account</a>';
  setLoginMode("password");
}

function toggleAuthView() {
  if (_authView === "signup") enterSigninView();
  else enterSignupView();
}

// Kept for compatibility with the "Create an account" link markup.
function doSignUpLinkFallback() { toggleAuthView(); }

async function doLogin() {
  const emailEl = document.getElementById("loginEmail");
  const email = (emailEl?.value || "").trim();
  if (!isValidEmail(email)) { showToast("Enter a valid email address.", true); return; }

  const btn = document.getElementById("loginBtn");
  const originalLabel = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }

  try {
    if (_loginMode === "password") {
      const pass = document.getElementById("loginPass")?.value || "";
      if (!pass) { showToast("Enter your password.", true); return; }
      const res = await signInWithPassword(email, pass);
      if (!res.ok) { showToast(res.error || "Sign in failed.", true); return; }
      await finishLogin();

    } else if (_loginMode === "magiclink") {
      const res = await sendMagicLink(email);
      if (!res.ok) { showToast(res.error || "Couldn't send magic link.", true); return; }
      showToast("Check your email for a sign-in link.");

    } else if (_loginMode === "otp") {
      if (_otpStage === "request") {
        const res = await sendEmailOtp(email);
        if (!res.ok) { showToast(res.error || "Couldn't send code.", true); return; }
        _otpStage = "verify";
        const otpField = document.getElementById("loginOtpField");
        if (otpField) otpField.style.display = "";
        showToast("Enter the 6-digit code we emailed you.");
      } else {
        const code = (document.getElementById("loginOtp")?.value || "").trim();
        if (!/^\d{6}$/.test(code)) { showToast("Enter the 6-digit code.", true); return; }
        const res = await verifyEmailOtp(email, code);
        if (!res.ok) { showToast(res.error || "Invalid or expired code.", true); return; }
        await finishLogin();
      }
    }
  } catch (err) {
    console.error("[AgriHaul] Login error:", err);
    showToast(err.message || "Something went wrong signing in.", true);
  } finally {
    if (btn) btn.disabled = false;
    updateLoginButtonLabel();
  }
}

async function doSignUp() {
  const name  = (document.getElementById("loginName")?.value || "").trim();
  const email = (document.getElementById("loginEmail")?.value || "").trim();
  const pass  = document.getElementById("loginPass")?.value || "";

  if (!name)                 { showToast("Enter your full name.", true); return; }
  if (!isValidEmail(email))  { showToast("Enter a valid email address.", true); return; }
  if (pass.length < 8)       { showToast("Password must be at least 8 characters.", true); return; }

  const btn = document.getElementById("loginBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }

  try {
    const res = await signUp(email, pass, name);
    if (!res.ok) { showToast(res.error || "Sign up failed.", true); return; }

    if (res.needsVerification) {
      showToast("Account created — check your email to confirm it, then sign in.");
      enterSigninView();
      const emailEl = document.getElementById("loginEmail");
      if (emailEl) emailEl.value = email;
    } else {
      await finishLogin();
    }
  } catch (err) {
    console.error("[AgriHaul] Sign up error:", err);
    showToast(err.message || "Something went wrong signing up.", true);
  } finally {
    if (btn) btn.disabled = false;
    updateLoginButtonLabel();
  }
}

async function finishLogin() {
  const profile = await loadSession();
  if (!profile) {
    showToast("Signed in, but no profile is set up for this account yet. Contact an admin.", true);
    await signOut();
    return;
  }
  await enterApp();
}

async function doLogout() {
  await signOut();
  showLoginScreen();
  showToast("Signed out.");
}

// ── ROLE-BASED NAV / ROUTING ──────────────────────────────────
function applyRolePermissions() {
  const role = currentRole() || "viewer";
  const allowed = ROLE_PAGES[role] || ROLE_PAGES.viewer;
  document.querySelectorAll(".nav-item[data-page]").forEach(item => {
    const page = item.getAttribute("data-page");
    item.style.display = allowed.includes(page) ? "" : "none";
  });
}

function showPage(pageId, navEl) {
  if (!canAccessPage(pageId)) {
    showToast("You don't have access to that page.", true);
    return;
  }
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + pageId)?.classList.add("active");
  document.querySelectorAll(".nav-item[data-page]").forEach(n => n.classList.remove("active"));
  if (navEl) navEl.classList.add("active");

  // The map canvas has zero width/height while its .page is
  // display:none, so pins must be (re-)placed only once it's visible.
  if (pageId === "map") renderMap(_farmers, _trucks);
}

// ============================================================
// DATA LOAD / AUTO-REFRESH
// ============================================================

async function loadAndRenderAll() {
  const data = await loadAllData();
  _farmers     = data.farmers;
  _trucks      = data.trucks;
  _dispatches  = data.dispatches;
  _rawRequests = data.requests;
  _requestQueue = buildRequestQueue(_rawRequests, _farmers, _requestQueue);

  _allFarmers    = _farmers;
  _allTrucks     = _trucks;
  _allDispatches = _dispatches;
  _allRequests   = _requestQueue;

  renderMetrics(_farmers, _trucks, _dispatches);
  renderRecentDispatches(_dispatches);
  renderDashTrucks(_trucks);
  renderDispatchTable(_dispatches);
  renderTruckTable(_trucks);
  renderFarmerTable(_farmers);
  renderRequestsTable(_requestQueue, _trucks);
  updateRequestsBadge(_requestQueue);

  if (document.getElementById("page-map")?.classList.contains("active")) {
    renderMap(_farmers, _trucks);
  }
}

function startAutoRefresh() {
  const interval = window.CONFIG?.SHEETS?.REFRESH_INTERVAL || 30000;
  clearInterval(_refreshTimer);
  _refreshTimer = setInterval(async () => {
    try {
      await loadAndRenderAll();
      showToast("Data refreshed");
    } catch (err) {
      console.warn("[AgriHaul] Auto-refresh failed:", err.message);
    }
  }, interval);
}

// ============================================================
// FARMERS — add / delete
// ============================================================

async function addFarmer() {
  const name    = (document.getElementById("f-farmerName")?.value || "").trim();
  const phone   = (document.getElementById("f-farmerPhone")?.value || "").trim();
  const village = (document.getElementById("f-farmerVillage")?.value || "").trim();
  const latRaw  = (document.getElementById("f-farmerLat")?.value || "").trim();
  const lonRaw  = (document.getElementById("f-farmerLon")?.value || "").trim();

  if (!name)  { showToast("Farmer name is required.", true); return; }
  if (!phone) { showToast("Farmer phone is required.", true); return; }
  if (_farmers.some(f => normalizePhone(f.Phone) === normalizePhone(phone))) {
    showToast("A farmer with this phone number is already registered.", true);
    return;
  }
  if ((latRaw && isNaN(parseFloat(latRaw))) || (lonRaw && isNaN(parseFloat(lonRaw)))) {
    showToast("GPS Lat/Lon must be numbers.", true);
    return;
  }

  const farmer = {
    Name: name,
    Phone: phone,
    Village: village || "—",
    Lat: latRaw ? parseFloat(latRaw) : "",
    Lon: lonRaw ? parseFloat(lonRaw) : "",
    Registered: new Date().toISOString().slice(0, 10),
  };

  _farmers.unshift(farmer);
  _allFarmers = _farmers;
  renderFarmerTable(_farmers);
  renderMetrics(_farmers, _trucks, _dispatches);
  renderMap(_farmers, _trucks);

  closeModal("addFarmer");
  clearFields(["f-farmerName", "f-farmerPhone", "f-farmerVillage", "f-farmerLat", "f-farmerLon"]);

  const result = await postToSheet("addFarmer", farmer);
  if (result.ok) {
    showToast(`${name} added and synced to Sheets.`);
  } else if (result.error === "WRITE_URL not configured") {
    showToast(`${name} added locally (Sheets sync isn't configured).`);
  } else {
    showToast(`${name} added locally — Sheets sync failed: ${result.error || "unknown error"}`, true);
  }
}

function requestDeleteFarmer(phone, name) {
  if (!phone) return;
  _pendingDelete = { type: "farmer", key: phone, label: name || phone };
  document.getElementById("confirmDeleteTitle").textContent = "Delete farmer?";
  document.getElementById("confirmDeleteBody").textContent =
    `This removes ${name || "this farmer"} (${phone}) from the Farmers sheet. This can't be undone.`;
  openModal("confirmDelete");
}

// ============================================================
// TRUCKS — add / toggle / delete
// ============================================================

async function addTruck() {
  const truckId  = (document.getElementById("f-truckId")?.value || "").trim();
  const driver   = (document.getElementById("f-driverName")?.value || "").trim();
  const phone    = (document.getElementById("f-driverPhone")?.value || "").trim();
  const status   = document.getElementById("f-truckStatus")?.value || "Available";
  const latRaw   = (document.getElementById("f-truckLat")?.value || "").trim();
  const lonRaw   = (document.getElementById("f-truckLon")?.value || "").trim();

  if (!truckId) { showToast("Truck ID is required.", true); return; }
  if (!driver)  { showToast("Driver name is required.", true); return; }
  if (!phone)   { showToast("Driver phone is required.", true); return; }
  if (_trucks.some(t => t.TruckID.toLowerCase() === truckId.toLowerCase())) {
    showToast(`Truck ID ${truckId} is already in use.`, true);
    return;
  }
  if ((latRaw && isNaN(parseFloat(latRaw))) || (lonRaw && isNaN(parseFloat(lonRaw)))) {
    showToast("GPS Lat/Lon must be numbers.", true);
    return;
  }

  const now = new Date();
  const truck = {
    TruckID: truckId,
    DriverName: driver,
    Phone: phone,
    Status: status,
    Lat: latRaw ? parseFloat(latRaw) : "",
    Lon: lonRaw ? parseFloat(lonRaw) : "",
    LastUpdated: now.toISOString().slice(0, 16).replace("T", " "),
  };

  _trucks.unshift(truck);
  _allTrucks = _trucks;
  renderTruckTable(_trucks);
  renderDashTrucks(_trucks);
  renderMetrics(_farmers, _trucks, _dispatches);
  renderMap(_farmers, _trucks);

  closeModal("addTruck");
  clearFields(["f-truckId", "f-driverName", "f-driverPhone", "f-truckLat", "f-truckLon"]);
  const statusSel = document.getElementById("f-truckStatus");
  if (statusSel) statusSel.value = "Available";

  const result = await postToSheet("addTruck", truck);
  if (result.ok) {
    showToast(`${truckId} added and synced to Sheets.`);
  } else if (result.error === "WRITE_URL not configured") {
    showToast(`${truckId} added locally (Sheets sync isn't configured).`);
  } else {
    showToast(`${truckId} added locally — Sheets sync failed: ${result.error || "unknown error"}`, true);
  }
}

// Cycles Available → En Route → Maintenance → Available. Local-only
// by design (see manual.html) — it's meant as a quick dashboard
// override, not a source of truth; edit the sheet directly, or wait
// for the driver's ON/OFF/DONE SMS, to persist a status change.
function cycleStatus(truckId) {
  const order = ["Available", "En Route", "Maintenance"];
  const truck = _trucks.find(t => t.TruckID === truckId);
  if (!truck) return;
  const idx = order.indexOf(truck.Status);
  truck.Status = order[(idx + 1) % order.length];
  renderTruckTable(_trucks);
  renderDashTrucks(_trucks);
  renderMetrics(_farmers, _trucks, _dispatches);
  renderMap(_farmers, _trucks);
  showToast(`${truckId} → ${truck.Status} (local only — edit the sheet to persist)`);
}

function requestDeleteTruck(truckId, label) {
  if (!truckId) return;
  _pendingDelete = { type: "truck", key: truckId, label: label || truckId };
  document.getElementById("confirmDeleteTitle").textContent = "Delete truck?";
  document.getElementById("confirmDeleteBody").textContent =
    `This removes ${label || truckId} from the Trucks sheet. This can't be undone.`;
  openModal("confirmDelete");
}

// ── SHARED DELETE CONFIRMATION ────────────────────────────────
// Backs the confirm-delete modal used by both requestDeleteFarmer()
// and requestDeleteTruck(). Talks to Code.gs via deleteFromSheet()
// (js/data.js), which reports back a real { ok, error } result — so
// unlike the old fire-and-forget postToSheet(), this can actually
// tell the person whether the delete synced to the spreadsheet or
// only happened locally, and roll the row back into view if it
// failed server-side.
async function runConfirmedDelete() {
  if (!_pendingDelete) { closeModal("confirmDelete"); return; }
  const { type, key, label } = _pendingDelete;
  const btn = document.getElementById("confirmDeleteBtn");
  const originalLabel = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Deleting…"; }

  try {
    if (type === "farmer") {
      const result = await deleteFromSheet("deleteFarmer", { Phone: key });
      if (!result.ok) throw new Error(result.error || "Delete failed");
      _farmers = _farmers.filter(f => normalizePhone(f.Phone) !== normalizePhone(key));
      _allFarmers = _farmers;
      renderFarmerTable(_farmers);
      renderMetrics(_farmers, _trucks, _dispatches);
      renderMap(_farmers, _trucks);
      showToast(`${label} deleted and removed from Sheets.`);

    } else if (type === "truck") {
      const result = await deleteFromSheet("deleteTruck", { TruckID: key });
      if (!result.ok) throw new Error(result.error || "Delete failed");
      _trucks = _trucks.filter(t => t.TruckID !== key);
      _allTrucks = _trucks;
      renderTruckTable(_trucks);
      renderDashTrucks(_trucks);
      renderMetrics(_farmers, _trucks, _dispatches);
      renderMap(_farmers, _trucks);
      showToast(`${label} deleted and removed from Sheets.`);
    }
    closeModal("confirmDelete");
  } catch (err) {
    showToast(`Couldn't delete ${label}: ${err.message}`, true);
    // Leave the modal open so the person can see the error and retry,
    // rather than silently pretending the delete happened.
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
    _pendingDelete = null;
  }
}

// ============================================================
// REQUESTS (SMS intake) — ingest / confirm / dispatch / discard
// ============================================================

function loadIntakeExample() {
  const el = document.getElementById("intakeText");
  if (el) el.value = "KWAME - RED OIL - 200L - AJUMAKO";
}

function ingestMessages() {
  const textarea = document.getElementById("intakeText");
  const lines = (textarea?.value || "").split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) { showToast("Paste at least one message first.", true); return; }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const newRows = lines.map(raw => ({ Phone: "+000 00 000 0000", Raw: raw, ReceivedAt: stamp }));

  _rawRequests = _rawRequests.concat(newRows);
  _requestQueue = buildRequestQueue(_rawRequests, _farmers, _requestQueue);
  _allRequests = _requestQueue;
  renderRequestsTable(_requestQueue, _trucks);
  updateRequestsBadge(_requestQueue);

  if (textarea) textarea.value = "";
  newRows.forEach(r => postToSheet("addRequest", r));
  showToast(`Ingested ${lines.length} message${lines.length === 1 ? "" : "s"}.`);
}

function simulateIncomingSMS() {
  const samples = [
    "AMINA - MAIZE - 120KG - THIES",
    "KOJO - YAM - 300KG - KUMASI",
    "FATOU - COCOA - 90KG - BOUAKE",
    "ADJOA - PALM OIL - 60L - TAMALE",
  ];
  const raw = samples[Math.floor(Math.random() * samples.length)];
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const entry = {
    Phone: "+000 00 000 " + String(Math.floor(1000 + Math.random() * 9000)),
    Raw: raw,
    ReceivedAt: stamp,
  };

  _rawRequests = _rawRequests.concat([entry]);
  _requestQueue = buildRequestQueue(_rawRequests, _farmers, _requestQueue);
  _allRequests = _requestQueue;
  renderRequestsTable(_requestQueue, _trucks);
  updateRequestsBadge(_requestQueue);
  showToast("Simulated an incoming SMS.");
}

function confirmRequest(id) {
  const req = _requestQueue.find(r => r.id === id);
  if (!req) return;

  if (!req.farmerKnown) {
    const newFarmer = {
      Name: req.fields.name || req.farmerName || "Unknown",
      Phone: req.phone,
      Village: req.fields.location || "—",
      Lat: "",
      Lon: "",
      Registered: new Date().toISOString().slice(0, 10),
    };
    _farmers.unshift(newFarmer);
    _allFarmers = _farmers;
    renderFarmerTable(_farmers);
    renderMetrics(_farmers, _trucks, _dispatches);
    postToSheet("addFarmer", newFarmer);
    req.farmerKnown = true;
  }

  req.status = "confirmed";
  _allRequests = _requestQueue;
  renderRequestsTable(_requestQueue, _trucks);
  updateRequestsBadge(_requestQueue);
  showToast("Request confirmed — assign a truck to dispatch.");
}

function dispatchRequest(id, truckId) {
  const req = _requestQueue.find(r => r.id === id);
  if (!req) return;
  if (!truckId) { showToast("Pick a truck first.", true); return; }

  const truck = _trucks.find(t => t.TruckID === truckId);
  if (!truck || truck.Status !== "Available") {
    showToast("That truck is no longer available.", true);
    renderRequestsTable(_requestQueue, _trucks);
    return;
  }

  const farmer = _farmers.find(f => normalizePhone(f.Phone) === normalizePhone(req.phone));
  const hasCoords = farmer && farmer.Lat !== "" && farmer.Lat != null && truck.Lat !== "" && truck.Lat != null;
  const distance = hasCoords
    ? haversineKm(parseFloat(farmer.Lat), parseFloat(farmer.Lon), parseFloat(truck.Lat), parseFloat(truck.Lon)).toFixed(1)
    : "—";

  const now = new Date();
  const dispatch = {
    Date: now.toISOString().slice(0, 10),
    Time: now.toTimeString().slice(0, 5),
    Farmer: req.fields.name || req.farmerName || "Unknown",
    Village: req.fields.location || (farmer ? farmer.Village : "—"),
    WeightKG: req.fields.quantity || 0,
    Driver: truck.DriverName,
    TruckID: truck.TruckID,
    DistanceKM: distance,
  };

  _dispatches.unshift(dispatch);
  _allDispatches = _dispatches;
  renderDispatchTable(_dispatches, true);
  renderRecentDispatches(_dispatches);

  truck.Status = "En Route";
  renderTruckTable(_trucks);
  renderDashTrucks(_trucks);
  renderMap(_farmers, _trucks);

  req.status = "dispatched";
  _allRequests = _requestQueue;
  renderRequestsTable(_requestQueue, _trucks);
  updateRequestsBadge(_requestQueue);

  renderMetrics(_farmers, _trucks, _dispatches);

  postToSheet("addDispatch", dispatch);
  showToast(`Dispatched ${truck.TruckID} to ${dispatch.Farmer}.`);
}

function discardRequest(id) {
  _requestQueue = _requestQueue.filter(r => r.id !== id);
  _allRequests = _requestQueue;
  renderRequestsTable(_requestQueue, _trucks);
  updateRequestsBadge(_requestQueue);
  showToast("Request discarded.");
}

// ============================================================
// DISPATCH LOG — demo simulate button
// ============================================================

function simulateDispatch() {
  const availableTrucks = _trucks.filter(t => t.Status === "Available");
  if (!availableTrucks.length) { showToast("No available trucks to simulate with.", true); return; }
  if (!_farmers.length) { showToast("No farmers to simulate with.", true); return; }

  const truck  = availableTrucks[Math.floor(Math.random() * availableTrucks.length)];
  const farmer = _farmers[Math.floor(Math.random() * _farmers.length)];
  const now = new Date();
  const hasCoords = farmer.Lat !== "" && farmer.Lat != null && truck.Lat !== "" && truck.Lat != null;
  const distance = hasCoords
    ? haversineKm(parseFloat(farmer.Lat), parseFloat(farmer.Lon), parseFloat(truck.Lat), parseFloat(truck.Lon)).toFixed(1)
    : (Math.random() * 80 + 10).toFixed(1);

  const dispatch = {
    Date: now.toISOString().slice(0, 10),
    Time: now.toTimeString().slice(0, 5),
    Farmer: farmer.Name,
    Village: farmer.Village,
    WeightKG: Math.floor(Math.random() * 500 + 100),
    Driver: truck.DriverName,
    TruckID: truck.TruckID,
    DistanceKM: distance,
  };

  _dispatches.unshift(dispatch);
  _allDispatches = _dispatches;
  renderDispatchTable(_dispatches, true);
  renderRecentDispatches(_dispatches);
  renderMetrics(_farmers, _trucks, _dispatches);
  showToast("Simulated dispatch added (demo only — not synced to Sheets).");
}

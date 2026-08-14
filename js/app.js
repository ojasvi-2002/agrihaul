// ============================================================
// js/app.js  —  Page Routing, Auth Flow, Actions
// ============================================================
// Load order (index.html): config.js → auth.js → data.js → intake.js
// → map.js → tables.js → app.js — so every helper this file calls
// (signInWithPassword, loadAllData, renderFarmerTable, escapeHtml,
// buildRequestQueue, haversineKm, statusBadge, postToSheet, …) is
// already defined by the time these functions run.
//
// FIXED IN THIS AUDIT:
//   - Added the Users admin page: loadUsers(), inviteUserSubmit(),
//     changeUserRole(), requestRemoveUser(). These call postToSheet()
//     the same way farmer/truck writes do — same endpoint, same
//     accessToken-carrying request, just different `action` values
//     that Code.gs now understands (listUsers/inviteUser/
//     updateUserRole/removeUser).
//   - Generalized runConfirmedDelete() (previously farmer/truck only)
//     to also handle type "user", sharing the one confirm-delete modal.
//   - showPage() now calls loadUsers() when navigating to the Users
//     page, the same way it already refreshes the map on navigation.
//   The sign-up bugs (missing name field, wrong button/link wiring)
//   were actually in index.html, not here — see that file's comments.
//   enterSignupView()/enterSigninView()/handleAuthSubmit() below were
//   already correct; they just had nothing to attach to before.
//
// ADDED: the Broadcast page — step 1 of the outbound flow. Ops
// composes a message, picks (or edits) a list of farmers, and sends
// it via SMS *before* any farmer has texted in — see
// initBroadcastPage()/toggleBroadcastRecipient()/
// sendBroadcastConfirmed() below. Recipient selection lives here in
// _broadcastSelected (a Set of phone numbers) so it survives
// re-renders (search, auto-refresh) within a session; the actual
// send goes through postToSheet("sendBroadcast", …) → Code.gs →
// Twilio, same pattern as every other write in this app.
// ============================================================

// ── APP STATE ────────────────────────────────────────────────
let _farmers      = [];
let _trucks       = [];
let _dispatches   = [];
let _rawRequests  = [];
let _requestQueue = [];
let _broadcasts   = [];

let _authView  = "signin";   // "signin" | "signup"
let _loginMode = "password"; // "password" | "magiclink" | "otp"
let _otpStage  = "request";  // "request" | "verify"

let _pendingDelete  = null;  // { type: "farmer"|"truck"|"user", key, label }
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

async function doLogin() {
  const emailEl = document.getElementById("loginEmail");
  const email = (emailEl?.value || "").trim();
  if (!isValidEmail(email)) { showToast("Enter a valid email address.", true); return; }

  const btn = document.getElementById("loginBtn");
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
  if (pageId === "users") loadUsers();
  if (pageId === "broadcast") initBroadcastPage();
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

  // Merge, don't overwrite: if SHEETS.BROADCASTS_URL isn't configured
  // yet, every fetch returns an empty seed array, which would wipe out
  // any broadcast just sent this session the moment the 30s refresh
  // ticks. Keep locally-known sends that the fetched list doesn't
  // already have (matched by SentAt + Message).
  const fetchedBroadcasts = data.broadcasts || [];
  const localOnly = _broadcasts.filter(b =>
    !fetchedBroadcasts.some(fb => fb.SentAt === b.SentAt && fb.Message === b.Message)
  );
  _broadcasts = [...localOnly, ...fetchedBroadcasts];

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
  if (document.getElementById("page-users")?.classList.contains("active")) {
    loadUsers();
  }
  if (document.getElementById("page-broadcast")?.classList.contains("active")) {
    // Re-render recipients (new/changed farmers) without touching the
    // operator's current selection, plus the (possibly merged) history.
    renderBroadcastRecipients(_farmers, _broadcastSelected);
    renderBroadcastHistory(_broadcasts);
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
  // Newly-added farmers default to "selected" for the next broadcast,
  // same as everyone else the first time the picker renders them.
  _broadcastSelected.add(phone);

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
// Backs the confirm-delete modal used by requestDeleteFarmer(),
// requestDeleteTruck(), and requestRemoveUser(). Talks to Code.gs via
// deleteFromSheet()/postToSheet() (js/data.js), which reports back a
// real { ok, error } result — so unlike a fire-and-forget write, this
// can actually tell the person whether the delete synced server-side
// or failed, and leaves the row in place (and the modal open) if it did.
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
      _broadcastSelected.delete(key);
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

    } else if (type === "user") {
      const result = await postToSheet("removeUser", { userId: key });
      if (!result.ok) throw new Error(result.error || "Remove failed");
      showToast(`${label} removed.`);
      await loadUsers();
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
// USERS (super_admin only) — invite / list / change role / remove
// ============================================================
// All four talk to the same Apps Script endpoint as farmer/truck
// writes (postToSheet in data.js), just with different `action`
// values. Code.gs re-checks that the caller's own role is
// super_admin before doing anything — hiding the "Users" nav item
// for everyone else is a UX nicety, not the actual security boundary.

async function loadUsers() {
  if (currentRole() !== "super_admin") return;
  const tbody = document.getElementById("usersTable");
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="form-hint">Loading…</td></tr>`;
  const res = await postToSheet("listUsers", {});
  if (!res.ok) {
    showToast(res.error || "Couldn't load users.", true);
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="form-hint">Couldn't load users.</td></tr>`;
    return;
  }
  renderUsersTable(res.users || []);
}

async function inviteUserSubmit() {
  const email = (document.getElementById("inviteEmail")?.value || "").trim();
  const role  = document.getElementById("inviteRole")?.value || "viewer";
  if (!isValidEmail(email)) { showToast("Enter a valid email address.", true); return; }

  const res = await postToSheet("inviteUser", { email, role });
  if (res.ok) {
    showToast(`Invited ${email}.`);
    clearFields(["inviteEmail"]);
    const roleSel = document.getElementById("inviteRole");
    if (roleSel) roleSel.value = "viewer";
    await loadUsers();
  } else {
    showToast(res.error || "Couldn't send invite.", true);
  }
}

async function changeUserRole(userId, role) {
  const res = await postToSheet("updateUserRole", { userId, role });
  if (res.ok) {
    showToast("Role updated.");
  } else {
    showToast(res.error || "Couldn't update role.", true);
  }
  await loadUsers(); // re-sync the dropdown either way
}

function requestRemoveUser(userId, label) {
  if (!userId) return;
  _pendingDelete = { type: "user", key: userId, label: label || "this user" };
  document.getElementById("confirmDeleteTitle").textContent = "Remove user?";
  document.getElementById("confirmDeleteBody").textContent =
    `This permanently removes ${label || "this user"}'s account and sign-in access. This can't be undone.`;
  openModal("confirmDelete");
}

// ============================================================
// BROADCAST (step 1 of the outbound flow) — compose / pick
// recipients / send / history
// ============================================================
// The flow from your notes: ops sends a message to farmers ("hey we
// wanna buy XYZ") *before* any farmer has texted in. Farmers replying
// with their own NAME - PRODUCT - QUANTITY - LOCATION message is the
// existing Requests page (intake.js already parses that). This page
// is only the outbound half.
//
// Recipient selection is manual, per your note ("operator can update
// the list") — everyone starts checked, the operator unchecks anyone
// they don't want this round, and can search to narrow down first.

let _broadcastSelected = new Set(); // phone numbers currently checked

function initBroadcastPage() {
  // Default to "everyone selected" the first time the page is opened
  // in a session; after that, re-renders (search, refresh) keep
  // whatever the operator has already picked.
  if (_broadcastSelected.size === 0 && _farmers.length) {
    _farmers.forEach(f => _broadcastSelected.add(f.Phone));
  }
  const searchEl = document.getElementById("broadcastRecipientSearch");
  if (searchEl) searchEl.value = "";
  renderBroadcastRecipients(_farmers, _broadcastSelected);
  renderBroadcastHistory(_broadcasts);
  updateBroadcastCharCount();
  updateBroadcastCount();
}

function toggleBroadcastRecipient(phone, checked) {
  if (checked) _broadcastSelected.add(phone);
  else _broadcastSelected.delete(phone);
  updateBroadcastCount();
}

// Selects/deselects only the farmers currently visible (i.e. matching
// the search box), so narrowing down first and then "select all" lets
// an operator target a subset (e.g. one village) without hand-picking.
function toggleBroadcastAll(checked) {
  _broadcastFarmers.forEach(f => {
    if (checked) _broadcastSelected.add(f.Phone);
    else _broadcastSelected.delete(f.Phone);
  });
  renderBroadcastRecipients(_broadcastFarmers, _broadcastSelected);
  updateBroadcastCount();
}

function updateBroadcastCount() {
  setEl("broadcastRecipientCount", _broadcastSelected.size);
  const btn = document.getElementById("broadcastSendBtn");
  if (btn) btn.disabled = _broadcastSelected.size === 0;
}

function insertBroadcastTemplate() {
  const el = document.getElementById("broadcastMessage");
  if (el) el.value = "Hi! AgriHaul here — we're buying produce this week. Reply with what you have ready: NAME - PRODUCT - QUANTITY - LOCATION";
  updateBroadcastCharCount();
}

// SMS is billed/split in 160-character segments (GSM-7) — surfacing
// this helps the operator keep the message to one segment on purpose,
// not by accident.
function updateBroadcastCharCount() {
  const el = document.getElementById("broadcastMessage");
  const counter = document.getElementById("broadcastCharCount");
  if (!el || !counter) return;
  const len = el.value.length;
  const segments = len === 0 ? 1 : Math.max(1, Math.ceil(len / 160));
  counter.textContent = `${len} chars · ${segments} SMS segment${segments === 1 ? "" : "s"}`;
}

function requestSendBroadcast() {
  const message = (document.getElementById("broadcastMessage")?.value || "").trim();
  if (!message) { showToast("Write a message first.", true); return; }
  if (_broadcastSelected.size === 0) { showToast("Select at least one recipient.", true); return; }

  document.getElementById("confirmBroadcastCount").textContent = _broadcastSelected.size;
  document.getElementById("confirmBroadcastPreview").textContent = message;
  openModal("confirmBroadcast");
}

async function sendBroadcastConfirmed() {
  const message = (document.getElementById("broadcastMessage")?.value || "").trim();
  const recipients = Array.from(_broadcastSelected);
  const btn = document.getElementById("confirmBroadcastBtn");
  const originalLabel = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

  try {
    const result = await postToSheet("sendBroadcast", { message, recipients });
    if (!result.ok) throw new Error(result.error || "Broadcast failed");

    _broadcasts.unshift({
      SentAt: new Date().toISOString(),
      Message: message,
      RecipientCount: result.sent,
      FailedCount: result.failed,
      SentBy: currentProfile()?.email || "",
    });
    renderBroadcastHistory(_broadcasts);

    closeModal("confirmBroadcast");
    const el = document.getElementById("broadcastMessage");
    if (el) el.value = "";
    updateBroadcastCharCount();

    showToast(
      result.failed
        ? `Sent to ${result.sent} farmers — ${result.failed} failed to deliver.`
        : `Sent to ${result.sent} farmers.`,
      !!result.failed
    );
  } catch (err) {
    showToast(`Couldn't send broadcast: ${err.message}`, true);
    // Leave the modal open, same reasoning as runConfirmedDelete() —
    // let the operator see the error and retry rather than assuming
    // it went out.
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
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

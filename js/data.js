// ============================================================
// js/data.js  —  Data Layer: Google Sheets + Seed Fallback
// ============================================================
// This file does two things:
//   1. Fetches live data from your published Google Sheets CSVs
//   2. Falls back to seed data if Sheets aren't connected yet
//
// COLUMN NAMES are matched exactly to your AgriDispatch.xlsx:
//   Farmers sheet:     Name, Phone, Village, Lat, Lon, Registered
//   Trucks sheet:      TruckID, DriverName, Phone, Status, Lat, Lon, LastUpdated
//   DispatchLog sheet: Date, Time, Farmer, Village, WeightKG, Driver, TruckID, DistanceKM
//   Requests sheet:    Phone, Raw, ReceivedAt (raw inbound SMS log, parsed
//                       client-side in intake.js — see that file for the
//                       NAME - PRODUCT - QUANTITY - LOCATION format)
//   Broadcasts sheet:  SentAt, Message, RecipientCount, FailedCount, SentBy
//                       (outbound messages ops sends to farmers — see
//                       js/app.js sendBroadcastConfirmed() and
//                       Code.gs sendBroadcastViaTwilio())
//
// FIXED IN THIS AUDIT:
//   - parseCSV() no longer auto-converts every numeric-looking cell to a
//     JS number. It used to do that indiscriminately, which silently
//     turned any Phone/TruckID/ReceivedAt/Registered value that happened
//     to contain only digits into a Number — stripping leading zeros and
//     crashing normalizePhone() (String methods don't exist on numbers).
//     Only the columns in NUMERIC_FIELDS are now coerced.
//   - postToSheet() used to fire with mode:"no-cors", which means the
//     app could never actually tell whether a write succeeded — every
//     add "succeeded" in the UI even if Apps Script threw or the
//     deployment was stale/misconfigured. It now reads the JSON
//     response, same pattern as sendSMS() below.
//   - Added deleteFromSheet() for the new Delete Farmer / Delete Truck
//     feature, and it also reads back a real ok/error result so the UI
//     can show accurate success/failure toasts.
// ============================================================

// ── SEED DATA (used when Google Sheets URLs are empty) ──────
// This mirrors your real sheet structure exactly.
// Replace these with real data or connect Google Sheets.

const SEED_FARMERS = [
  { Name:"Amina Diallo",   Phone:"+221 77 000 0001", Village:"Thiès",   Lat:14.7833, Lon:-16.9240, Registered:"2024-03-15" },
  { Name:"Kofi Mensah",    Phone:"+233 24 000 0002", Village:"Kumasi",  Lat:6.6885,  Lon:-1.6244,  Registered:"2024-04-02" },
  { Name:"Fatou Traoré",   Phone:"+225 07 000 0003", Village:"Bouaké",  Lat:7.6881,  Lon:-5.0317,  Registered:"2024-05-20" },
  { Name:"Kwame Asante",   Phone:"+233 24 000 0010", Village:"Accra",   Lat:5.5560,  Lon:-0.1969,  Registered:"2024-06-01" },
  { Name:"Mariama Balde",  Phone:"+224 62 000 0011", Village:"Conakry", Lat:9.6412,  Lon:-13.5784, Registered:"2024-06-10" },
  { Name:"Oumar Diop",     Phone:"+221 77 000 0012", Village:"Dakar",   Lat:14.6928, Lon:-17.4467, Registered:"2024-07-05" },
  { Name:"Adjoa Mensah",   Phone:"+233 24 000 0013", Village:"Tamale",  Lat:9.4035,  Lon:-0.8393,  Registered:"2024-07-18" },
  { Name:"Sékou Camara",   Phone:"+224 62 000 0014", Village:"Kankan",  Lat:10.3833, Lon:-9.3000,  Registered:"2024-08-02" },
];

const SEED_TRUCKS = [
  { TruckID:"TRK-001", DriverName:"Ibrahim Bah",       Phone:"+221 77 100 0001", Status:"Available",   Lat:14.6928, Lon:-17.4467, LastUpdated:"2025-05-24 08:00" },
  { TruckID:"TRK-002", DriverName:"Moussa Coulibaly",  Phone:"+223 66 100 0002", Status:"En Route",    Lat:12.6392, Lon:-8.0029,  LastUpdated:"2025-05-24 09:15" },
  { TruckID:"TRK-003", DriverName:"Yaw Boateng",       Phone:"+233 20 100 0003", Status:"Maintenance", Lat:5.5600,  Lon:-0.2057,  LastUpdated:"2025-05-23 17:30" },
  { TruckID:"TRK-004", DriverName:"Amadou Traoré",     Phone:"+225 07 100 0004", Status:"Available",   Lat:7.6881,  Lon:-5.0317,  LastUpdated:"2025-05-24 07:45" },
  { TruckID:"TRK-005", DriverName:"Kwabena Asare",     Phone:"+233 20 100 0005", Status:"Available",   Lat:6.6885,  Lon:-1.6244,  LastUpdated:"2025-05-24 09:00" },
  { TruckID:"TRK-006", DriverName:"Mamadou Sow",       Phone:"+221 77 100 0006", Status:"En Route",    Lat:14.7833, Lon:-16.9240, LastUpdated:"2025-05-24 08:30" },
  { TruckID:"TRK-007", DriverName:"Issouf Koné",       Phone:"+226 70 100 0007", Status:"Available",   Lat:12.3647, Lon:-1.5333,  LastUpdated:"2025-05-24 08:15" },
  { TruckID:"TRK-008", DriverName:"Suleiman Diallo",   Phone:"+224 62 100 0008", Status:"Maintenance", Lat:9.6412,  Lon:-13.5784, LastUpdated:"2025-05-23 16:00" },
];

const SEED_DISPATCH = [
  { Date:"2025-05-24", Time:"07:30", Farmer:"Amina Diallo",  Village:"Thiès",   WeightKG:320, Driver:"Ibrahim Bah",      TruckID:"TRK-001", DistanceKM:42.5 },
  { Date:"2025-05-24", Time:"08:45", Farmer:"Kofi Mensah",   Village:"Kumasi",  WeightKG:510, Driver:"Moussa Coulibaly", TruckID:"TRK-002", DistanceKM:87.3 },
  { Date:"2025-05-23", Time:"14:00", Farmer:"Fatou Traoré",  Village:"Bouaké",  WeightKG:275, Driver:"Yaw Boateng",      TruckID:"TRK-003", DistanceKM:33.1 },
  { Date:"2025-05-23", Time:"11:20", Farmer:"Kwame Asante",  Village:"Accra",   WeightKG:640, Driver:"Kwabena Asare",    TruckID:"TRK-005", DistanceKM:21.8 },
  { Date:"2025-05-22", Time:"09:05", Farmer:"Mariama Balde", Village:"Conakry", WeightKG:190, Driver:"Suleiman Diallo",  TruckID:"TRK-008", DistanceKM:55.0 },
];

// No seed history for broadcasts — the "Recent broadcasts" table
// starts empty until you send one. If you publish a Broadcasts tab
// to CSV and set SHEETS.BROADCASTS_URL, past sends will read back in
// on refresh too (see loadAllData() below).
const SEED_BROADCASTS = [];

// ── CSV PARSER ───────────────────────────────────────────────
// Parses raw CSV text (from Google Sheets publish URL) into
// an array of objects, using the first row as keys.
//
// Only these columns are ever coerced to a JS Number. Everything
// else (Phone, TruckID, ReceivedAt, Registered, LastUpdated, Name,
// Village, Raw, Status, Date, Time, Driver/Farmer names…) stays a
// string, even if it happens to look numeric — e.g. a phone number
// typed without a "+" or spaces. This was a real bug: a bare-digit
// Phone value used to get silently converted to a Number, and later
// normalizePhone(p) — which calls String.prototype.replace on the
// assumption p is a string — would throw a TypeError and quietly
// break farmer matching for that row.
const NUMERIC_FIELDS = new Set(["Lat", "Lon", "WeightKG", "DistanceKM", "RecipientCount", "FailedCount"]);

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    // Handle quoted fields with commas inside
    const cols = [];
    let inQuote = false, cell = "";
    for (let ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { cols.push(cell.trim()); cell = ""; }
      else { cell += ch; }
    }
    cols.push(cell.trim());
    const obj = {};
    headers.forEach((h, i) => {
      let val = (cols[i] || "").replace(/^"|"$/g, "");
      if (NUMERIC_FIELDS.has(h) && val !== "" && !isNaN(val)) val = parseFloat(val);
      obj[h] = val;
    });
    return obj;
  });
}

// ── FETCH FROM GOOGLE SHEETS ─────────────────────────────────
// HOW IT WORKS:
//   Your published Google Sheet CSV URL looks like:
//   https://docs.google.com/spreadsheets/d/SHEET_ID/pub?gid=TAB_ID&single=true&output=csv
//   Make.com writes new dispatch rows to DispatchLog automatically.
//   This function re-fetches on every REFRESH_INTERVAL tick.
//
// If the URL is empty (not configured yet), returns seed data.

async function fetchSheet(url, seedData) {
  if (!url) {
    // ── No URL configured — using seed data ─────────────────
    // Once you paste your Google Sheets URL into config.js,
    // this branch will never run.
    console.info("[AgriHaul] No Sheet URL configured — using seed data.");
    return seedData;
  }
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const parsed = parseCSV(text);
    if (!parsed.length) throw new Error("Empty sheet response");
    return parsed;
  } catch (err) {
    console.warn("[AgriHaul] Sheet fetch failed, using seed data:", err.message);
    return seedData;
  }
}

// ── WRITE PATH (add) ─────────────────────────────────────────
// fetchSheet() above only reads. A "Publish to web" CSV link can't
// accept writes, so anything added on the dashboard (new farmer, new
// truck, a dispatch, an SMS request) needs a separate endpoint that's
// actually allowed to append a row: Code.gs, deployed as a Google
// Apps Script web app and pasted into SHEETS.WRITE_URL.
//
// Every write carries the logged-in user's Supabase access token
// (getAccessToken(), from js/auth.js) so Code.gs can verify — on its
// side, not just in this browser — that the person is actually signed
// in and holds a role allowed to write (see verifyRole() in Code.gs).
//
// FIXED: this used to fire with mode:"no-cors", so the promise always
// "succeeded" client-side the moment the request left the browser —
// there was no way to know if Apps Script actually wrote the row, or
// even that SHEETS.WRITE_URL pointed at a live deployment. It now
// makes a normal (CORS-readable) request and returns the real
// { ok, error } payload Code.gs sends back, same as sendSMS()/
// deleteFromSheet() below. Content-Type stays "text/plain" so the
// request remains a CORS "simple request" (no preflight OPTIONS,
// which Apps Script web apps don't support).
//
// Also used for the "sendBroadcast" action (js/app.js
// sendBroadcastConfirmed()) — same endpoint, same accessToken-carrying
// request, Code.gs just loops Twilio sends instead of appending a row
// directly.
async function postToSheet(action, payload) {
  const url = window.CONFIG?.SHEETS?.WRITE_URL;
  if (!url) {
    console.info(`[AgriHaul] No WRITE_URL configured — ${action} kept local only.`);
    return { ok: false, error: "WRITE_URL not configured" };
  }
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload, accessToken: getAccessToken() }),
    });
    const data = await resp.json().catch(() => null);
    if (!data) return { ok: false, error: `Unexpected response (HTTP ${resp.status})` };
    return data;
  } catch (err) {
    console.warn(`[AgriHaul] Failed to write ${action} to Sheets:`, err.message);
    return { ok: false, error: err.message };
  }
}

// ── DELETE PATH ──────────────────────────────────────────────
// Backs the new Delete Farmer / Delete Truck feature. Talks to the
// same Apps Script endpoint as postToSheet(), using "deleteFarmer" /
// "deleteTruck" actions (see Code.gs). Code.gs looks the row up by
// its natural key (Phone for farmers, TruckID for trucks), removes
// it from the sheet, and reports back whether it actually found and
// deleted a row — that result flows straight back here so the UI can
// show an accurate success/error toast instead of assuming it worked.
async function deleteFromSheet(action, payload) {
  const url = window.CONFIG?.SHEETS?.WRITE_URL;
  if (!url) return { ok: false, error: "WRITE_URL not configured — nothing to sync to." };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload, accessToken: getAccessToken() }),
    });
    const data = await resp.json().catch(() => null);
    if (!data) return { ok: false, error: `Unexpected response (HTTP ${resp.status})` };
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── MAIN DATA LOAD ───────────────────────────────────────────
// Called on page load and every REFRESH_INTERVAL milliseconds.
// Returns { farmers, trucks, dispatches, requests, broadcasts } —
// all normalised.

async function loadAllData() {
  const cfg = window.CONFIG?.SHEETS || {};

  const [farmers, trucks, dispatches, requests, broadcasts] = await Promise.all([
    fetchSheet(cfg.FARMERS_URL,    SEED_FARMERS),
    fetchSheet(cfg.TRUCKS_URL,     SEED_TRUCKS),
    fetchSheet(cfg.DISPATCH_URL,   SEED_DISPATCH),
    fetchSheet(cfg.REQUESTS_URL,   SEED_REQUESTS),
    fetchSheet(cfg.BROADCASTS_URL, SEED_BROADCASTS),
  ]);

  // Normalise status values from your sheet
  // Your sheet uses: "Available", "En Route", "Maintenance"
  // The badge system maps these to CSS classes
  trucks.forEach(t => {
    t.Status = (t.Status || "").toString().trim();
  });

  // Sort dispatches newest first (by Date + Time)
  dispatches.sort((a, b) => {
    const da = new Date(`${a.Date}T${a.Time}`);
    const db = new Date(`${b.Date}T${b.Time}`);
    return db - da;
  });

  return { farmers, trucks, dispatches, requests, broadcasts };
}

// ── STATUS BADGE HELPER ──────────────────────────────────────
// Maps your exact sheet status strings to badge CSS classes.
// If you rename statuses in the sheet, update this map too.

function statusClass(status) {
  const map = {
    "Available":   "available",
    "En Route":    "dispatched",   // amber
    "Maintenance": "unavailable",  // red
    "AVAILABLE":   "available",
    "DISPATCHED":  "dispatched",
    "UNAVAILABLE": "unavailable",
  };
  return map[status] || "unavailable";
}

function statusBadge(status) {
  const cls = statusClass(status);
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

// ── TWILIO SMS SENDER (relayed through Apps Script) ────────────
// Called when a manual dispatch is triggered from the dashboard.
//
// This used to call api.twilio.com directly from the browser, which
// meant your Twilio Auth Token was visible to anyone with DevTools
// open. It now POSTs to your own Apps Script endpoint (Code.gs)
// instead, which holds the real Twilio credentials in its Script
// Properties (never sent to any browser) and relays the send.
// Code.gs also checks the caller's Supabase role before sending —
// see verifyRole() there.
//
// Unlike the old postToSheet(), this can't use mode:"no-cors" — we
// need to read back whether the send actually succeeded, and Apps
// Script's doPost responses are readable cross-origin for "simple"
// (non-preflighted) requests like this one.

async function sendSMS(toNumber, message) {
  const url = window.CONFIG?.SHEETS?.WRITE_URL;
  if (!url) return { ok: false, reason: "WRITE_URL not configured" };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "sendSms",
        payload: { to: toNumber, body: message },
        accessToken: getAccessToken(),
      }),
    });
    return await resp.json();
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// ── MAKE.COM WEBHOOK TRIGGER ──────────────────────────────────
// Fires the Make.com dispatch scenario when a manual dispatch
// is triggered from the dashboard (as a backup / override).
//
// HOW TO ENABLE:
//   Paste your Make.com webhook URL into MAKE.WEBHOOK_URL in config.js
//   Make.com will then run the full SMS dispatch automatically.

async function triggerMakeDispatch(payload) {
  const url = window.CONFIG?.MAKE?.WEBHOOK_URL;
  if (!url) {
    console.warn("[AgriHaul] Make.com webhook not configured. Add URL to config.js.");
    return false;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (err) {
    console.warn("[AgriHaul] Make.com webhook failed:", err.message);
    return false;
  }
}

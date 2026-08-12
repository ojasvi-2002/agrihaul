/**
 * agrihaulapp write endpoint.
 *
 * The dashboard reads Sheets data through "Publish to web" CSV links,
 * which are read-only. This script is the other half: a small web app
 * bound to the same spreadsheet that accepts a POST and appends/deletes
 * a row in the right tab, sends SMS via Twilio, and manages user
 * accounts/roles in Supabase — all gated behind a real server-side
 * permission check.
 *
 * FIXED IN THIS AUDIT (previously the single biggest security hole in
 * the app): the old version of this file never read `accessToken` and
 * never checked anything — literally any anonymous POST to the
 * deployed URL could add or (once wired up) delete rows. Every write
 * action now calls requireRole(), which:
 *   1. asks Supabase "is this access token a real, currently valid
 *      session?" and
 *   2. looks up that user's role in the `profiles` table,
 *   3. and only then lets the action through — matching whatever
 *      role list the action requires below.
 *
 * Also added: deleteFarmer/deleteTruck (previously unhandled, so
 * Delete never reached the Sheet), sendSms (previously unhandled, so
 * the manual "Send SMS" action always failed), and listUsers /
 * inviteUser / updateUserRole / removeUser for the super_admin
 * "Users" page.
 *
 * SETUP
 * 1. Open your spreadsheet → Extensions → Apps Script
 * 2. Delete any starter code, paste this file in
 * 3. Project Settings (gear icon) → Script Properties → add:
 *      SUPABASE_URL              e.g. https://xxxx.supabase.co
 *      SUPABASE_ANON_KEY         Settings → API → anon/public key
 *      SUPABASE_SERVICE_ROLE_KEY Settings → API → service_role key
 *                                 (SECRET — this is what lets Code.gs
 *                                 manage users; it never touches the
 *                                 browser, only lives here)
 *      TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER
 *                                 (optional — only needed for "Send SMS")
 * 4. Deploy → New deployment → type: Web app
 *      Execute as:      Me
 *      Who has access:  Anyone
 * 5. Copy the Web app URL it gives you, paste into SHEETS.WRITE_URL
 *    in js/config.js
 *
 * Every time you edit this script you need to create a new deployment
 * (or "Manage deployments" → edit → new version) for changes to go live.
 */

// Column order must match each tab's header row exactly.
const SHEET_COLUMNS = {
  Farmers:     ["Name", "Phone", "Village", "Lat", "Lon", "Registered"],
  Trucks:      ["TruckID", "DriverName", "Phone", "Status", "Lat", "Lon", "LastUpdated"],
  DispatchLog: ["Date", "Time", "Farmer", "Village", "WeightKG", "Driver", "TruckID", "DistanceKM"],
  Requests:    ["Phone", "Raw", "ReceivedAt"],
};

const ACTION_TO_SHEET = {
  addFarmer:   "Farmers",
  addTruck:    "Trucks",
  addDispatch: "DispatchLog",
  addRequest:  "Requests",
};

// Who is allowed to do what. super_admin can always do everything
// dispatcher/admin can (checked by inclusion below).
const WRITE_ROLES      = ["dispatcher", "admin", "super_admin"]; // add/delete farmers, trucks, dispatches, requests, sms
const USER_MGMT_ROLES  = ["super_admin"];                        // invite/list/promote/remove users

// ── ENTRY POINTS ─────────────────────────────────────────────

function doPost(e) {
  try {
    const body    = JSON.parse(e.postData.contents);
    const action  = body.action;
    const token   = body.accessToken;
    const payload = body.payload || {};

    switch (action) {
      case "addFarmer":
      case "addTruck":
      case "addDispatch":
      case "addRequest":
        requireRole(token, WRITE_ROLES);
        return jsonResponse(appendRow(action, payload));

      case "deleteFarmer":
        requireRole(token, WRITE_ROLES);
        return jsonResponse(deleteRow("Farmers", "Phone", payload.Phone));

      case "deleteTruck":
        requireRole(token, WRITE_ROLES);
        return jsonResponse(deleteRow("Trucks", "TruckID", payload.TruckID));

      case "sendSms":
        requireRole(token, WRITE_ROLES);
        return jsonResponse(sendSmsViaTwilio(payload.to, payload.body));

      case "listUsers":
        requireRole(token, USER_MGMT_ROLES);
        return jsonResponse(listUsers());

      case "inviteUser":
        requireRole(token, USER_MGMT_ROLES);
        return jsonResponse(inviteUser(payload.email, payload.role));

      case "updateUserRole":
        requireRole(token, USER_MGMT_ROLES);
        return jsonResponse(updateUserRole(payload.userId, payload.role));

      case "removeUser": {
        const caller = requireRole(token, USER_MGMT_ROLES);
        if (payload.userId === caller.userId) {
          throw new Error("You can't remove your own account.");
        }
        return jsonResponse(removeUser(payload.userId));
      }

      default:
        throw new Error("Unknown action: " + action);
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// Lets you sanity-check the deployment URL directly in a browser.
function doGet() {
  return jsonResponse({ ok: true, message: "agrihaulapp write endpoint is live" });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── AUTH / ROLE VERIFICATION ─────────────────────────────────

function getProp(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

function supabaseUrl() {
  const url = getProp("SUPABASE_URL") || "";
  return url.replace(/\/$/, "");
}

/**
 * Verifies an access token against Supabase Auth, then loads that
 * user's role from the `profiles` table (using the ANON key + the
 * caller's own token, which Row Level Security allows — a user may
 * always read their own row). Never trusts a role sent by the client.
 */
function verifyCaller(accessToken) {
  const url = supabaseUrl();
  const anonKey = getProp("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    return { ok: false, error: "Supabase isn't configured on the server (SUPABASE_URL / SUPABASE_ANON_KEY Script Properties missing)." };
  }
  if (!accessToken) {
    return { ok: false, error: "Not signed in." };
  }

  const userResp = UrlFetchApp.fetch(url + "/auth/v1/user", {
    method: "get",
    headers: { apikey: anonKey, Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true,
  });
  if (userResp.getResponseCode() !== 200) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }
  const user = JSON.parse(userResp.getContentText());

  const profResp = UrlFetchApp.fetch(
    url + "/rest/v1/profiles?id=eq." + encodeURIComponent(user.id) + "&select=id,email,role,full_name",
    { method: "get", headers: { apikey: anonKey, Authorization: "Bearer " + accessToken }, muteHttpExceptions: true }
  );
  if (profResp.getResponseCode() !== 200) {
    return { ok: false, error: "Could not load your profile/role." };
  }
  const rows = JSON.parse(profResp.getContentText());
  if (!rows.length) {
    return { ok: false, error: "No profile found for this account. Contact a super admin." };
  }

  return { ok: true, userId: user.id, email: rows[0].email || user.email, role: rows[0].role, fullName: rows[0].full_name };
}

function requireRole(accessToken, allowedRoles) {
  const caller = verifyCaller(accessToken);
  if (!caller.ok) throw new Error(caller.error);
  if (allowedRoles.indexOf(caller.role) === -1) {
    throw new Error("Insufficient permissions for this action (your role: " + caller.role + ").");
  }
  return caller;
}

// ── SHEET WRITES ──────────────────────────────────────────────

function appendRow(action, payload) {
  const sheetName = ACTION_TO_SHEET[action];
  if (!sheetName) throw new Error("Unknown action: " + action);
  const columns = SHEET_COLUMNS[sheetName];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error("No tab named " + sheetName);
  const row = columns.map(col => payload[col] ?? "");
  sheet.appendRow(row);
  return { ok: true };
}

/**
 * Finds the row where `keyColumn` equals `keyValue` and deletes it.
 * Used for deleteFarmer (key: Phone) and deleteTruck (key: TruckID).
 */
function deleteRow(sheetName, keyColumn, keyValue) {
  if (!keyValue) throw new Error("Missing " + keyColumn + " to delete.");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error("No tab named " + sheetName);
  const columns = SHEET_COLUMNS[sheetName];
  const keyIdx = columns.indexOf(keyColumn);
  if (keyIdx === -1) throw new Error("Column " + keyColumn + " not found for " + sheetName);

  const data = sheet.getDataRange().getValues(); // row 0 = header
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][keyIdx]).trim() === String(keyValue).trim()) {
      sheet.deleteRow(r + 1); // sheet rows are 1-indexed; data[] is 0-indexed
      return { ok: true, deleted: true };
    }
  }
  return { ok: false, error: "No matching row found for " + keyColumn + " = " + keyValue };
}

// ── TWILIO SMS RELAY ─────────────────────────────────────────

function sendSmsViaTwilio(to, body) {
  const sid   = getProp("TWILIO_ACCOUNT_SID");
  const token = getProp("TWILIO_AUTH_TOKEN");
  const from  = getProp("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) {
    throw new Error("Twilio Script Properties not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).");
  }
  if (!to || !body) throw new Error('Missing "to" or "body".');

  const url = "https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json";
  const resp = UrlFetchApp.fetch(url, {
    method: "post",
    payload: { To: to, From: from, Body: body },
    headers: { Authorization: "Basic " + Utilities.base64Encode(sid + ":" + token) },
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code >= 200 && code < 300) return { ok: true };
  return { ok: false, error: "Twilio error (HTTP " + code + "): " + resp.getContentText() };
}

// ── USER MANAGEMENT (super_admin only) ───────────────────────
// Uses the Supabase service_role key, which bypasses RLS entirely —
// that's intentional and safe here specifically because every call
// into this section is already gated by requireRole(token,
// USER_MGMT_ROLES) above, so only a verified super_admin ever reaches
// this code. The service_role key itself is a Script Property and is
// never sent to any browser.

function serviceHeaders() {
  const url = supabaseUrl();
  const serviceKey = getProp("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Supabase service role key not configured (SUPABASE_SERVICE_ROLE_KEY Script Property missing).");
  }
  return { url: url, headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey } };
}

function listUsers() {
  const s = serviceHeaders();
  const resp = UrlFetchApp.fetch(
    s.url + "/rest/v1/profiles?select=id,email,full_name,role,created_at&order=created_at.asc",
    { method: "get", headers: s.headers, muteHttpExceptions: true }
  );
  if (resp.getResponseCode() !== 200) throw new Error("Could not list users: " + resp.getContentText());
  return { ok: true, users: JSON.parse(resp.getContentText()) };
}

const VALID_ROLES = ["viewer", "dispatcher", "admin", "super_admin"];

function inviteUser(email, role) {
  if (!email) throw new Error("Email is required.");
  const assignRole = VALID_ROLES.indexOf(role) !== -1 ? role : "viewer";
  const s = serviceHeaders();

  // Creates the auth user and emails them a "set your password" link.
  const inviteResp = UrlFetchApp.fetch(s.url + "/auth/v1/invite", {
    method: "post",
    contentType: "application/json",
    headers: s.headers,
    payload: JSON.stringify({ email: email }),
    muteHttpExceptions: true,
  });
  if (inviteResp.getResponseCode() >= 300) {
    throw new Error("Could not invite user: " + inviteResp.getContentText());
  }
  const invited = JSON.parse(inviteResp.getContentText());

  // The handle_new_user trigger (supabase_schema.sql) creates their
  // profiles row automatically, defaulted to 'viewer'. If a different
  // role was requested, apply it now.
  if (assignRole !== "viewer" && invited.id) {
    UrlFetchApp.fetch(s.url + "/rest/v1/profiles?id=eq." + encodeURIComponent(invited.id), {
      method: "patch",
      contentType: "application/json",
      headers: Object.assign({ Prefer: "return=minimal" }, s.headers),
      payload: JSON.stringify({ role: assignRole }),
      muteHttpExceptions: true,
    });
  }
  return { ok: true };
}

function updateUserRole(userId, role) {
  if (!userId) throw new Error("Missing userId.");
  if (VALID_ROLES.indexOf(role) === -1) throw new Error("Invalid role: " + role);
  const s = serviceHeaders();
  const resp = UrlFetchApp.fetch(s.url + "/rest/v1/profiles?id=eq." + encodeURIComponent(userId), {
    method: "patch",
    contentType: "application/json",
    headers: Object.assign({ Prefer: "return=minimal" }, s.headers),
    payload: JSON.stringify({ role: role }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) throw new Error("Could not update role: " + resp.getContentText());
  return { ok: true };
}

function removeUser(userId) {
  if (!userId) throw new Error("Missing userId.");
  const s = serviceHeaders();
  // Deleting the auth user cascades to the profiles row
  // (ON DELETE CASCADE — see supabase_schema.sql).
  const resp = UrlFetchApp.fetch(s.url + "/auth/v1/admin/users/" + encodeURIComponent(userId), {
    method: "delete", headers: s.headers, muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) throw new Error("Could not remove user: " + resp.getContentText());
  return { ok: true };
}

// ============================================================
// js/auth.js  —  Authentication + RBAC (Supabase-backed)
// ============================================================
// Load order: config.js → auth.js → data.js → intake.js → map.js →
// tables.js → app.js. Requires the Supabase JS CDN tag in index.html
// and CONFIG.SUPABASE.URL / ANON_KEY.
//
// Every dashboard user authenticates through Supabase Auth (email
// verification is required — turned on in Supabase Dashboard →
// Authentication → Providers → Email → "Confirm email"). Three sign-in
// paths are supported; pick whichever your ops team prefers, or offer
// all three:
//   - signInWithPassword()   classic email + password
//   - sendMagicLink()        emails a one-click sign-in link
//   - sendEmailOtp() / verifyEmailOtp()   emails a 6-digit code
//
// ROLES: viewer < dispatcher/admin < super_admin.
//   - viewer      read-only: dashboard, map, dispatch log
//   - dispatcher  everyday ops work: + requests, trucks, farmers,
//                 broadcast
//   - admin       same day-to-day access as dispatcher — the
//                 difference between "admin" and "dispatcher" is
//                 organizational, not technical, in this build
//   - super_admin everything dispatcher/admin can do, PLUS the
//                 Users page: invite people, change anyone's role
//                 (including making/removing other admins), and
//                 remove accounts entirely
//
// Roles live in the `profiles` table (see supabase_schema.sql) and
// are enforced two places:
//   1. Client-side, here, to show/hide nav + pages (UX only).
//   2. Server-side, in Code.gs, which re-checks the role against
//      Supabase before honoring any write — so hiding a button isn't
//      the only thing standing between a "viewer" and a real change.
//
// FIXED IN THIS AUDIT:
//   - ROLE_PAGES had no `super_admin` key. canAccessPage()/
//     applyRolePermissions() do `ROLE_PAGES[role] || []` — with no
//     entry, a super_admin would see an empty page list and be
//     locked out of the entire app the moment that role existed.
//     Added below, including the new "users" page.
//   - getSupabase() used to read window.CONFIG.SUPABASE, but config.js
//     nested that block under CONFIG.APP.SUPABASE instead. That silent
//     mismatch meant getSupabase() always returned null and every
//     login/signup call failed — this is why authentication didn't
//     work at all. Fixed to read CONFIG.SUPABASE first (the documented
//     location) and fall back to CONFIG.APP.SUPABASE for compatibility
//     with any existing config.js that still has it nested there.
//   - Every function that calls getSupabase() now checks for null
//     before touching `sb.auth`/`sb.from`. Previously, an unconfigured
//     Supabase client meant these all threw a raw, uncaught
//     "Cannot read properties of null" TypeError instead of failing
//     gracefully with a message the UI could show.
//   - signUp() now detects Supabase's "identities: []" response, which
//     is what Supabase returns (with ok/no error) when someone signs
//     up with an email that already has an account, to avoid leaking
//     which emails are registered. Previously this looked exactly like
//     a brand-new signup and told the person to "check your email"
//     when nothing new was actually sent.
//
// ADDED: "broadcast" page added to dispatcher/admin/super_admin —
// step 1 of the outbound flow (send a message to farmers before they
// text in). Same write-role list as trucks/farmers/requests, since
// Code.gs gates the actual sendBroadcast action behind WRITE_ROLES.
// ============================================================

const ROLE_PAGES = {
  super_admin: ["dashboard", "map", "requests", "dispatch", "trucks", "farmers", "broadcast", "users"],
  admin:       ["dashboard", "map", "requests", "dispatch", "trucks", "farmers", "broadcast"],
  dispatcher:  ["dashboard", "map", "requests", "dispatch", "trucks", "farmers", "broadcast"],
  viewer:      ["dashboard", "map", "dispatch"],
};

let _supabase = null;
let _session  = null;
let _profile  = null;

function getSupabase() {
  if (_supabase) return _supabase;
  const cfg = window.CONFIG?.SUPABASE || window.CONFIG?.APP?.SUPABASE || {};
  if (!cfg.URL || !cfg.ANON_KEY) {
    console.error("[AgriHaul] Supabase not configured — set CONFIG.SUPABASE.URL / ANON_KEY in config.js.");
    return null;
  }
  if (!window.supabase?.createClient) {
    console.error("[AgriHaul] Supabase JS SDK not loaded — check the CDN <script> tag in index.html.");
    return null;
  }
  _supabase = window.supabase.createClient(cfg.URL, cfg.ANON_KEY);
  return _supabase;
}

const NOT_CONFIGURED = { ok: false, error: "Sign-in isn't configured yet. Contact your administrator." };

// ── SIGN-UP (email + password; Supabase emails a verification link) ─
async function signUp(email, password, fullName) {
  const sb = getSupabase();
  if (!sb) return NOT_CONFIGURED;
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: {
      data: { full_name: fullName || "" },
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) return { ok: false, error: error.message };
  // Supabase returns a "successful" signUp with no session AND an empty
  // identities array when the email is already registered (this is
  // intentional, to avoid confirming which emails exist). Surface that
  // as a real error instead of telling the person to check their inbox.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { ok: false, error: "An account with this email already exists. Try signing in instead." };
  }
  // data.session is null until the person clicks the verification link.
  return { ok: true, needsVerification: !data.session };
}

// ── PASSWORD LOGIN ────────────────────────────────────────────
async function signInWithPassword(email, password) {
  const sb = getSupabase();
  if (!sb) return NOT_CONFIGURED;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  _session = data.session;
  return { ok: true };
}

// ── MAGIC LINK (passwordless — emails a one-click sign-in URL) ──────
async function sendMagicLink(email) {
  const sb = getSupabase();
  if (!sb) return NOT_CONFIGURED;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── EMAIL OTP (6-digit code, no link to click) ───────────────────────
async function sendEmailOtp(email) {
  const sb = getSupabase();
  if (!sb) return NOT_CONFIGURED;
  // shouldCreateUser:false means only people who already have an
  // account can request a code — new accounts still go through signUp().
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function verifyEmailOtp(email, token) {
  const sb = getSupabase();
  if (!sb) return NOT_CONFIGURED;
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ok: false, error: error.message };
  _session = data.session;
  return { ok: true };
}

// ── SESSION + PROFILE (role) ─────────────────────────────────────────
// Call this right after any successful sign-in, and once on page load
// in case a session already exists (e.g. a magic-link redirect).
async function loadSession() {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: { session } } = await sb.auth.getSession();
  _session = session;
  if (!session) { _profile = null; return null; }

  const { data: profile, error } = await sb
    .from("profiles")
    .select("id, email, full_name, role, client_name")
    .eq("id", session.user.id)
    .single();

  if (error) { console.error("[AgriHaul] Could not load profile:", error.message); return null; }
  _profile = profile;
  return profile;
}

function currentSession() { return _session; }
function currentProfile() { return _profile; }
function currentRole()    { return _profile?.role || null; }
function getAccessToken() { return _session?.access_token || null; }

function canAccessPage(pageId) {
  const role = currentRole();
  if (!role) return false;
  return (ROLE_PAGES[role] || []).includes(pageId);
}

async function signOut() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
  _session = null;
  _profile = null;
}

// Fires on sign-in, sign-out, and token refresh — including in other
// tabs. Use this in app.js to keep the UI in sync automatically.
function onAuthChange(callback) {
  const sb = getSupabase();
  if (!sb) return;
  sb.auth.onAuthStateChange((_event, session) => {
    _session = session;
    callback(session);
  });
}

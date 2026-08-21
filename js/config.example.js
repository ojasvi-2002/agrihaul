// ============================================================
// js/config.example.js  —  Template for new developers
// ============================================================
// This file IS committed to GitHub (safe — no real keys).
// To set up a new instance:
//   1. Copy this file: cp config.example.js config.js
//   2. Fill in all the empty strings below
//   3. config.js is in .gitignore, so your keys stay private
//
// FIXED IN THIS AUDIT: this template had drifted from the real app —
// it still described a DEMO_USERNAME/DEMO_PASSWORD login and a
// client-side TWILIO block, neither of which the current Supabase +
// Apps Script architecture uses. Updated to match config.js exactly,
// including SUPABASE as a top-level key (auth.js reads
// window.CONFIG.SUPABASE, not window.CONFIG.APP.SUPABASE).
// ============================================================

const CONFIG = {
  SHEETS: {
    FARMERS_URL:  "",   // Publish Farmers tab → CSV → URL
    TRUCKS_URL:   "",   // Publish Trucks tab  → CSV → URL
    DISPATCH_URL: "",   // Publish DispatchLog → CSV → URL
    REQUESTS_URL: "",   // Publish Requests tab   → CSV → URL (raw inbound SMS)
    WRITE_URL: "",      // Apps Script web app URL — see apps-script/Code.gs.
                         // Without this, anything added on the dashboard
                         // (new farmer, new truck, dispatch, delete) stays
                         // local only and is lost on refresh.
    REFRESH_INTERVAL: 30000,
  },
  SUPABASE: {
    URL:      "",   // Supabase Dashboard → Settings → API → Project URL
    ANON_KEY: "",   // Supabase Dashboard → Settings → API → anon/public key
  },
  MAKE: {
    WEBHOOK_URL:  "",   // Your Make.com scenario webhook URL
  },
  APP: {
    APP_NAME:      "AgriHaul Ops",
    CLIENT_NAME:   "Your Client Name",
    MAP_CENTER_LAT: 21.1,
    MAP_CENTER_LON: 78.5,
  }
};

window.CONFIG = CONFIG;

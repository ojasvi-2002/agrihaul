// ============================================================
// js/config.js  —  AgriHaul Integration Configuration
// ============================================================
// ⚠️  THIS FILE IS IN .gitignore — NEVER COMMIT IT TO GITHUB
//     Copy config.example.js, fill in your values, save as
//     config.js. The .gitignore will keep it out of git.
//
// FIXED IN THIS AUDIT: SUPABASE used to live nested under APP.SUPABASE,
// but js/auth.js's getSupabase() reads window.CONFIG.SUPABASE (a
// top-level key) — the mismatch meant Supabase never initialised, so
// every login/signup attempt failed silently. SUPABASE is now a
// top-level block, matching what auth.js (and its own header comment)
// actually expects. auth.js also now falls back to CONFIG.APP.SUPABASE
// defensively, but keep it here at the top level going forward.
// ============================================================

const CONFIG = {

  // ----------------------------------------------------------
  // GOOGLE SHEETS — Your live database
  // ----------------------------------------------------------
  // HOW TO GET THESE URLS:
  // 1. Open your Google Sheet
  // 2. File → Share → Publish to web
  // 3. Change "Entire Document" to the specific tab name
  //    (Farmers, Trucks, or DispatchLog)
  // 4. Change format from "Web page" to "CSV"
  // 5. Click Publish, copy the URL
  // 6. Repeat for each tab and paste below
  // ----------------------------------------------------------
  SHEETS: {
    FARMERS_URL:  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS04npHKh8W2xK__jdma05uL2u5fl_kibym53xsjW_bp6Ks-Suu331MSBad65rKcw/pub?gid=543641861&single=true&output=csv",

    TRUCKS_URL:   "https://docs.google.com/spreadsheets/d/e/2PACX-1vS04npHKh8W2xK__jdma05uL2u5fl_kibym53xsjW_bp6Ks-Suu331MSBad65rKcw/pub?gid=259795644&single=true&output=csv",

    DISPATCH_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS04npHKh8W2xK__jdma05uL2u5fl_kibym53xsjW_bp6Ks-Suu331MSBad65rKcw/pub?gid=1029290634&single=true&output=csv",

    REQUESTS_URL: "",   // still needs a Requests tab — let me know if you want to set that up now

    WRITE_URL:    "https://script.google.com/macros/s/AKfycbxGuRo0lgVKuTb1gE1_ALBt8kUHNsljDq1FUmILOMxlpP_4kq3-Xjhgpl3kGXU5FBNrSg/exec",

    REFRESH_INTERVAL: 30000,
  },

  // ----------------------------------------------------------
  // SUPABASE — Auth (login / signup / roles)
  // ----------------------------------------------------------
  // Supabase Dashboard → Settings → API
  // The ANON_KEY is a public/publishable key — it's meant to be
  // shipped to the browser, unlike a service_role key, which must
  // never appear in client code.
  // ----------------------------------------------------------
  SUPABASE: {
    URL:      "https://zlcwiicpeejxbxpjsxcu.supabase.co",
    ANON_KEY: "sb_publishable_XGgiXLk92yFQm7pK2LaioQ_S6kmmELi",
  },

  // ----------------------------------------------------------
  // TWILIO — SMS gateway
  // ----------------------------------------------------------
  // Twilio credentials no longer live here. Calling Twilio directly
  // from the browser would expose your Auth Token to anyone with
  // DevTools open. Sending SMS now goes through data.js → sendSMS(),
  // which POSTs to SHEETS.WRITE_URL with action "sendSms"; Code.gs
  // holds the real Twilio credentials server-side in its Script
  // Properties (TWILIO_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM) and
  // relays the send after verifying the caller's role. See Code.gs.
  // ----------------------------------------------------------

  // ----------------------------------------------------------
  // MAKE.COM WEBHOOK — Triggers your automated dispatch flow
  // ----------------------------------------------------------
  // HOW TO GET THIS URL:
  // 1. Open your Make.com scenario (the dispatch automation)
  // 2. Click the Webhook trigger module
  // 3. Click "Copy address to clipboard"
  // 4. Paste below
  //
  // When the dashboard clicks "Dispatch" manually, it POSTs
  // to this URL with { farmer_phone, weight_kg, farmer_name }
  // Make.com then runs the full dispatch scenario automatically.
  // ----------------------------------------------------------
  MAKE: {
    WEBHOOK_URL: "",
    // Example: "https://hook.eu1.make.com/xxxxxxxxxxxxxxxx"
  },

  // ----------------------------------------------------------
  // APP SETTINGS
  // ----------------------------------------------------------
  APP: {
    // Name shown in the topbar and browser tab
    APP_NAME: "AgriHaul Ops",

    // Your client's company name (shown after login, unless the
    // signed-in user's Supabase profile has its own client_name)
    CLIENT_NAME: "Greenfields Agritech",

    // Map center coordinates — set to your operating region
    // Default: central Maharashtra, India
    MAP_CENTER_LAT: 21.1,
    MAP_CENTER_LON: 78.5,
  }
};

// Make config available globally
window.CONFIG = CONFIG;

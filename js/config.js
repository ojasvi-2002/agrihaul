// ============================================================
// js/config.js  —  AgriHaul Integration Configuration
// ============================================================
// ⚠️  THIS FILE IS IN .gitignore — NEVER COMMIT IT TO GITHUB
//     Copy config.example.js, fill in your values, save as
//     config.js. The .gitignore will keep it out of git.
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
  // TWILIO — SMS gateway for manual dispatch from dashboard
  // ----------------------------------------------------------
  // HOW TO GET THESE VALUES:
  // 1. Sign up at twilio.com (free trial: $15 credit)
  // 2. Go to Console Dashboard → Account Info (top right)
  // 3. Copy Account SID and Auth Token
  // 4. Go to Phone Numbers → Buy a number with SMS enabled
  // 5. Paste below
  //
  // ⚠️  SECURITY WARNING: Calling Twilio directly from the
  //     browser exposes your Auth Token to anyone who opens
  //     DevTools. This is fine for internal demos. For
  //     production, replace the fetch in data.js sendSMS()
  //     with a call to a Netlify Function or Cloudflare Worker
  //     that proxies to Twilio server-side.
  //     See: https://docs.netlify.com/functions/overview/
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

    // Your client's company name (shown after login)
    CLIENT_NAME: "Greenfields Agritech",

    // Demo login credentials (change before giving to client)
    // In production, replace with a real auth service like
    // Supabase Auth (free tier) or Netlify Identity
   SUPABASE: {
     URL:      "https://zlcwiicpeejxbxpjsxcu.supabase.co",  
     ANON_KEY: "sb_publishable_XGgiXLk92yFQm7pK2LaioQ_S6kmmELi",  
   },

    // Map center coordinates — set to your operating region
    // Default: central Maharashtra, India
    MAP_CENTER_LAT: 21.1,
    MAP_CENTER_LON: 78.5,
  }
};

// Make config available globally
window.CONFIG = CONFIG;

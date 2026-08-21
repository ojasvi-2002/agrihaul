# Original Prototype — Setup Guide (Archived)

This is the setup guide that used to live at the repo root `README.md`, before that file was replaced with the complete technical reference for the rebuilt SaaS application. Archived here verbatim so the instructions for deploying/configuring the **original prototype** (`index.html`, `css/`, `js/`) aren't lost — that prototype is still live and may still be in use independently of the rebuild.

For an architectural inspection of this same prototype (data flow, current auth, current SMS parsing), see [`CURRENT_SYSTEM.md`](./CURRENT_SYSTEM.md).

---

# AgriHaul — Operations Dashboard

A lightweight, single-page web dashboard for agritech companies managing SMS-based farm pickup logistics. No backend server required. Connects directly to Google Sheets as a database and Twilio for SMS dispatch.

---

## What This Is

agritech client logs in here to:
- Review incoming SMS requests, confirm farmers, and assign trucks
- Monitor 60 trucks on a live map
- View all dispatch history
- Manage farmer and driver registrations
- Trigger manual dispatches if needed

Farmers and drivers never use this app — they interact only via SMS.
No WhatsApp or internet connection is assumed on the farmer side; the
intake format is plain SMS text: `NAME - PRODUCT - QUANTITY - LOCATION`.

---

## How Incoming Requests Work

A farmer texts a structured message and nothing else:

```
NAME - PRODUCT - QUANTITY - LOCATION
KWAME - RED OIL - 200L - AJUMAKO
```

The `Requests` tab in Google Sheets logs the raw message and phone
number the moment it arrives. `js/intake.js` parses it client-side
into name, product, quantity, and location, matches the phone number
against the Farmers sheet, and flags anything that doesn't parse
cleanly (missing field, non-numeric quantity) as "Needs review"
instead of guessing.

From the **Requests** page in the dashboard, ops can:
1. Confirm the request (registers a new farmer automatically if the
   phone number isn't in the Farmers sheet yet)
2. Assign an available truck and dispatch it, which writes a normal
   row to `DispatchLog`

This is the same aggregation pattern as GreenEarth Connect: keep the
farmer side to plain SMS, do all the parsing, validation, and
coordination in the backend.

---

## Project Structure

```
agrihaulapp/
├── index.html          ← Main app shell + login screen
├── css/
│   ├── theme.css       ← CSS variables, dark/light mode tokens
│   └── app.css         ← All component styles
├── js/
│   ├── config.js       ← ★ YOUR INTEGRATION KEYS GO HERE ★
│   ├── data.js         ← Google Sheets fetch + seed data fallback
│   ├── intake.js       ← SMS parsing: raw text → structured request
│   ├── map.js          ← Map rendering logic
│   ├── tables.js       ← Table render + filter functions
│   └── app.js          ← Page routing, auth, actions
└── README.md
```

---

## Setup Guide (First Time)

### Step 1 — Google Sheets

1. Create a Google Sheet with four tabs:
   - `Farmers` — columns: Name, Phone, Village, Lat, Lon, Registered
   - `Trucks` — columns: TruckID, DriverName, Phone, Status, Lat, Lon, LastUpdated
   - `DispatchLog` — columns: Date, Time, Farmer, Village, WeightKG, Driver, TruckID, DistanceKM
   - `Requests` — columns: Phone, Raw, ReceivedAt (raw inbound SMS, one row per message)

2. Publish the sheet:
   - File → Share → Publish to web → Select each tab → CSV → Publish
   - Copy the published CSV URLs for each tab

3. Open `js/config.js` and paste the URLs into `SHEETS.FARMERS_URL`, `SHEETS.TRUCKS_URL`, `SHEETS.DISPATCH_URL`, and `SHEETS.REQUESTS_URL`

> These CSV links are **read-only**. Farmers/trucks/dispatches added on the dashboard won't reach Sheets, and won't survive a page refresh, until you also do Step 1a below.

### Step 1a — Write path (Apps Script)

Reading a published CSV is one-way. To make "Add Farmer," "Add Truck," and dispatches from the Requests page actually save to Sheets:

1. In your spreadsheet, go to Extensions → Apps Script
2. Delete the placeholder code and paste in the contents of `apps-script/Code.gs` from this repo
3. Deploy → New deployment → type **Web app** → Execute as **Me** → Who has access **Anyone**
4. Copy the Web app URL it gives you
5. Paste it into `SHEETS.WRITE_URL` in `js/config.js`

Without this step the app still works for demos (everything persists for your current browser session), it just won't sync to Sheets or survive a refresh.

### Step 2 — Twilio

1. Sign up at twilio.com (free trial gives $15 credit)
2. Buy a phone number with SMS capability (~$1/month)
3. Go to Console → Account Info → copy Account SID and Auth Token
4. Open `js/config.js` and fill in `TWILIO.ACCOUNT_SID`, `TWILIO.AUTH_TOKEN`, and `TWILIO.FROM_NUMBER`

> ⚠️ Note: Calling Twilio directly from the browser exposes your Auth Token. For production, proxy through a small Cloudflare Worker or Netlify Function. See comments in `js/config.js` for how to do this.

### Step 3 — Make.com Webhook

1. In Make.com, create a scenario: inbound SMS webhook → append row to the Requests tab → (optional) SMS dispatch back to the farmer
2. Copy the webhook URL from your Make.com scenario
3. Paste it into `MAKE.WEBHOOK_URL` in `js/config.js`

### Step 4 — Deploy

**Option A — Netlify Drop (zero account)**
1. Zip the entire `agrihaulapp/` folder
2. Go to netlify.com/drop
3. Drag and drop the zip
4. Get a live URL instantly

**Option B — GitHub + Netlify (recommended for ongoing use)**
1. Push this repo to GitHub
2. Log in to netlify.com → New site from Git → Connect repo → Deploy
3. Any push to main auto-deploys
---

## GitHub Setup (First Time)

```bash
cd agrihaulapp
git init
git add .
git commit -m "Initial AgriHaul dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/agrihaulapp.git
git push -u origin main
```

---

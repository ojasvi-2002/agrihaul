# CURRENT_SYSTEM.md

This document describes the AgriHaul prototype exactly as it exists today, before any migration work begins. It was produced per `CLAUDE.md` §48 (Phase 0 — Inspect Existing Application). No code was changed to produce this document.

---

## 1. What the current application does

It's a single-page, client-only ops dashboard (`index.html` + `css/` + `js/`) for one agricultural logistics company at a time. There is no backend server — the browser talks directly to Google Sheets (read) and an Apps Script web app (write), and can optionally call Twilio directly to send SMS.

An ops employee logs in with a hardcoded demo password, then can:
- View a dashboard of fleet/dispatch metrics
- See trucks and farmers on a static, non-GPS-tile "map" (pins placed by simple lat/lon → pixel math)
- Paste raw SMS text into a textbox, have it parsed into structured pickup requests, confirm the request (registering a farmer if needed), and assign a truck to it
- View/search a dispatch log and a farmer registry
- Add trucks and farmers via modal forms
- Toggle a truck's status (Available / En Route / Maintenance) — **locally only, not persisted**

There is exactly one tenant. Nothing in the code is organization-scoped.

---

## 2. Current data flow

```
Browser (index.html + js/*.js)
   │
   ├── READ:  fetch(published Google Sheet CSV URLs)  → parseCSV() → in-memory arrays
   │            Farmers / Trucks / DispatchLog / Requests
   │
   ├── WRITE: fetch(Apps Script Web App URL, mode:"no-cors")  → appends a row
   │            addFarmer / addTruck / addDispatch actions only
   │            (fire-and-forget: response is unreadable due to no-cors)
   │
   └── SMS:   fetch(Twilio REST API, Basic Auth in the browser) → sendSMS()
                Only referenced from data.js; not actually wired to any UI button
                in the current index.html (dead code path today).
```

Data loads once at login (`doLogin` → `loadAllData()`) and then re-polls every `SHEETS.REFRESH_INTERVAL` (default 30s) via `setInterval(refreshData, interval)`. All state lives in page-global variables (`appData`, `_allFarmers`, `_allTrucks`, `_allDispatches`, `_allRequests`) — nothing survives a page refresh except what's actually been written back to Sheets.

If a Sheet URL is empty or the fetch fails, the app silently falls back to hardcoded seed data (`SEED_FARMERS`, `SEED_TRUCKS`, `SEED_DISPATCH`, `SEED_REQUESTS` in `data.js`/`intake.js`). This means **the app appears to work correctly even with zero real configuration**, which is worth knowing before assuming a deployment is "live."

---

## 3. How Google Sheets works today

Google Sheets is the entire database. Four tabs, matched by exact column name:

| Tab | Columns |
|---|---|
| `Farmers` | Name, Phone, Village, Lat, Lon, Registered |
| `Trucks` | TruckID, DriverName, Phone, Status, Lat, Lon, LastUpdated |
| `DispatchLog` | Date, Time, Farmer, Village, WeightKG, Driver, TruckID, DistanceKM |
| `Requests` | Phone, Raw, ReceivedAt |

**Reads** go through "Publish to web → CSV" links (`SHEETS.FARMERS_URL` etc. in `js/config.js`), parsed by a hand-rolled `parseCSV()` in `data.js`. These links are read-only and world-readable to anyone who has the URL (there is no auth on a published CSV).

**Writes** go through `apps-script/Code.gs`, a Google Apps Script deployed as a public web app (`Execute as: Me`, `Who has access: Anyone`). It accepts `{action, payload}` POSTs and does `sheet.appendRow()`. It supports `addFarmer`, `addTruck`, `addDispatch` — notably **not** `addRequest`, even though `ACTION_TO_SHEET` defines it, so incoming SMS requests pasted into the dashboard are never persisted to the `Requests` tab; they only live in the browser tab's memory (`appData.requests`) until refresh, at which point they're gone unless re-pasted. This is a real gap in the current prototype, not something Phase 0 should silently "fix."

`REQUESTS_URL` is also **empty** in the current `js/config.js` — the live config has never actually had a Requests tab wired up for reading either. The requests page currently only works via manually pasted/simulated text, not real inbound SMS.

The current `js/config.js` (gitignored, not in the repo history) has real, working `FARMERS_URL`, `TRUCKS_URL`, `DISPATCH_URL`, and `WRITE_URL` values pointing at a live spreadsheet and a deployed Apps Script. Twilio and Make.com keys are empty.

---

## 4. How Twilio works today

Twilio is **configured for outbound only, and not even wired to a UI control**:

- `js/data.js` → `sendSMS(toNumber, message)` builds a Twilio REST API call directly from the browser using Basic Auth with the raw `ACCOUNT_SID`/`AUTH_TOKEN`. If those are empty (they are, in the current config), it's a no-op that logs a console warning.
- **This exposes the Twilio Auth Token to anyone who opens DevTools** — acknowledged in the code's own comments as acceptable "for a demo" only.
- Nothing in `index.html`/`app.js` currently calls `sendSMS()`. It exists in `data.js` but there is no button or flow that invokes it. It's effectively dead code today.
- There is **no inbound webhook receiver** anywhere in this repo. `README.md` and `manual.html` both describe a Make.com scenario that would receive Twilio's inbound-SMS webhook, parse it, and write to the `Requests` tab and back to `DispatchLog` — but that Make.com scenario lives outside this repo (in a Make.com account) and is not part of the codebase. There is no evidence in the repo of what that scenario actually contains.
- `js/data.js` also has `triggerMakeDispatch()`, which POSTs to a Make.com webhook URL — also unconfigured and not called from any UI element today.

**Important discrepancy to flag:** `manual.html` (an "Operator Manual" static page) describes a materially different, more automated system than what's actually implemented — a `READY [weight] KG` / `WAIT` / `LOC [lat] [lon]` / `DONE` / `ON` / `OFF` SMS command grammar, fully automatic nearest-truck dispatch via Make.com + Haversine, and live two-way SMS. **None of that command grammar or auto-dispatch logic exists in the actual JS code.** The real parser (`js/intake.js`) expects `NAME - PRODUCT - QUANTITY - LOCATION`, and dispatch/truck-assignment is a manual, ops-driven action in the dashboard (`confirmRequest` → pick a truck → `dispatchRequest`), not an automatic nearest-truck algorithm. `manual.html` appears to document an aspirational/future design, not the current code. Treat `manual.html` as a product vision document, not a spec of current behavior.

---

## 5. How SMS parsing works today (`js/intake.js`)

Parsing is entirely **client-side**, triggered manually by an ops user pasting raw SMS text into a textarea and clicking "Ingest messages" (or clicking a "Simulate incoming SMS" demo button that fabricates a fake message). There is no automatic ingestion from a live SMS gateway in this codebase.

`parseIntakeMessage(raw)`:
- Expects `NAME - PRODUCT - QUANTITY - LOCATION` (dash-separated); falls back to whitespace-splitting if fewer than 3 dash-separated parts are found.
- Extracts quantity via a regex requiring a numeric value with an optional unit suffix (defaults unit to `KG`).
- Never guesses at missing fields — collects human-readable `issues` (e.g. "missing quantity", "quantity not numeric") and marks the request `status: "review"` instead of inventing data. This matches CLAUDE.md §29's "never hallucinate business data" principle already, which is good prior art to carry forward.

`buildRequestQueue()`:
- Re-derives a request queue from raw messages + current farmer list on every data refresh, but **preserves existing entries by matching `raw text + phone`** so a request that's already been confirmed/dispatched doesn't reset on the next 30s poll.
- Flags likely duplicates (same phone+product+qty+location as an existing non-review request) as `status: "duplicate"`.
- Matches farmers purely by normalized phone number (`normalizePhone` strips all non-digits) — no farmer ID, no organization scoping (there's only one org today).

Statuses: `ready → confirmed → dispatched`, or `review` / `duplicate` as terminal-ish holding states an ops person must act on.

---

## 6. How authentication works today

There is no real authentication. `js/app.js` → `doLogin()` compares the entered username/password against plaintext values in `js/config.js` (`APP.DEMO_USERNAME` / `APP.DEMO_PASSWORD`, currently `admin` / `agrihaulops2024`). If those config values are empty, **any non-empty username/password is accepted**. There is:
- No session/token of any kind — "logged in" is just `mainApp` becoming visible and `loginScreen` hidden; a page refresh logs you out (no persisted session).
- No user records, no roles, no per-user anything.
- No relationship whatsoever to multi-tenancy — there's exactly one shared password for the entire application.

This is expected to be fully replaced (CLAUDE.md Phase 4).

---

## 7. How the UI works today

- Static `index.html` with all "pages" (`dashboard`, `map`, `requests`, `dispatch`, `trucks`, `farmers`) present in the DOM simultaneously; `showPage(id)` toggles a `.active` class and lazily re-renders that page's table/map on switch (`js/app.js`).
- Styling is hand-written CSS (`css/theme.css` for light/dark CSS variables + `css/app.css` for components) — no framework, no CSS build step.
- Dark/light theme toggle persists to `localStorage` (`agrihaulTheme` key), independent per page (`index.html` and `manual.html` each keep their own localStorage key).
- Two add-record modals (Add Truck, Add Farmer) are plain DOM elements toggled by class, not React-portal-style components.
- Toast notifications via a single fixed div (`#toast`) with a timeout-based show/hide.
- There is a second static page, `manual.html`, a fully self-contained (own inline `<style>`) operator documentation page — not linked from `index.html`'s nav, only reachable directly or via its own "Open dashboard →" link back to `index.html`.

None of the UI is componentized or reusable in a React sense; everything is direct `document.getElementById` + template-string `innerHTML` (see `js/tables.js`). This is expected — it's a prototype — but means **no UI code is directly portable to React**; only the layout/IA (page list, table columns, form fields) and the visual design tokens (`css/theme.css` variables) are worth carrying forward.

---

## 8. How maps work today

`js/map.js` is **not a real map** — no Leaflet/Mapbox/Google Maps tiles. It's a hardcoded lat/lon bounding box (`MAP_BOUNDS`, hardcoded to West Africa) linearly projected onto the pixel dimensions of a `<div>` (`gpsToPixel`). Truck/farmer pins are absolutely-positioned `<div>`s with hover tooltips (manual mouse-tracking, not native browser tooltips). It also contains a standalone Haversine distance function (`haversineKm`) that is defined but **never called anywhere** in the current code — likely left over from, or written in anticipation of, the nearest-truck-dispatch feature described in `manual.html` but not yet implemented client-side.

This "map" only works correctly for the hardcoded West Africa bounding box; any farmer/truck outside those bounds would render off-canvas or incorrectly positioned. CLAUDE.md Phase 10 anticipates replacing this with "an appropriate map provider" and explicitly warns not to expose private API keys — today there's no map provider at all, so no key-exposure risk yet, but also no real geographic accuracy.

---

## 9. How tables work today

`js/tables.js` is purely presentational: builds `<tr>` HTML strings from in-memory arrays and injects via `innerHTML`, plus a `filterX()` function per table that does client-side substring filtering (case-insensitive) with no debounce. Search state is not persisted or synced with the data-refresh cycle beyond re-deriving from the current global arrays. Each table (dispatch, trucks, farmers, requests) has its own render function, its own filter function, and its own "all records" global variable (`_allDispatches`, `_allTrucks`, `_allFarmers`, `_allRequests`) — a repeated pattern that would become one generic reusable table/filter concept in React.

---

## 10. Current deployment assumptions

- `README.md` and `manual.html` both explicitly document a **Netlify Drop** or **GitHub + Netlify auto-deploy** flow as the intended hosting path, plus Make.com as a required piece of external, no-code automation infrastructure (not present in this repo at all).
- Per CLAUDE.md §9/§50, none of this is required going forward — the frontend/backend must be deployable independently of any specific host, and Netlify is explicitly not part of the target architecture.
- There is no `.env` file, no Docker, no build step of any kind today — it's flat static files servable by literally any static file host or even `file://` (modulo CORS on the Sheets fetches).
- Cost profile documented in `manual.html` (~$24–29/month: Twilio + Make.com) reflects the *aspirational* fully-automated design, not what's actually wired up today — actual current running cost is effectively $0 (Google Sheets + a public Apps Script are both free; Twilio/Make.com keys are unset).

---

## 11. What can be reused

- **Business vocabulary & IA**: the page list (Dashboard, Map, Requests, Dispatch Log, Trucks, Farmers) and the column sets per entity map cleanly onto the target Prisma schema entities in CLAUDE.md §11 (Farmer, PickupRequest ≈ "Requests", Driver+Vehicle ≈ "Trucks" combined record, Assignment ≈ dispatch-to-truck action).
- **SMS parsing philosophy**: `intake.js`'s "never guess, flag for review" behavior (§4/§5 above) is exactly the behavior CLAUDE.md §29 asks for — this logic (not the code, but the approach and its edge-case list) should carry forward into the backend message-processing service in Phase 7.
- **Visual design tokens**: `css/theme.css`'s dark/light CSS variables (colors, fonts: Syne/DM Sans/JetBrains Mono) are a reasonable design system to port into the new React app's `styles/`.
- **Duplicate-detection idea**: matching by phone+product+qty+location to flag likely-duplicate requests is a useful idempotency concept to formalize server-side (though the real mechanism per CLAUDE.md §26 should be Twilio's `providerMessageId`, which is far more reliable than this heuristic).
- **Google Sheets data** itself (the live spreadsheet behind the current `WRITE_URL`) is the actual source of real farmer/truck/dispatch records and should be the input to the Phase 11 migration script — not the seed data in this repo.

## 12. What should be replaced

- **Everything data/auth/security-related**: plaintext shared password, Twilio Auth Token in the browser, public read-anyone Apps Script write endpoint with no auth/validation, no organization concept at all. None of this can be extended for multi-tenancy — it needs to be rebuilt per CLAUDE.md §22–§27.
- **The "map"**: pixel-math pin placement with a hardcoded regional bounding box isn't a real map and won't be reusable code, only a reference for what data needs to be shown.
- **Client-side Google Sheets as the datastore**: by design (CLAUDE.md §36), replaced by PostgreSQL, with Sheets relegated to a one-time/archival import source.
- **The inconsistency between `manual.html` and actual behavior**: before doing anything else, the developer should decide whether the Make.com/Haversine/auto-dispatch/READY-WAIT-LOC-DONE-ON-OFF vision in `manual.html` is still the target behavior, since it's materially more automated than both the current code and CLAUDE.md's Phase descriptions (which describe an ops-driven, dispatcher-confirms-then-assigns flow, closer to what `intake.js`/`app.js` actually implement today).

## 13. Risks

- **Silent fallback to seed data** means a misconfigured or broken Sheets connection is invisible in the UI — only a console warning. Worth deciding early whether the new backend should fail loudly instead.
- **`Requests` tab was never actually wired up** (empty `REQUESTS_URL`, and `Code.gs` never receives `addRequest`) — so despite the UI supporting an "Incoming Requests" workflow, no real inbound SMS has ever been persisted through this system as built. Any assumption that "the prototype already ingests real SMS" would be incorrect.
- **Manual/actual behavior mismatch** (see §4 and §12) could mislead future work if `manual.html` is treated as ground truth for what exists.
- **Local-only truck status toggle**: the dashboard's "Toggle" button changes truck status only in browser memory, never persisted — a real risk of ops staff believing a status change "took" when it silently didn't survive a refresh.
- **No test coverage of any kind** exists in the current prototype (expected, but worth stating plainly before Phase 3's tenant-isolation test requirements begin).

## 14. Recommended next step

Per CLAUDE.md §41, do not start Phase 1 yet. Two things are worth deciding with the developer first, since they materially affect scope:

1. **Confirm the target dispatch model**: ops-driven manual assignment (matches current code + CLAUDE.md Phase descriptions) vs. the fully automated Make.com/Haversine/SMS-keyword-grammar design in `manual.html`. This affects how much of Phase 7 (SMS Processing) needs to build.
2. **Confirm what "the current Google Sheets data" actually contains** — i.e., get access to (or a fresh export of) the real spreadsheet behind the live `WRITE_URL`, since that's the real data Phase 11's migration script will need to target, not the seed arrays in this repo.

Once those are confirmed, the next concrete step is **Phase 1 — Project Foundation**: scaffold `frontend/`, `backend/`, `database/`, `docs/`, `scripts/` per the target repository structure in CLAUDE.md §10, wire up a `GET /api/health` endpoint, and confirm the Vite dev server can reach the Express server locally — all without touching or deleting any of the existing prototype files.

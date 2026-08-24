# AgriHaul — Complete Technical Reference

This is the master reference for the **rebuilt** AgriHaul application — the multi-tenant SaaS platform living in `backend/`, `frontend/`, `database/`, and `scripts/`. It covers what the system does, how every piece fits together, what every file is for, how to run and test it locally, and what has to happen before any of this touches a real customer.

It does **not** cover the original prototype (`index.html`, `css/`, `js/`). That's a separate, untouched legacy codebase, still live independently of this rebuild — see [`docs/CURRENT_SYSTEM.md`](./docs/CURRENT_SYSTEM.md) for an architectural inspection of it, or [`docs/PROTOTYPE_SETUP.md`](./docs/PROTOTYPE_SETUP.md) for its original setup/deployment guide (this file used to be that guide, before being replaced with what you're reading now). The two codebases live side by side in this repo but share no code.

---

## Table of contents

1. [What AgriHaul is](#1-what-agrihaul-is)
2. [Architecture](#2-architecture)
3. [Repository structure](#3-repository-structure)
4. [Every file, explained](#4-every-file-explained)
5. [Data model](#5-data-model)
6. [Features — what it can do](#6-features--what-it-can-do)
7. [Multi-tenant security model](#7-multi-tenant-security-model)
8. [Authentication — two separate realms](#8-authentication--two-separate-realms)
9. [Rate limiting](#9-rate-limiting)
10. [Local development setup](#10-local-development-setup)
11. [Environment variables — full reference](#11-environment-variables--full-reference)
12. [Testing guide](#12-testing-guide)
13. [Before you take this live — production checklist](#13-before-you-take-this-live--production-checklist)
    - [Demo deployment: Render, $0, one blueprint](#demo-deployment-render-0-one-blueprint)
14. [Known limitations & deliberately deferred work](#14-known-limitations--deliberately-deferred-work)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. What AgriHaul is

AgriHaul is a **multi-tenant SaaS logistics platform** for agritech/agricultural-logistics companies. Each company (an "Organization" in the data model) gets its own fully isolated workspace — its own farmers, farms, drivers, vehicles, conversations, and dispatch operations. No organization can ever see or touch another's data.

The core workflow the whole system is built around:

```
Farmer texts "KWAME - MAIZE - 200KG - AJUMAKO"
        │
        ▼
      Twilio (SMS carrier)
        │  POST webhook
        ▼
   AgriHaul Backend
        │  validates signature, identifies organization by destination number,
        │  identifies/creates the farmer, stores the raw message, parses it
        ▼
   PostgreSQL   (message + a structured PickupRequest, if the SMS was confident)
        │
        ▼
   Dispatcher sees it in the Conversations screen — live, via realtime push
        │  recommends a nearby truck, dispatcher confirms
        ▼
   Driver gets a DISPATCH SMS  →  drives out  →  texts "DONE"
        │
        ▼
   Farmer gets a "pickup completed" SMS
```

Three kinds of people use it:

- **Farmers** — never touch the app. They only send/receive SMS.
- **Organization users** — employees of a customer company, logged into the web app, split into roles: `OWNER`, `ADMIN`, `DISPATCHER`, `DRIVER`.
- **Platform admins** — AgriHaul's own staff (you), who oversee every organization from a completely separate login (`/platform-admin`), not a role on a regular user.

---

## 2. Architecture

```
                         FARMER
                           │  SMS
                           ▼
                         TWILIO
                           │  HTTPS webhook
                           ▼
                 ┌─────────────────────┐
                 │   AGRIHAUL BACKEND   │
                 │  Node.js + Express   │
                 │  TypeScript          │
                 └──────────┬───────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
              PostgreSQL          Twilio API
              (via Prisma)     (outbound SMS)
                    ▲
                    │  REST API + SSE (realtime)
                    │
            ┌───────┴────────┐
            │    FRONTEND     │
            │ React + Vite +  │
            │   TypeScript    │
            └─────────────────┘
```

**The browser never talks to Postgres or Twilio directly.** Every read and write goes through the backend, which enforces authentication, authorization, and — critically — tenant isolation, before touching the database.

### Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite + React Router | Modern, fast dev loop, no framework lock-in |
| Backend | Node.js + Express + TypeScript | Simple, well-understood, easy to reason about as a monolith |
| Database | PostgreSQL + Prisma ORM | Relational data with real foreign keys fits this domain; Prisma gives type-safe queries and migrations |
| SMS | Twilio | Industry standard, has a generous free trial |
| Realtime | Server-Sent Events (native, no library) | One-directional (server→browser) is all that's needed; avoids a WebSocket dependency |
| Local dev | Docker Compose (Postgres only) | Nothing else needs containerizing |

**Deliberately not used:** microservices, Kubernetes, message queues/brokers, Redis, WebSockets, any paid infrastructure by default. This is a **modular monolith** — one backend process, one database, one frontend. See CLAUDE.md §45 for the reasoning; it's a hard constraint on this project, not an oversight.

### Request flow (a typical authenticated API call)

```
Browser
  → route (Express Router, e.g. pickup.routes.ts)
  → middleware (requireAuth → confirms session, attaches req.user)
  → controller (parses/validates the request, calls a service, shapes the response)
  → service (business logic, authorization checks, orchestrates repositories)
  → repository (the only layer that touches Prisma directly)
  → PostgreSQL
```

No controller ever queries Prisma directly, and no repository ever contains business logic. This separation is consistent across every one of the ~20 resource types in the app.

---

## 3. Repository structure

```
agrihaulapp/
│
├── index.html, css/, js/                ← OLD PROTOTYPE. Untouched. Ignore for new work.
│
├── CLAUDE.md                            ← The spec this whole rebuild follows. Read this first.
├── README.md                            ← This file
├── docker-compose.yml                   ← Local Postgres only
├── prisma.config.ts                     ← Prisma 7 config (schema path, migrations path, DB URL)
├── .env.example                         ← Documents every env var backend/frontend need
├── package.json                         ← Root-level scripts (db:*, migrate:*) + shared deps
│
├── backend/
│   ├── src/
│   │   ├── app.ts                       ← Express app: middleware stack + route mounting
│   │   ├── server.ts                    ← Starts the HTTP server (imports app.ts)
│   │   ├── config/env.ts                ← All environment variables, validated at startup
│   │   ├── controllers/                 ← One file per resource — HTTP-shape logic only
│   │   ├── services/                    ← Business logic, one file per resource
│   │   ├── repositories/                ← Prisma queries, one file per resource
│   │   ├── routes/                      ← Express routers, one file per resource
│   │   ├── middleware/                  ← Auth, role checks, rate limiting, Twilio signature
│   │   ├── modules/                     ← Self-contained logic: SMS parsing, dispatch, realtime
│   │   ├── integrations/                ← External services: Twilio, email
│   │   ├── validators/                  ← Zod schemas, one per resource
│   │   ├── utils/                       ← Small shared helpers
│   │   └── types/express.d.ts           ← Extends Express's Request type with req.user
│   ├── tests/                           ← vitest integration + unit tests
│   ├── package.json, tsconfig.json, vitest.config.mts
│   └── .env                             ← Your real local secrets (gitignored)
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      ← All routes defined here
│   │   ├── main.tsx                     ← React entry point
│   │   ├── features/                    ← One folder per screen/domain (see below)
│   │   ├── layouts/AppLayout.tsx        ← Sidebar nav + top bar, wraps every authenticated page
│   │   ├── lib/apiClient.ts             ← The one function every API call goes through
│   │   ├── types/api.ts                 ← TypeScript types mirroring backend response shapes
│   │   └── index.css                    ← All styling (no CSS framework)
│   ├── package.json, tsconfig*.json, vite.config.ts
│   └── .env                             ← VITE_API_URL (gitignored)
│
├── database/
│   └── prisma/
│       ├── schema.prisma                ← The entire data model
│       ├── migrations/                  ← One folder per schema change, applied in order
│       └── seed.ts                      ← Creates 2 demo organizations with realistic data
│
├── scripts/                             ← One-off CLI tools (CSV migration, platform admin bootstrap)
│
└── docs/
    ├── CURRENT_SYSTEM.md                ← Phase 0 audit of the OLD prototype
    └── PROTOTYPE_SETUP.md               ← The OLD prototype's original setup/deploy guide (archived)
```

---

## 4. Every file, explained

### `backend/src/` — top level

| File | Purpose |
|---|---|
| `app.ts` | Builds the Express app: CORS, Twilio webhook body parsing (must come before `express.json()`), JSON body parsing, signed cookies, mounts every route group, 404 handler, and the final error handler that turns a thrown `ServiceError` into a clean JSON response. |
| `server.ts` | The actual process entry point — imports `app` and calls `.listen()`. Kept separate from `app.ts` so tests can import `app` without starting a real server. |
| `config/env.ts` | Reads every environment variable once, with defaults, and **throws at startup** if something required is missing (e.g. `AUTH_SECRET`, or `TWILIO_AUTH_TOKEN` when the backend is publicly reachable). This is the only file that reads `process.env` directly. |
| `types/express.d.ts` | TypeScript module augmentation — adds `req.user` (organization users) and `req.platformAdmin` (platform admins) to Express's `Request` type. |

### `backend/src/controllers/`

Each controller: parses/validates the request body with a Zod schema, calls the matching service, and shapes the HTTP response. **No business logic and no direct Prisma calls live here.**

| File | Resource |
|---|---|
| `auth.controller.ts` | Login, logout, `/me`. Also exports `respondWithSession` — the shared "set cookie + return user/org" helper reused by the accept-invite flow. |
| `conversation.controller.ts` | List/get conversations, list/create messages within one. |
| `dispatch.controller.ts` | Truck recommendation, broadcast-to-drivers, assign a pickup. |
| `driver.controller.ts` | Driver CRUD. |
| `farm.controller.ts` | Farm CRUD. |
| `farmer.controller.ts` | Farmer CRUD. |
| `health.controller.ts` | `GET /api/health` — uptime check. |
| `message.controller.ts` | Get a single message by id. |
| `organization.controller.ts` | Update the current organization's name/settings. |
| `organizationPhoneNumber.controller.ts` | Add/list/activate/deactivate the org's Twilio numbers. |
| `pickup.controller.ts` | Pickup request CRUD, including the atomic status-transition handling. |
| `platformAdminAuth.controller.ts` | Platform-admin login/logout/`/me` — entirely separate cookie/session from org users. |
| `platformAdminOrganization.controller.ts` | Platform-admin: list orgs, platform-wide stats, per-org detail, create/suspend/activate an org. |
| `realtime.controller.ts` | The SSE endpoint — `streamEvents` keeps one HTTP response open per connected browser tab. |
| `signupRequest.controller.ts` | Public: file a new organization's signup request. Platform-admin: list/approve/reject requests — approving creates the org and emails the requester an OWNER invite. |
| `team.controller.ts` | Team roster, create/list/revoke invites, and the two public (no-auth) invite-preview/accept endpoints. |
| `twilioWebhook.controller.ts` | The two Twilio webhook endpoints (`/webhooks/twilio/incoming`, `/status`). |
| `vehicle.controller.ts` | Vehicle CRUD. |

### `backend/src/services/`

The business-logic layer. This is where authorization decisions get made, where multiple repositories get orchestrated together, and where `ServiceError`s get thrown for the controller to translate into HTTP status codes.

| File | Responsibility |
|---|---|
| `auth.service.ts` | Password verification, session creation/lookup. Exports `createSessionFor`, reused by the invite-accept flow. |
| `signupRequest.service.ts` | Files/reviews organization signup requests. Approval atomically claims the request, creates the Organization, then invites the requester as OWNER via the same TeamInvite mechanism as a normal team invite. |
| `conversation.service.ts` | Conversation/message listing scoped to the caller's org. |
| `dispatch.service.ts` | The dispatch engine: recommendation, broadcast, atomic assignment, and `handleDriverMessage` (parses a driver's `LOC`/`DONE` SMS and acts on it). |
| `driver.service.ts`, `farm.service.ts`, `farmer.service.ts`, `vehicle.service.ts` | Standard CRUD with organization-scoping and cross-reference validation (e.g. a farm's `farmerId` must belong to the same org). |
| `message.service.ts` | Creates outbound messages, actually calls Twilio to send them, and broadcasts the new message over SSE. |
| `organization.service.ts` | Update org settings. |
| `organizationPhoneNumber.service.ts` | Phone number management, including the check that a number isn't already claimed by another org. |
| `pickupRequest.service.ts` | Pickup CRUD plus the atomic COMPLETED/CANCELLED transition logic (prevents double-completion races). |
| `platformAdminAuth.service.ts` | Same shape as `auth.service.ts` but for the platform-admin realm — completely separate code path, on purpose. |
| `platformAdminOrganization.service.ts` | Org list/detail/stats for platform admins, create/suspend/activate. |
| `team.service.ts` | Team invite creation, preview, accept, revoke — the whole invite lifecycle. |
| `twilioWebhook.service.ts` | Orchestrates an inbound SMS: identify org by destination number, identify sender as driver-or-farmer, dedupe, store, broadcast, hand off to message processing. |

### `backend/src/repositories/`

The **only** layer that imports `prisma`. Every function here is a thin, typed wrapper around a Prisma query — no business logic, no authorization decisions (those already happened in the service layer, which passes `organizationId` into every call here).

| File | Table(s) |
|---|---|
| `assignment.repository.ts` | `Assignment` — includes `createAssignmentAtomic`, the transactional claim that prevents two dispatchers assigning the same pickup at once. |
| `conversation.repository.ts` | `Conversation` |
| `driver.repository.ts` | `Driver` |
| `farm.repository.ts` | `Farm` |
| `farmer.repository.ts` | `Farmer` |
| `message.repository.ts` | `Message` — includes idempotent inbound-message creation keyed on `providerMessageId`. |
| `organization.repository.ts` | `Organization` — also the platform-admin-only queries (`listAllOrganizations`, `getPlatformStats`, etc.) that intentionally span every tenant. |
| `organizationPhoneNumber.repository.ts` | `OrganizationPhoneNumber` |
| `pickupRequest.repository.ts` | `PickupRequest` — the atomic completed/cancelled transition guard lives here. |
| `platformAdmin.repository.ts` | `PlatformAdmin` |
| `platformAdminSession.repository.ts` | `PlatformAdminSession` |
| `session.repository.ts` | `Session` (org-user sessions) |
| `teamInvite.repository.ts` | `TeamInvite` |
| `user.repository.ts` | `User` — `listUsersForOrg` explicitly `select`s fields to guarantee `passwordHash` never leaves the database. |
| `vehicle.repository.ts` | `Vehicle` |

### `backend/src/routes/`

One Express `Router` per resource, mounted in `app.ts`. Each file wires up which middleware (`requireAuth`, `requireRole(...)`) guards which endpoint. If you want to know exactly what's protected and how, these files are the source of truth — read them alongside §7/§8 below.

### `backend/src/middleware/`

| File | Purpose |
|---|---|
| `auth.middleware.ts` | `requireAuth` — reads the signed session cookie, loads the user, blocks a suspended org, attaches `req.user`. |
| `requirePlatformAdminAuth.middleware.ts` | Same idea, entirely separate cookie/session, for platform admins. |
| `requireRole.middleware.ts` | `requireRole(...roles)` — must run after `requireAuth`; 403s if `req.user.role` isn't in the allowed list. |
| `rateLimit.middleware.ts` | Three independent `express-rate-limit` instances: org login (10/15min), signup (10/hour), platform-admin login (5/15min). |
| `twilioSignature.middleware.ts` | Validates the `X-Twilio-Signature` header on every inbound webhook — rejects forged requests. |

### `backend/src/modules/`

Self-contained logic that doesn't belong to any one HTTP resource.

| File | Purpose |
|---|---|
| `dispatch/recommendation.ts` | Ranks available vehicles by distance to a pickup (GPS or SMS-reported location), excluding unavailable vehicles/inactive drivers. |
| `dispatch/distance.ts` | Haversine great-circle distance calculation. |
| `dispatch/broadcast.ts` | Sends the job description SMS to every available driver at once. |
| `dispatch/driverMessageParser.ts` | Pure parser for driver-side SMS commands (`LOC <lat> <lon>`, `DONE`). |
| `messageProcessing/parser.ts` | Pure parser turning a raw farmer SMS into structured pickup fields (name/product/quantity/location/date) or an "ambiguous, needs review" result. Never guesses. |
| `messageProcessing/processor.ts` | Orchestrates parsing against the database: matches a farm, finds-or-creates a pickup, handles corrections and cancellations. |
| `realtime/hub.ts` | The in-memory SSE subscriber registry, keyed by organization — a `broadcast(orgId, event, data)` call only ever reaches that org's connected clients. |

### `backend/src/integrations/`

| File | Purpose |
|---|---|
| `twilio/client.ts` | Wraps the Twilio SDK — `sendSms`, webhook signature validation. No-ops (doesn't throw) when Twilio isn't configured, so local dev works without an account. |
| `email/client.ts` | **No real provider wired up.** Logs what would have been sent to the console. This is what team-invite emails currently do — see §14. |

### `backend/src/validators/`

One Zod schema file per resource, imported by the matching controller. These are the single source of truth for what a request body must look like — read one of these before wondering "what fields does this endpoint accept."

### `backend/src/utils/`

| File | Purpose |
|---|---|
| `httpErrors.ts` | `sendError(res, status, message)` and `notFound(res, what)` — consistent error response shape everywhere. |
| `params.ts` | `idParam(req)` — Express 5 types route params as possibly `string[]`; this normalizes to a single string. |
| `serviceErrors.ts` | The `ServiceError` class services throw, caught by `app.ts`'s error handler. |
| `slugify.ts` | Turns an organization name into a unique URL slug, retrying with a suffix on collision. |

### `backend/tests/`

vitest integration tests, almost all running against the real `app` via `supertest` and a real local Postgres (not mocked). One file per concern:

| File | Covers |
|---|---|
| `authRateLimit.test.ts` | The three rate limiters actually trigger a 429 past their limit. |
| `dispatch.test.ts` | Recommendation ranking, broadcast, driver LOC/DONE SMS, assignment, and the concurrent-assign/concurrent-DONE race conditions. |
| `driverMessageParser.test.ts` | Pure unit tests for the `LOC`/`DONE` parser. |
| `driversVehicles.test.ts` | Driver/vehicle CRUD and tenant scoping. |
| `organizationManagement.test.ts` | Signup requests (file/approve/reject), org settings, phone numbers, team CRUD/roles. |
| `pickupProcessing.test.ts` | The full SMS→pickup pipeline: creation, correction, cancellation, farm auto-linking, needs-review flagging. |
| `platformAdmin.test.ts` | Platform-admin auth, org list/stats/detail, suspend/activate actually blocking access, the two auth realms never crossing. |
| `realtimeHub.test.ts` | Pure unit tests for the SSE hub's per-org isolation. |
| `realtimeSse.test.ts` | A real streaming HTTP connection proving live delivery end-to-end. |
| `setup.ts` | Runs before every test file — sets a fake `TWILIO_AUTH_TOKEN` so signature validation is actually exercised in tests. |
| `smsParser.test.ts` | Pure unit tests for the farmer-SMS parser — valid/incomplete/ambiguous input, quantity/date edge cases. |
| `teamInvite.test.ts` | The full invite lifecycle: preview, accept, double-accept rejection, revoke, tenant isolation. |
| `tenantIsolation.test.ts` | The most important file — proves Organization A cannot read/write/delete Organization B's data, across every resource type. |
| `trustProxySpoofing.test.ts` | Confirms a spoofed `X-Forwarded-For` header can't bypass rate limiting. |
| `twilioWebhook.test.ts` | Signature validation (valid/invalid/missing), idempotent duplicate handling, status callbacks. |

### `frontend/src/`

| File | Purpose |
|---|---|
| `App.tsx` | Every route in the app. Two independent route trees (`OrgSection`, `PlatformAdminSection`), each wrapped in its own auth provider — they share no state. |
| `main.tsx` | React root render. |
| `index.css` | All styling — no Tailwind/CSS-in-JS, just plain CSS with custom properties for theming. |
| `layouts/AppLayout.tsx` | Sidebar nav (Conversations/Pickups/Farmers/Farms/Drivers/Vehicles/Map/Settings) + top bar, wraps every authenticated org-user page. Redirects to `/login` if not authenticated. |
| `lib/apiClient.ts` | `apiFetch<T>(path, options)` — the one function every API call goes through. Handles the base URL, credentials (cookies), JSON parsing, and turns a non-2xx response into a typed `ApiError`. |
| `types/api.ts` | TypeScript types mirroring every backend response shape — kept in sync by hand (no codegen). |

**`features/`** — one folder per screen, each following the same pattern: a `*Page.tsx` component plus a `*Api.ts` file of thin `apiFetch` wrappers.

| Folder | Screen |
|---|---|
| `auth/` | Login, signup-request, accept-invite pages, and `AuthContext` (the org-user session state, available app-wide via `useAuth()`). |
| `conversations/` | The message-centric core screen — conversation list + thread + composer, with the live SSE connection wired in. |
| `pickups/` | Pickup list, recommend/assign flow. |
| `farmers/`, `farms/`, `drivers/`, `vehicles/` | CRUD registries — search, add, edit. |
| `map/` | Leaflet + OpenStreetMap live map of vehicles and farms. |
| `settings/` | Org name, phone numbers, team roster + pending invites. |
| `platformAdmin/` | The entire platform-admin realm: its own `PlatformAdminAuthContext`, login page, org-list dashboard (with the stats strip), and per-org detail page. |

### `database/prisma/`

| File | Purpose |
|---|---|
| `schema.prisma` | The entire data model — 16 models, 12 enums. Single source of truth for the database structure. |
| `migrations/*/migration.sql` | One folder per schema change, in chronological order, each with a raw SQL file. Applied via `prisma migrate deploy`. Never edit an already-applied migration — add a new one. |
| `seed.ts` | Wipes and recreates two demo organizations (Green Farms, Agricul) with farmers, farms, drivers, vehicles, conversations, messages, and pickups — plus one platform admin account. Idempotent (`upsert`-based), safe to re-run. |

### `scripts/`

One-off CLI tools, run with `npx tsx scripts/<file>.ts`, never imported by the running app.

| File | Purpose |
|---|---|
| `importFarmersFromCsv.ts` | Migrates the old prototype's Farmers sheet export into real `Farmer`/`Farm` rows. Dry-run by default, `--commit` to write, idempotent, never invents data for an invalid row. |
| `importTrucksFromCsv.ts` | Same idea for the Trucks sheet → `Driver` + `Vehicle` rows. |
| `importDispatchLogFromCsv.ts` | Same idea for historical dispatch records → completed `PickupRequest` + `Assignment` rows. Must run after the two above. |
| `createPlatformAdmin.ts` | Bootstraps the first platform-admin account (interactive prompt for email/password). |
| `lib/csvImportHelpers.ts` | Shared parsing/validation helpers used by all three import scripts (phone validation, placeholder detection, arg parsing). |
| `lib/prismaClient.ts` | A standalone Prisma client instance for scripts (they don't run inside the Express app). |

---

## 5. Data model

16 models, all defined in `database/prisma/schema.prisma`:

```
Organization  ──┬── User ──── Session
                ├── TeamInvite
                ├── Farmer ──── Farm
                ├── Conversation ──── Message
                ├── PickupRequest ──── Assignment ──┬── Driver
                ├── Driver                          └── Vehicle
                ├── Vehicle
                └── OrganizationPhoneNumber

PlatformAdmin ──── PlatformAdminSession   (entirely separate — no FK to Organization)
```

Every organization-owned model carries an `organizationId` column — that column is the tenant boundary, and it's what every repository query filters on. `PlatformAdmin`/`PlatformAdminSession` are the one exception: they intentionally have no relationship to any organization, because they need to see across all of them.

To inspect the live database visually: `npm run db:studio` (from repo root) opens Prisma Studio.

---

## 6. Features — what it can do

**Conversations** — the central screen. Two-pane layout (conversation list + message thread), live-updating via SSE when a new message arrives from either side, send a reply that actually goes out over Twilio.

**SMS pickup pipeline** — a farmer's free-text SMS gets parsed into a structured pickup request (name/product/quantity/unit/location/date) automatically. An incomplete or ambiguous message never gets guessed at — it's stored, flagged for a human, and the raw text is always preserved. A second SMS from the same farmer while one is still pending is treated as a correction, not a new request. `CANCEL` cancels the pending one.

**Dispatch** — recommend the nearest available vehicle (by GPS or last SMS-reported location), broadcast a job to every available driver if no single truck is obviously best, and a dispatcher always makes the final assignment call — nothing dispatches automatically. Assignment is race-safe: two dispatchers can't double-assign the same pickup. A driver's `DONE` reply completes the job, frees the vehicle, and notifies the farmer — also race-safe against a redelivered webhook or a double-text.

**Registries** — full CRUD for Farmers, Farms, Drivers, Vehicles, all organization-scoped.

**Live map** — Leaflet + free OpenStreetMap tiles, shows every vehicle (colored by status) and farm on one map.

**Team management** — invite a teammate by name/email/role; they get an email with a link to set their own password (dev mode logs this to the console — see §14). Revoke a pending invite. List the current team.

**Organization settings** — rename the org, add/activate/deactivate Twilio phone numbers.

**Platform administration** — a completely separate login for AgriHaul's own staff: see every organization with platform-wide stats (total orgs/active/suspended/users/farmers/pickups), drill into any one org's full detail (team roster, phone numbers, per-entity counts, last-activity timestamp), create a new organization on a customer's behalf, suspend/reactivate an org (suspension actually blocks that org's users immediately, not just a status label).

**CSV migration** — three scripts to pull real data out of the old Google Sheets prototype into Postgres, dry-run by default, idempotent, never inventing data for a bad row.

**Realtime** — Server-Sent Events push new messages to every connected dispatcher watching the same conversation, live, no refresh needed.

---

## 7. Multi-tenant security model

This is the single most important property of the system: **an organization's data is never visible or writable by anyone outside it.**

How it's enforced, concretely:

1. Every organization-owned Prisma query is filtered by `organizationId` in the repository layer.
2. `organizationId` is **never** taken from the request body or query string — it always comes from `req.user.organizationId`, which itself came from the authenticated session, which the client cannot forge.
3. A resource that exists but belongs to a different organization is reported identically to one that doesn't exist at all (`404 Not found`) — never a `403` that would confirm existence.
4. Twilio identifies the organization by the **destination** phone number on an inbound SMS, never by trusting anything from the sender.
5. This is proven, not just assumed: `tests/tenantIsolation.test.ts` runs a full matrix of cross-tenant GET/POST/PATCH/DELETE attempts and asserts every one fails.

If you ever add a new resource type, the checklist is: does its repository function take `organizationId` as a parameter and use it in the `where` clause? If not, that's a bug.

---

## 8. Authentication — two separate realms

There are **two entirely independent authentication systems** in this app, and they never share code, cookies, or middleware:

| | Organization users | Platform admins |
|---|---|---|
| Cookie name | `agrihaul_session` | `agrihaul_platform_admin_session` |
| Session table | `Session` | `PlatformAdminSession` |
| Middleware | `requireAuth` | `requirePlatformAdminAuth` |
| Login route | `POST /api/auth/login` | `POST /api/platform-admin/auth/login` |
| Session length | 7 days | 1 day (shorter — higher privilege) |
| How you get an account | A platform admin approves your signup request, or an existing teammate invites you — both end the same way: an emailed link to set your password | `scripts/createPlatformAdmin.ts` only — no self-registration |

Both use the same underlying mechanism: a random 32-byte token is sent to the browser as a signed, httpOnly cookie; only its SHA-256 hash is ever stored in the database, so a database read alone can never be replayed as a valid session. Passwords are hashed with bcrypt, never stored or logged in plaintext.

---

## 9. Rate limiting

Three independent limiters (`backend/src/middleware/rateLimit.middleware.ts`), each tracked separately, keyed by client IP:

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 10 attempts / 15 minutes |
| `POST /api/signup-requests` | 10 attempts / hour |
| `POST /api/platform-admin/auth/login` | 5 attempts / 15 minutes (stricter — higher-privilege target) |

`env.trustProxyHops` (default `0`) controls how many reverse-proxy hops Express trusts for `X-Forwarded-For` — this **must** be set correctly (see §11) once deployed behind any real proxy, or the rate limits become bypassable by a spoofed header.

---

## 10. Local development setup

**Prerequisites:** Node.js, Docker, npm.

```bash
# 1. Start Postgres
docker compose up -d

# 2. Install dependencies (root, backend, frontend all separately)
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. Set up environment files
cp .env.example backend/.env      # then fill in AUTH_SECRET (any random string for local dev)
echo "VITE_API_URL=http://localhost:3000" > frontend/.env

# 4. Run migrations and seed demo data
npm run db:migrate
npm run db:seed

# 5. Run both apps (in two terminals)
cd backend && npm run dev     # http://localhost:3000
cd frontend && npm run dev    # http://localhost:5173
```

Log in at `http://localhost:5173/login` with any seeded account (password `DevPassword123!` for all of them):

| Email | Organization | Role |
|---|---|---|
| `adaeze@greenfarms.test` | Green Farms | OWNER |
| `tunde@greenfarms.test` | Green Farms | DISPATCHER |
| `priya@agricul.test` | Agricul | OWNER |
| `marco@agricul.test` | Agricul | DISPATCHER |

Platform admin: `http://localhost:5173/platform-admin/login` with `admin@agrihaul.internal` / `DevPassword123!`.

**Useful commands** (from repo root unless noted):

| Command | Does |
|---|---|
| `npm run db:studio` | Opens Prisma Studio — browse/edit the database visually |
| `npm run db:reset` | Wipes the database, reapplies all migrations, reseeds |
| `cd backend && npm test` | Runs the full backend test suite |
| `cd backend && npx tsc --noEmit` | Type-checks the backend without building |
| `cd frontend && npx tsc -b` | Type-checks the frontend |

---

## 11. Environment variables — full reference

**`backend/.env`**

| Variable | Required? | Purpose |
|---|---|---|
| `PORT` | No (defaults 3000) | Which port the backend listens on |
| `CORS_ORIGIN` | No (defaults `http://localhost:5173`) | The one origin allowed to call the API with credentials — must exactly match wherever the frontend is actually served from |
| `DATABASE_URL` | Yes | Postgres connection string |
| `AUTH_SECRET` | **Yes — startup throws without it** | Signs session cookies. Any long random string locally; a real secret in production, never reused across environments |
| `TWILIO_ACCOUNT_SID` | For real SMS | From the Twilio console |
| `TWILIO_AUTH_TOKEN` | **Required if `PUBLIC_BASE_URL` is set or `NODE_ENV=production`** | Validates that inbound webhooks really came from Twilio |
| `TWILIO_PHONE_NUMBER` | For real SMS | Must be a number Twilio actually issued you, E.164 format |
| `PUBLIC_BASE_URL` | Production only | The backend's real public URL, so Twilio can call back `/webhooks/twilio/status` |
| `TRUST_PROXY_HOPS` | No (defaults `0`) | Set to the exact number of reverse-proxy hops in front of the process once deployed — **never** guess high |
| `NODE_ENV` | Set to `production` in prod | Gates several startup safety checks |

**`frontend/.env`**

| Variable | Required? | Purpose |
|---|---|---|
| `VITE_API_URL` | Yes | Where the frontend sends API requests — must point at the real backend URL in production |

---

## 12. Testing guide

### Automated tests

```bash
cd backend
npm test              # runs every test file once
npx vitest             # watch mode
npx vitest run tests/dispatch.test.ts   # one file
```

As of this writing: **14 test files, 108 tests, all passing**, running against a real local Postgres (not mocked) via `supertest` against the actual `app`. Coverage highlights:

- Every cross-tenant isolation scenario (`tenantIsolation.test.ts`)
- Twilio webhook signature validation and idempotent duplicate handling
- The SMS parser's edge cases (ambiguous dates, zero quantity, incidental hyphens)
- Two concurrency races: double-assigning a pickup, double-completing one
- Rate limiting actually triggering, and not being bypassable via a spoofed IP header
- The full team-invite lifecycle
- A real streaming HTTP connection proving realtime delivery end-to-end

Run `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc -b` to type-check both sides — CI-equivalent checks with no test runner needed.

### Manual/live testing checklist

There's no substitute for actually clicking through the app. A reasonable pass:

1. **Login/signup** — log in with a seeded account; try filing a new organization signup request, then approve it from the platform-admin dashboard and confirm the emailed (dev-console-logged) invite link lets the requester set a password and log in.
2. **Conversations** — open a conversation, send a reply, confirm it appears; open two browser tabs on the same conversation and confirm a message sent in one appears live in the other (this is the realtime feature).
3. **Simulate an inbound SMS** without a real Twilio account, using a correctly-signed webhook request:
   ```bash
   node -e "
   const crypto = require('crypto');
   const url = 'http://localhost:3000/webhooks/twilio/incoming';
   const params = { To: '<an org phone number>', From: '+15551234567', Body: 'Kwame - Maize - 200KG - Ajumako', MessageSid: 'SM_test_' + Date.now() };
   const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
   console.log(crypto.createHmac('sha1', '<your TWILIO_AUTH_TOKEN>').update(Buffer.from(data)).digest('base64'));
   "
   ```
   then POST that to `/webhooks/twilio/incoming` with the signature as `X-Twilio-Signature` and the same params as form data.
4. **Pickups** — confirm the SMS above created a pickup request; try the recommend/assign flow.
5. **Registries** — add a farmer/driver/vehicle by hand; confirm it appears.
6. **Map** — confirm tiles render and vehicle/farm pins show up.
7. **Team invite** — invite a teammate, read the accept link from the backend console log (dev mode), open it, set a password, confirm it logs you straight in.
8. **Platform admin** — log in separately, confirm the stats strip and org list, click into an org's detail page.
9. **Tenant isolation, by hand** — log in as a Green Farms user, note something (e.g. a farmer's id), log in as an Agricul user, confirm you can't fetch that Green Farms resource by id (should 404).

---

## 13. Before you take this live — production checklist

Everything below is a real gap, not a hypothetical — none of it has been done yet.

- [ ] **Real Twilio account, with a real phone number.** Claiming a number requires a card on file with Twilio (even on a trial). Currently `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` may be real, but no real `TWILIO_PHONE_NUMBER` is configured yet.
- [ ] **A real email provider.** `backend/src/integrations/email/client.ts` currently just logs to the console — team invites don't actually reach anyone's inbox. Needs a provider (Resend, Postmark, SMTP, etc.) — pick one and swap the body of `sendEmail`; nothing else in the invite flow needs to change. This is a new paid dependency, so get explicit sign-off on cost before adding it.
- [ ] **A production-grade Postgres**, not the local Docker container — a managed provider with backups and connection pooling.
- [ ] **Rotate `AUTH_SECRET`** to a real, long, random production value — never reuse the local dev one.
- [ ] **Set `TRUST_PROXY_HOPS`** to the exact number of reverse-proxy hops in front of the deployed backend (typically `1` for a single load balancer/PaaS). Getting this wrong either breaks Twilio signature validation or reopens the rate-limit bypass fixed earlier this build.
- [ ] **Set `CORS_ORIGIN`** to the real production frontend URL.
- [ ] **Set `VITE_API_URL`** (frontend build-time env var) to the real production backend URL.
- [ ] **Set `PUBLIC_BASE_URL`** and `NODE_ENV=production` on the backend.
- [ ] **HTTPS everywhere** — cookies are set with `secure: true` in production (already handled in code, contingent on `NODE_ENV=production`), which requires real TLS.
- [ ] **Configure the Twilio webhook URLs** in the Twilio console to point at the real deployed backend (`/webhooks/twilio/incoming`, `/webhooks/twilio/status`).
- [ ] **Bootstrap the real platform-admin account** via `scripts/createPlatformAdmin.ts` — don't rely on the seeded dev one.
- [ ] **Run the CSV migration scripts against real historical data**, if migrating an existing customer off the old Google Sheets prototype — dry-run first, review the skip report, then `--commit`.
- [ ] **Decide on signup-request abuse prevention.** No account is ever created without platform-admin approval now, which already blocks the worst case — but rate limiting is the only defense against someone flooding the request queue itself with junk; evaluate whether a CAPTCHA is worth adding once the request form is reachable by the public internet.
- [ ] **Revisit the OpenStreetMap tile usage policy** (documented inline in `MapPage.tsx`) once traffic is more than a handful of dispatchers — the free public tile server explicitly discourages heavy production load.
- [ ] **Decide on a hosting provider** for both frontend and backend. `render.yaml` at the repo root gets a free demo deployment running on Render in minutes (see the subsection right after this checklist) — fine for showing prospects, not a substitute for evaluating real production hosting once there's a paying customer.
- [ ] **Read §14 below** and decide whether any of those gaps matter for your first real customer.

---

### Demo deployment: Render, $0, one blueprint

For demoing to a prospective customer — not a real launch — `render.yaml` at the repo root deploys the database and **one combined web service** (backend API + the built frontend, served from the same address) on Render's free plan, no credit card required. This intentionally skips most of the checklist above (it's fine for a demo, not for real customer data).

**Frontend and backend are deliberately one service, not two.** An earlier version of this setup used a separate static site for the frontend — that broke login in Safari, which blocks cookies shared across two different `*.onrender.com` addresses as cross-site tracking, even with `SameSite=None` set correctly. Serving both from the same origin (`backend/src/app.ts` serves `frontend/dist` directly once it's built) sidesteps the problem at the root instead of working around it.

**One-time setup:**

1. **Twilio.** Sign up for a free trial account at twilio.com — no card needed for the trial. From the console dashboard, copy your **Account SID** and **Auth Token**. Under *Phone Numbers → Manage → Buy a Number*, claim a free trial number (E.164 format, e.g. `+15551234567`). Under *Phone Numbers → Manage → Verified Caller IDs*, add whatever phone you'll use to play "the farmer" during the demo — trial accounts can only text verified numbers.
2. **Push this repo to GitHub** if it isn't already (it is).
3. **Render.** Sign up at render.com (no card required) → **New → Blueprint** → connect this GitHub repo. Render reads `render.yaml` automatically and shows the database and the `agrihaul-backend` service. When it asks for `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` (the three secrets `render.yaml` deliberately doesn't hardcode), paste in the values from step 1. Click **Apply**.
4. **Wait for the first deploy** — the build compiles the frontend, then the backend, then runs migrations automatically (`prisma migrate deploy`, baked into `render.yaml`'s build command), so the database ends up with the right tables with no manual step.
5. **Check the real URL.** `render.yaml` guesses the service URL will be `agrihaul-backend.onrender.com` — Render only honors that if the name is still available. Check the actual URL shown at the top of the service's dashboard page. If it differs from the guess, go to **Environment** and update `CORS_ORIGIN` and `PUBLIC_BASE_URL` to match (both should be the same real URL) → save (triggers a redeploy). `VITE_API_URL` is deliberately left empty and needs no fixing — the frontend calls its API with a relative path, which resolves correctly against whatever address actually served the page.
6. **Point Twilio at the real backend.** Twilio console → your number → *Messaging Configuration* → set "A message comes in" to `https://<your-real-url>/webhooks/twilio/incoming` (POST) and the status callback to `https://<your-real-url>/webhooks/twilio/status`.
7. **Bootstrap your own platform-admin account** — signup no longer creates an account directly (every new organization is held for platform-admin review first; see §7a below). On the Render dashboard, open the `agrihaul-backend` service → **Shell** tab, and run:
   ```
   npx tsx scripts/createPlatformAdmin.ts
   ```
   Follow its prompts for your name/email/password. This is the account you'll use to approve organizations going forward.
8. **Create your demo org.** Open the service's URL → *Request access* → fill in the form. This only files a request — nothing is created yet.
9. **Approve it.** Log into `/platform-admin/login` with the account from step 7, find the pending request on the dashboard, click **Approve**. This creates the organization and (dev-mode) logs an invite link to the server console instead of sending a real email — check the Render **Logs** tab for it.
10. **Set your password.** Open that logged invite link, set a password, and you're in as the org's OWNER.
11. **Add the phone number.** Settings → Phone Numbers → add the Twilio number from step 1.
12. **Test it for real** — text the Twilio number from the verified demo phone, confirm it shows up in Conversations, reply from the app, confirm the reply SMS arrives.

**Before each demo session after that:** nothing — the URL and webhook are already configured, so it just works. Only re-check step 5 if you ever redeploy under a different service name.

**Known limits of this setup:** Twilio's trial credit (~$15) covers plenty of demo messages but isn't unlimited — check the console balance if you're demoing a lot. Render's free Postgres expires after a while (Render's own docs disagree on whether it's 30 or 90 days) and needs recreating via the Render dashboard — fine for an active demo period, not something to leave unattended for months. And the free web service spins down after inactivity, so the first request after a quiet period can take up to ~50 seconds to wake back up — worth sending yourself a quick test message a minute before an actual demo starts.

---

## 14. Known limitations & deliberately deferred work

Not oversights — each of these was a conscious scope decision, most of them because CLAUDE.md explicitly says not to build them yet.

| Gap | Why it's not built |
|---|---|
| **Billing/subscriptions** | CLAUDE.md explicitly says not to implement this until the platform has paying customers (§35). No `Plan`/`Subscription`/`Invoice` model exists. |
| **Real email sending** | See the production checklist above — currently dev-console-only. |
| **Driver ON/OFF-duty via SMS** | Deliberately rejected during the dispatch-model design — only `LOC` and `DONE` are recognized. Toggling a driver's availability still requires the dashboard. |
| **CAPTCHA / advanced signup abuse prevention** | Rate limiting exists; nothing beyond that yet. |
| **Historical dispatch-log linking gap** | The CSV import scripts work correctly, but the specific data currently sitting in the repo's example CSVs doesn't fully cross-reference (some historical dispatch rows reference farmers not present in the Farmers export) — this is a data-quality issue in the example files, not a script bug. |
| **A dedicated Dashboard/metrics page for org users** | CLAUDE.md explicitly says to build the underlying data first and not implement every metric immediately (§32). The platform-admin dashboard exists; an org-level one doesn't yet. |

---

## 15. Troubleshooting

**"AUTH_SECRET is not set" on backend startup** — you haven't created `backend/.env`, or it's missing that line. Copy from `.env.example`.

**Backend won't validate Twilio signatures locally** — expected if `TWILIO_AUTH_TOKEN` isn't set; the middleware deliberately skips validation in that case (dev-only bypass, logged as a warning). This is fine until you're testing real Twilio.

**Login returns "Too many attempts"** — you've hit the rate limiter (10 attempts/15 min). Either wait, or if you're actively testing, that's the limiter working as designed.

**"No difference detected" vs actual schema drift** — after editing `schema.prisma` by hand, run `npx prisma migrate diff --from-config-datasource --to-schema database/prisma/schema.prisma --exit-code` to confirm the migrations directory actually matches the schema before committing.

**Frontend shows a blank Conversations page** — check the backend is actually running and `VITE_API_URL` in `frontend/.env` points at it; check the browser console for a CORS error, which usually means `CORS_ORIGIN` on the backend doesn't match the frontend's actual origin.

**`prisma migrate dev` hangs or refuses to run** — this project's migrations are hand-written and applied via `prisma migrate deploy` in CI/scripts specifically because `migrate dev` can refuse to run non-interactively on any warning. Prefer `db:migrate` (which uses `migrate dev` for local, interactive use) only when you're at an actual terminal; for scripted/automated application, use `migrate deploy`.

**A test fails intermittently, only when running the full suite, never alone** — check the concurrency-race tests (`dispatch.test.ts`'s assign/DONE race tests) specifically; they've shown occasional timing-dependent flakiness under load. Re-run the full suite once before assuming a real regression.

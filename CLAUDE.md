# CLAUDE.md

# AgriHaul — Multi-Tenant SaaS Platform

You are Claude Code working on AgriHaul.

AgriHaul is a multi-tenant SaaS platform for agritech and agricultural logistics companies.

The platform allows multiple independent organizations to use the same application while keeping all of their data completely isolated.

Examples:

- Organization 1: AgriHaul
- Organization 2: Agricul
- Organization 3: Green Farms
- Organization 4: Another agricultural logistics company

Each organization has its own users, farmers, farms, conversations, messages, pickup requests, drivers, vehicles, and operational data.

The platform itself is owned and operated by AgriHaul.

---

# 1. VERY IMPORTANT DEVELOPMENT RULE

The developer is a beginner learning full-stack development.

Do not assume advanced knowledge.

When performing significant work:

1. Explain what you are about to do.
2. Explain why it is necessary.
3. Make the change.
4. Test the change.
5. Explain what changed.
6. Explain how to manually test it.
7. Explain the next logical step.

Keep explanations concise and practical.

Do not overwhelm the developer with unnecessary theory.

Do not silently make major architectural decisions.

If there are multiple reasonable approaches, briefly explain them and recommend one.

---

# 2. DO NOT REWRITE EVERYTHING AT ONCE

The existing AgriHaul application is a working prototype.

Do NOT immediately delete it.

First inspect and understand it.

The migration must happen incrementally.

Existing functionality must be preserved unless there is a clear reason to change it.

Never replace a working feature with an untested implementation without warning the developer.

---

# 3. CURRENT PROTOTYPE

The existing application currently resembles:

agrihaulapp/

├── index.html
├── css/
│   ├── theme.css
│   └── app.css
├── js/
│   ├── config.js
│   ├── data.js
│   ├── intake.js
│   ├── map.js
│   ├── tables.js
│   └── app.js
└── README.md

The prototype currently uses:

- HTML
- CSS
- vanilla JavaScript
- Google Sheets as a temporary data source
- Twilio for SMS
- Netlify may have been used previously

Netlify is NOT part of the required architecture.

The new application must be deployable independently of any specific hosting provider.

---

# 4. WHAT AGRIHAUL IS

AgriHaul is NOT simply a dashboard.

It is a message-centric logistics platform.

Farmers primarily communicate with agritech companies through SMS.

Company employees use the web application to manage:

- farmer conversations
- incoming messages
- outgoing messages
- pickup requests
- farms
- drivers
- vehicles
- assignments
- logistics operations
- maps
- status updates

The central workflow is:

Farmer
↓
SMS
↓
Twilio
↓
AgriHaul Backend
↓
Message stored in PostgreSQL
↓
Message processing
↓
Pickup request created/updated when appropriate
↓
Dispatcher sees conversation/pickup in dashboard

---

# 5. SAAS MODEL

AgriHaul must be built as a multi-tenant SaaS platform from the beginning.

The correct mental model is:

AgriHaul Platform

├── Organization A
│   ├── Users
│   ├── Farmers
│   ├── Farms
│   ├── Conversations
│   ├── Messages
│   ├── Pickup Requests
│   ├── Drivers
│   └── Vehicles
│
├── Organization B
│   ├── Users
│   ├── Farmers
│   ├── Farms
│   ├── Conversations
│   ├── Messages
│   ├── Pickup Requests
│   ├── Drivers
│   └── Vehicles
│
└── Organization C
    ├── Users
    ├── Farmers
    ├── Farms
    ├── Conversations
    ├── Messages
    ├── Pickup Requests
    ├── Drivers
    └── Vehicles

Organization A must NEVER be able to access Organization B's data.

This is one of the most important requirements in the entire system.

---

# 6. TERMINOLOGY

Use these terms consistently in the code.

Platform:
The entire AgriHaul SaaS product.

Organization:
A customer/company using AgriHaul.

User:
An employee/person who logs into an organization's AgriHaul account.

Farmer:
A farmer/customer belonging to an organization.

Farm:
A physical farm associated with a farmer.

Conversation:
A communication thread between an organization and a farmer.

Message:
An individual communication inside a conversation.

PickupRequest:
A logistics request associated with a farmer/farm.

Driver:
A driver working for an organization.

Vehicle:
A vehicle belonging to an organization.

Assignment:
A relationship between a pickup request, driver, and vehicle.

Use `organizationId` as the tenant boundary.

Do NOT use `teamId` for the main tenant architecture.

---

# 7. TARGET TECHNOLOGY STACK

Use:

## Frontend

- React
- TypeScript
- Vite
- React Router
- CSS

## Backend

- Node.js
- TypeScript
- Express

## Database

- PostgreSQL
- Prisma ORM

## SMS

- Twilio

## Local development

- Docker
- Docker Compose
- npm

Do not introduce additional technologies unless there is a clear reason.

Prefer a modular monolith over microservices.

---

# 8. TARGET ARCHITECTURE

The target architecture is:

                         FARMER
                           │
                           │ SMS
                           ▼
                         TWILIO
                           │
                           │ HTTPS WEBHOOK
                           ▼
                 ┌─────────────────────┐
                 │     AGriHaul        │
                 │      BACKEND        │
                 │                     │
                 │ Node.js + Express   │
                 │ TypeScript          │
                 │ Authentication      │
                 │ Authorization       │
                 │ Business Logic      │
                 │ Twilio Integration  │
                 └──────────┬──────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  PostgreSQL   │
                    │               │
                    │ Organizations │
                    │ Users         │
                    │ Farmers       │
                    │ Farms         │
                    │ Conversations │
                    │ Messages      │
                    │ Pickups       │
                    │ Drivers       │
                    │ Vehicles      │
                    └───────────────┘
                            ▲
                            │
                           API
                            │
                            ▼
                  ┌──────────────────┐
                  │     FRONTEND     │
                  │ React + TypeScript│
                  └──────────────────┘

The browser communicates with the backend.

The backend communicates with PostgreSQL and Twilio.

The browser must NEVER communicate directly with PostgreSQL.

The browser must NEVER use private Twilio credentials.

---

# 9. HOSTING

Do not assume Netlify.

Do not hard-code deployment assumptions.

The frontend and backend must be deployable independently.

Local development should work without any production hosting provider.

Example local environment:

Frontend:
http://localhost:5173

Backend:
http://localhost:3000

PostgreSQL:
localhost:5432

Production hosting will be selected later.

Do not add unnecessary provider-specific dependencies.

---

# 10. TARGET REPOSITORY STRUCTURE

The final repository should approximately become:

agrihaulapp/

├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── conversations/
│   │   │   ├── messages/
│   │   │   ├── farmers/
│   │   │   ├── farms/
│   │   │   ├── pickups/
│   │   │   ├── drivers/
│   │   │   ├── vehicles/
│   │   │   └── map/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── lib/
│   │   ├── styles/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── validators/
│   │   ├── integrations/
│   │   │   └── twilio/
│   │   ├── modules/
│   │   ├── types/
│   │   ├── utils/
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
│
├── database/
│   └── prisma/
│       ├── schema.prisma
│       ├── migrations/
│       └── seed.ts
│
├── scripts/
│
├── docs/
│   ├── CURRENT_SYSTEM.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── MULTI_TENANCY.md
│   └── DEPLOYMENT.md
│
├── docker-compose.yml
├── .env.example
├── .gitignore
├── CLAUDE.md
└── README.md

Do not create unnecessary files.

---

# 11. DATABASE DESIGN

Use PostgreSQL with Prisma.

The database should model the business rather than copying the current Google Sheet.

Core entities:

Organization
User
Farmer
Farm
Conversation
Message
PickupRequest
Driver
Vehicle
Assignment

Additional entities can be introduced when necessary.

---

# 12. ORGANIZATION

Organization represents a SaaS customer.

Example:

Organization:

id
name
slug
status
createdAt
updatedAt

Potential future fields may include:

- logo
- timezone
- country
- billing information
- subscription status

Do not implement billing yet.

---

# 13. USER

Users belong to organizations.

Example:

User:

id
organizationId
name
email
role
createdAt
updatedAt

Potential roles:

OWNER
ADMIN
DISPATCHER
DRIVER

The exact permission model can evolve.

The important rule is:

Every user belongs to an organization.

---

# 14. FARMER

Farmer belongs to an organization.

Example:

Farmer:

id
organizationId
name
phoneNumber
createdAt
updatedAt

A farmer from Organization A must not be accessible to Organization B.

---

# 15. FARM

Farm belongs to a farmer and therefore indirectly to an organization.

Example:

Farm:

id
organizationId
farmerId
name
address
latitude
longitude
createdAt
updatedAt

Store organizationId directly where useful for secure and efficient tenant filtering.

---

# 16. CONVERSATION

Conversation is a first-class business object.

Example:

Conversation:

id
organizationId
farmerId
channel
status
createdAt
updatedAt

Initially:

channel = SMS

Design the model so additional channels could eventually be added.

Potential future channels:

SMS
WhatsApp
Email
Other

Do not implement those channels yet.

---

# 17. MESSAGE

Messages are one of the most important entities in AgriHaul.

Message:

id
organizationId
conversationId
direction
channel
sender
recipient
body
provider
providerMessageId
status
receivedAt
sentAt
createdAt
updatedAt

Direction:

INBOUND
OUTBOUND

Provider:

TWILIO

Channel:

SMS

Possible message statuses:

QUEUED
SENT
DELIVERED
FAILED
UNDELIVERED
RECEIVED

The original message body must always be preserved.

Never replace the raw SMS with parsed data.

---

# 18. PICKUP REQUEST

PickupRequest represents a structured logistics operation.

Example:

id
organizationId
farmerId
farmId
sourceConversationId
sourceMessageId
quantity
unit
requestedPickupDate
status
notes
createdAt
updatedAt

Possible statuses:

PENDING
CONFIRMED
ASSIGNED
IN_PROGRESS
COMPLETED
CANCELLED

Not every message creates a pickup request.

Examples of messages that may NOT create pickup requests:

- "Hello"
- "What time are you coming?"
- "Thanks"
- incomplete requests
- unclear requests
- unrelated messages

Store the message regardless.

---

# 19. DRIVER

Driver belongs to an organization.

Example:

id
organizationId
name
phoneNumber
status
createdAt
updatedAt

---

# 20. VEHICLE

Vehicle belongs to an organization.

Example:

id
organizationId
name
registrationNumber
capacity
status
createdAt
updatedAt

---

# 21. ASSIGNMENT

Assignment connects logistics work to a driver and vehicle.

Example:

id
organizationId
pickupRequestId
driverId
vehicleId
status
assignedAt
completedAt
createdAt
updatedAt

All referenced entities must belong to the same organization.

The backend must enforce this.

---

# 22. MULTI-TENANT SECURITY

This is CRITICAL.

Every request to organization-owned data must be scoped to the authenticated user's organization.

Example:

User:

organizationId = ORG_A

Request:

GET /api/pickups

The backend must effectively perform:

WHERE organizationId = ORG_A

It must NEVER return all organizations' pickups and expect the frontend to filter them.

Bad:

Frontend:
"Show only my organization's pickups."

Backend:
"Here are every organization's pickups."

This is unacceptable.

Correct:

Frontend:
GET /api/pickups

Backend:
Determine authenticated user.

Determine user's organization.

Query only that organization's records.

Return only those records.

---

# 23. NEVER TRUST organizationId FROM THE FRONTEND

Never rely on:

POST body:
{
  "organizationId": "another-company"
}

The backend must determine organization from the authenticated user/session.

If organizationId is supplied by the client:

- ignore it when possible
- or reject it when appropriate

The authenticated user's organization is authoritative.

---

# 24. CROSS-TENANT SECURITY

The following must all be protected:

- organizations
- users
- farmers
- farms
- conversations
- messages
- pickup requests
- drivers
- vehicles
- assignments
- Twilio phone numbers

A user from Organization A must never be able to:

- read Organization B data
- modify Organization B data
- delete Organization B data
- send messages on behalf of Organization B
- access Organization B conversations
- access Organization B farmers
- access Organization B pickups

Add automated tests specifically proving this.

---

# 25. TWILIO MULTI-TENANCY

Twilio phone numbers must belong to organizations.

Create a concept such as:

OrganizationPhoneNumber

Possible fields:

id
organizationId
phoneNumber
twilioPhoneNumber
friendlyName
active
createdAt
updatedAt

Example:

Organization A:

+352 111 111

Organization B:

+352 222 222

When Twilio sends an incoming message, the backend identifies the organization based on the Twilio destination number.

Flow:

Farmer
↓
SMS
↓
Twilio
↓
POST /webhooks/twilio/incoming
↓
Read destination phone number
↓
Find OrganizationPhoneNumber
↓
Determine organization
↓
Identify farmer
↓
Find/create conversation
↓
Store message
↓
Process message

Never assume the organization based only on the sender's phone number.

---

# 26. TWILIO WEBHOOKS

Implement:

POST /webhooks/twilio/incoming

POST /webhooks/twilio/status

Incoming flow:

1. Validate the Twilio request.
2. Read the Twilio destination number.
3. Determine organization.
4. Read sender.
5. Identify farmer.
6. Create farmer if the business rules allow it.
7. Find/create conversation.
8. Store the message.
9. Process the message.
10. Create/update pickup request if appropriate.
11. Return appropriate Twilio response.

Make webhook processing idempotent.

Use providerMessageId to prevent duplicate message records.

A duplicate webhook must not create duplicate pickup requests.

---

# 27. OUTBOUND SMS

React must NEVER call Twilio directly.

Correct:

React
↓
POST /api/conversations/:id/messages
↓
Backend authentication
↓
Backend authorization
↓
Confirm conversation belongs to user's organization
↓
Create outbound message
↓
Twilio
↓
Save providerMessageId
↓
Update message status

The backend owns the Twilio integration.

---

# 28. MESSAGE PROCESSING

The existing:

js/intake.js

contains SMS parsing logic.

Do not immediately delete it.

Inspect it first.

Migrate its important logic into backend services.

Conceptual flow:

Raw SMS
↓
Normalize
↓
Identify farmer
↓
Identify conversation
↓
Store message
↓
Parse message
↓
Determine intent
↓
Extract structured fields
↓
Validate
↓
Create/update pickup if confident

Keep raw message permanently.

Parsing should produce structured information separately.

---

# 29. AMBIGUOUS SMS

Do not create incorrect logistics records.

For example:

"Can you pick up tomorrow?"

This may be missing:

- quantity
- farm
- exact details

The system should not invent information.

Instead it may:

- store the message
- flag it for attention
- ask a clarification question later

Never hallucinate business data.

---

# 30. FRONTEND

The frontend should be a real React application.

Main navigation:

Dashboard
Conversations
Pickups
Farmers
Farms
Drivers
Vehicles
Map
Settings

The most important screen is Conversations.

---

# 31. CONVERSATION UI

The main experience should feel like a logistics communication platform.

Suggested layout:

-------------------------------------------------------------
| AgriHaul                                      User / Org  |
-------------------------------------------------------------
| Conversations | Conversation               | Pickup       |
|               |                            |              |
| Maria         | Maria — Farm 27            | Farm 27      |
| Farm 27       |                            | 35 bags      |
|               | Farmer:                    | Friday       |
| John          | Need pickup Friday         |              |
| Farm 13       |                            | Pending      |
|               | AgriHaul:                  |              |
| Ahmed         | How many bags?             | [Assign]     |
| Farm 9        |                            |              |
|               | [ Type message... ] [Send] |              |
-------------------------------------------------------------

Conversations and messages should be central to the UX.

Do not turn the entire application into a spreadsheet.

---

# 32. DASHBOARD

The dashboard should eventually show operational information such as:

- new messages
- pending pickup requests
- pickups today
- unassigned pickups
- active drivers
- completed pickups
- conversation activity

Do not implement every dashboard metric immediately.

Build the underlying data first.

---

# 33. AUTHENTICATION

Implement authentication after the basic API and database work.

Users belong to organizations.

Authentication must establish:

- user
- organization
- role

Protected routes must require authentication.

Protected resources must require organization authorization.

Do not store passwords in plaintext.

Do not expose authentication secrets to the frontend.

---

# 34. PLATFORM ADMIN

Eventually AgriHaul itself will need platform-level administration.

A platform administrator may need to:

- view organizations
- create/suspend organizations
- view platform metrics
- manage subscriptions
- manage support access

This is different from an organization's Admin.

Do not mix:

Platform Admin

with:

Organization Admin

The architecture should leave room for this distinction.

Do not build the entire platform-admin interface during the first implementation.

---

# 35. FUTURE BILLING

The SaaS platform will eventually charge organizations.

Example:

AgriHaul customer:

Organization A
↓
Subscription
↓
Plan
↓
Billing

Possible future entities:

Plan
Subscription
Invoice
Payment

Do NOT implement billing yet.

However, do not design the application in a way that assumes there will only ever be one organization.

Multi-tenancy comes first.

Billing comes later.

---

# 36. GOOGLE SHEETS

Google Sheets is a temporary prototype data source.

It must NOT remain the source of truth in the final application.

Migration path:

Google Sheets
↓
Import script
↓
Validation
↓
PostgreSQL

Do not delete the spreadsheet.

Create an idempotent migration/import script.

The script should:

- read existing data
- validate it
- transform it
- create organizations
- create users when applicable
- create farmers
- create farms
- create conversations
- create messages
- create pickup requests
- report errors
- prevent duplicates

Document the migration.

---

# 37. API STRUCTURE

Use:

route
↓
controller
↓
service
↓
repository
↓
Prisma
↓
PostgreSQL

Do not put complex business logic inside Express route files.

Do not put database queries directly inside React components.

---

# 38. API ROUTES

Initial API:

Authentication:

POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me

Organizations:

GET /api/organizations/current

Farmers:

GET /api/farmers
GET /api/farmers/:id
POST /api/farmers
PATCH /api/farmers/:id

Farms:

GET /api/farms
GET /api/farms/:id
POST /api/farms
PATCH /api/farms/:id

Conversations:

GET /api/conversations
GET /api/conversations/:id
GET /api/conversations/:id/messages

Messages:

GET /api/messages/:id
POST /api/conversations/:id/messages

Pickups:

GET /api/pickups
GET /api/pickups/:id
POST /api/pickups
PATCH /api/pickups/:id

Drivers:

GET /api/drivers
GET /api/drivers/:id

Vehicles:

GET /api/vehicles
GET /api/vehicles/:id

Health:

GET /api/health

Twilio:

POST /webhooks/twilio/incoming
POST /webhooks/twilio/status

Every protected API endpoint must enforce authentication and organization isolation.

---

# 39. ENVIRONMENT VARIABLES

Never commit real secrets.

Backend environment:

DATABASE_URL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
AUTH_SECRET=

Frontend:

VITE_API_URL=

Only public configuration belongs in frontend environment variables.

Private credentials belong exclusively to backend environment variables.

Create:

.env.example

Never create a committed .env containing real credentials.

---

# 40. LOCAL DATABASE

Use Docker Compose for local PostgreSQL.

The developer should be able to run:

docker compose up -d

and start PostgreSQL.

Document:

- database URL
- migration commands
- seed commands
- reset commands

Make local development straightforward.

---

# 41. DEVELOPMENT PHASES

Follow these phases.

Do NOT attempt all phases in one task.

## PHASE 0 — Inspect Existing Application

Inspect:

index.html
css/
js/
README.md

Create:

docs/CURRENT_SYSTEM.md

Document:

- current architecture
- current data model
- current Google Sheets behavior
- current Twilio behavior
- current SMS parser
- current authentication
- current UI
- current maps
- current tables
- current deployment assumptions

Do not rewrite the application yet.

---

# PHASE 1 — Project Foundation

Create:

frontend
backend
database
docs
scripts

Set up:

React
TypeScript
Vite
Node
Express
Prisma
PostgreSQL
Docker

Create:

GET /api/health

Verify frontend can communicate with backend.

---

# PHASE 2 — Database

Create Prisma schema.

Implement:

Organization
User
Farmer
Farm
Conversation
Message
PickupRequest
Driver
Vehicle
Assignment
OrganizationPhoneNumber

Add appropriate:

- indexes
- unique constraints
- foreign keys
- timestamps
- enums

Add organizationId to organization-owned entities.

Create migrations.

Create development seed data.

Seed at least two organizations.

Example:

Organization A
Organization B

Create data for both.

This allows tenant isolation testing.

---

# PHASE 3 — Multi-Tenant API

Build backend APIs.

Every query must enforce organization isolation.

Write tests proving:

Organization A cannot access Organization B data.

Test:

- GET
- POST
- PATCH
- DELETE where applicable
- nested resources
- message access
- pickup access

---

# PHASE 4 — Authentication

Implement authentication.

Establish:

user
organization
role

Protect API routes.

Implement authorization.

Test cross-tenant access.

---

# PHASE 5 — Conversations and Messages

Build:

- conversation API
- message API
- conversation UI
- message UI

Make the UI usable before adding complex logistics features.

---

# PHASE 6 — Twilio

Implement:

POST /webhooks/twilio/incoming

POST /webhooks/twilio/status

Implement outbound messaging.

Test:

farmer → Twilio → backend → database → dashboard

and:

dashboard → backend → Twilio → farmer

---

# PHASE 7 — SMS Processing

Migrate js/intake.js.

Build a backend message processing service.

Support:

- pickup extraction
- quantity extraction
- date extraction
- farm identification
- validation
- ambiguous messages

Add tests.

---

# PHASE 8 — Pickup Management

Build:

- pickup list
- pickup details
- create pickup
- edit pickup
- status changes
- assignment

---

# PHASE 9 — Farmers, Farms, Drivers, Vehicles

Migrate the corresponding prototype functionality.

Keep all entities organization-scoped.

---

# PHASE 10 — Maps

Migrate the map functionality.

Do not expose private API keys in the frontend.

Use an appropriate map provider.

---

# PHASE 11 — Google Sheets Migration

Build the migration/import script.

Verify migrated data.

Switch PostgreSQL to source of truth.

Keep Google Sheets as an archival/reference source until migration is confirmed.

---

# PHASE 12 — SaaS Organization Management

Build organization-aware onboarding.

Eventually support:

Create organization
↓
Create owner
↓
Configure organization
↓
Configure phone number
↓
Import data
↓
Start using platform

Do not implement billing yet.

---

# PHASE 13 — Platform Administration

Later create platform-level administration.

Platform admins can manage organizations.

Organization admins manage only their organization.

Keep these authorization levels separate.

---

# PHASE 14 — Realtime

Only after the core application works reliably.

Consider:

- WebSockets
- Server-Sent Events
- realtime notifications

Potential flow:

Twilio
↓
Backend
↓
Database
↓
Realtime event
↓
Dashboard

Do not add realtime complexity before necessary.

---

# 42. TESTING REQUIREMENTS

Tests are especially important for multi-tenancy.

At minimum test:

## Tenant isolation

Organization A cannot read Organization B.

Organization A cannot modify Organization B.

Organization A cannot delete Organization B.

Organization A cannot access Organization B conversations.

Organization A cannot access Organization B messages.

Organization A cannot send SMS through Organization B's phone number.

---

## Twilio

Test:

- valid webhook
- invalid webhook
- duplicate webhook
- unknown phone number
- known organization
- known farmer
- unknown farmer
- conversation creation
- message persistence
- status callback
- outbound failure

---

## Message processing

Test:

- valid pickup request
- incomplete pickup request
- ambiguous message
- irrelevant message
- cancellation
- correction
- different quantities
- dates

---

# 43. ERROR HANDLING

Never silently swallow errors.

API errors should have consistent responses.

Log useful backend information.

Do not expose sensitive information in API errors.

For example, never return:

DATABASE PASSWORD
TWILIO AUTH TOKEN
STACK TRACE containing secrets

to the frontend.

---

# 44. SECURITY PRINCIPLES

Always follow these principles:

1. Never trust the frontend.
2. Never expose private credentials.
3. Always validate input.
4. Always enforce organization boundaries.
5. Validate Twilio webhooks.
6. Prevent duplicate webhook processing.
7. Use database constraints where appropriate.
8. Use authenticated sessions/tokens.
9. Check authorization on every protected resource.
10. Never rely on UI hiding data for security.

---

# 45. DO NOT OVER-ENGINEER

Do NOT introduce:

- microservices
- Kubernetes
- Kafka
- event buses
- complex distributed systems
- unnecessary caching
- unnecessary infrastructure

The initial architecture should be a modular monolith.

One backend.

One PostgreSQL database.

One React frontend.

Clear internal modules.

This is sufficient for the initial SaaS.

---

# 46. GIT

Make small, understandable commits.

Examples:

feat: add organization database model

feat: add tenant scoped farmer API

feat: add conversation API

feat: add Twilio inbound webhook

feat: add pickup request model

fix: prevent duplicate Twilio messages

Do not create giant commits containing the entire application rewrite.

---

# 47. DEFINITION OF DONE

A feature is complete only when:

- implementation exists
- types compile
- validation exists
- authorization exists
- organization isolation is respected
- relevant tests exist
- build passes
- manual testing was performed
- errors are handled
- documentation is updated if necessary

Never say a feature works unless it was actually tested.

---

# 48. FIRST COMMAND TO EXECUTE

When Claude Code first opens this repository:

DO NOT modify the project immediately.

First read this file.

Then inspect the entire existing project.

Then create:

docs/CURRENT_SYSTEM.md

Do not perform the migration yet.

Report:

1. What the current application does.
2. How the current data flows.
3. How Google Sheets works.
4. How Twilio works.
5. How SMS parsing works.
6. How authentication works.
7. How the UI works.
8. What can be reused.
9. What should be replaced.
10. What the risks are.
11. The recommended next step.

Wait for approval before performing the next major phase.

---

# 49. IMPORTANT FINAL PRINCIPLE

AgriHaul should be treated as a SaaS platform from day one.

Do not build:

"One company's dashboard that might become SaaS later."

Build:

"A multi-tenant logistics platform where each company gets an isolated organization workspace."

The core tenant boundary is:

organizationId

Every organization-owned record must be safely scoped to that organization.

The most important architecture is:

Organization
↓
Users
↓
Farmers
↓
Conversations
↓
Messages
↓
Pickup Requests
↓
Assignments
↓
Drivers / Vehicles

The most important technical workflow is:

Farmer SMS
↓
Twilio
↓
Webhook
↓
Organization identification
↓
Farmer identification
↓
Conversation
↓
Message
↓
Message processing
↓
Pickup Request
↓
Dispatcher Dashboard

Build this foundation correctly before adding billing, advanced analytics, realtime infrastructure, or other sophisticated SaaS features.

# 50. COST CONTROL — VERY IMPORTANT

The developer does NOT want to spend money on infrastructure before getting paid by the first customer.

This is a hard project constraint.

The application must therefore be developed and tested using free/local resources wherever reasonably possible.

Do NOT introduce paid infrastructure unless:

1. It is technically necessary, AND
2. The developer explicitly approves the cost.

Never assume the developer has purchased:

- Netlify
- Vercel
- AWS
- Google Cloud
- Azure
- DigitalOcean
- Railway
- Render paid plans
- Supabase paid plans
- managed PostgreSQL
- paid Redis
- paid monitoring
- paid analytics
- paid email services
- paid storage

The developer previously used Netlify, but Netlify is NOT a required part of the new architecture.

---

# 51. DEVELOPMENT SHOULD COST AS CLOSE TO €0 AS POSSIBLE

During development, prefer:

- local development
- Docker
- local PostgreSQL
- free GitHub repository
- free/open-source libraries
- free development tools
- local testing
- Twilio test/development capabilities where appropriate

The goal is:

Developer laptop
↓
React frontend
↓
Node/Express backend
↓
PostgreSQL running locally
↓
Twilio only when SMS integration needs to be tested

No production hosting should be required during the early development phases.

---

# 52. LOCAL DEVELOPMENT ARCHITECTURE

The initial development environment should be:

┌──────────────────────────────────────────┐
│              Developer Laptop            │
│                                          │
│  React/Vite                              │
│  localhost:5173                          │
│          │                               │
│          ▼                               │
│  Node/Express                            │
│  localhost:3000                          │
│          │                               │
│          ▼                               │
│  PostgreSQL                              │
│  localhost:5432                          │
│                                          │
└──────────────────────────────────────────┘
                     │
                     │ when required
                     ▼
                   Twilio
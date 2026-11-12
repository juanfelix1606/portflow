# Portflow

Portflow is an independent portfolio project for container terminal operations. It uses fictional demonstration data and is not an official product of any port company.

**Tagline:** Streamlining Container Terminal Operations.

## Project status

The workspace foundation, PostgreSQL data model, authentication/session flow, admin user management, container registration/search/CSV import-export, transactional gate-in and gate-out, yard placement/relocation, movement history, and operational dashboard are in place.

## Technology

- React, TypeScript, Vite, and Tailwind CSS
- Node.js, Express, and TypeScript
- Prisma and PostgreSQL
- Vitest, Supertest, and Playwright (test coverage will grow with each feature)

## Development

Requirements: Node.js 22.12 or later and npm 10 or later. Copy `.env.example` to `.env`, set `JWT_ACCESS_SECRET` to a random secret of at least 32 bytes, and set `WEB_ORIGIN` before starting the API.

```powershell
npm install
npx playwright install chromium
npm run dev:api
npm run dev:web
```

The API health endpoint is `http://localhost:3000/api/v1/health`; the web development server uses Vite's default port.

## Database

Install or start PostgreSQL, copy `.env.example` to `.env`, and set `DATABASE_URL` to a development database you control. Then run:

```powershell
npm run db:generate --workspace=@portflow/api
npm run db:validate --workspace=@portflow/api
npm run db:migrate:dev --workspace=@portflow/api -- --name init
npm run db:seed --workspace=@portflow/api
```

The seed command creates the three application roles and fictional yard locations. It creates a demo admin only when both demo credential variables are configured. `db:migrate:dev` and `db:seed` connect to and modify the database named by `DATABASE_URL`; confirm that value before running them.

The Prisma Client is generated into an ignored source directory. Regenerate it after installing dependencies and before type-checking if it is missing; code generation and schema validation do not connect to PostgreSQL.

## Authentication

Set `JWT_ACCESS_SECRET` to a random value of at least 32 bytes and set `WEB_ORIGIN` to the exact frontend origin before starting the API. Access tokens are short-lived JWTs returned to the client for in-memory use. Refresh tokens are opaque, stored only as SHA-256 hashes, and sent in HttpOnly cookies. Auth state-changing requests require the CSRF cookie/header pair and the configured origin. Production uses Secure `__Host-` cookies and requires an HTTPS frontend origin.

To seed a local demo administrator, set both `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD` in `.env`; use a fictional `.test` email and a unique password of at least 12 characters. The password is scrypt-hashed before storage. Leaving both values empty skips creation of the demo account.

Auth endpoints: `GET /api/v1/auth/csrf`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/me`. Protected routes use bearer access tokens and backend role middleware.

Admin-only user endpoints: `GET /api/v1/users` (search, role/status filters, pagination), `GET /api/v1/users/export` (exports every matching user, independent of list pagination), `POST /api/v1/users`, `PATCH /api/v1/users/:userId`, and `PATCH /api/v1/users/:userId/password` (sets a temporary password of at least 12 characters). The CSV contains user ID, name, email, role, account status, and timestamps; it never includes password hashes or token data. Password resets hash the temporary password, audit the action without recording it, require the user to change it before accessing protected features, revoke the user's active refresh sessions, and immediately invalidate previously issued access tokens. Changing the temporary password clears the requirement, records an audit event, revokes refresh sessions, invalidates the current access token, and returns the user to sign-in. User creation and updates are written with audit entries in the same transaction. Administrators cannot disable/demote themselves or remove the last active administrator.

Container endpoints: authenticated users can `GET /api/v1/containers` with `search`, `status`, `size`, `type`, `tradeType`, `yardCode`, `from`, `to`, `page`, and `limit` query parameters, or `GET /api/v1/containers/:containerId` for details. `yardCode` matches the current yard assignment (case-insensitive after normalization). `from` and `to` filter `createdAt` by inclusive UTC calendar dates (`YYYY-MM-DD`); reversed ranges are rejected. `GET /api/v1/containers/export` accepts the same filters and streams all matching containers as CSV, regardless of list pagination. Only administrators can `POST /api/v1/containers` to register a container or use `POST /api/v1/containers/import/preview` and `POST /api/v1/containers/import` to import CSV using the `text/csv` content type. The web import form can download a header-only CSV template. Imports require the `containerNumber,size,type,tradeType` header and accept up to 500 data rows. The preview validates the full file, checks for database conflicts, and returns a sample of up to 10 rows without writing data. Confirmation uploads the selected file again and repeats validation before writing. Each identifier is normalized and validated against ISO 6346, and every new container starts in `REGISTERED` status with an initial movement and audit entry. Imports are atomic: any invalid row or duplicate number (in the file or database) rejects the whole file and returns row-level issues without inserting any records.

Gate endpoints are available to administrators and gate operators. `POST /api/v1/gate/in` and `POST /api/v1/gate/out` accept `containerId`, `vehiclePlate`, and `driverName`. Gate-in only accepts a `REGISTERED` container and atomically creates the gate transaction, advances the status to `IN_YARD`, and records movement and audit entries. Gate-out only accepts a `STORED` container with a current yard location; it atomically creates the outbound gate transaction, advances the status to `GATE_OUT`, clears its yard location, and records the source yard in movement and audit history. Repeated transactions and invalid status transitions return `409`; container row locking and the unique `(container_id, direction)` constraint protect concurrent requests. `GET /api/v1/gate` lists the gate-in/out history with `search`, `direction`, `from`, `to`, `page`, and `limit` filters, including the container, vehicle, driver, operator, and timestamp. Date filters use inclusive UTC calendar dates (`YYYY-MM-DD`). `GET /api/v1/gate/export` returns a streamed CSV of every transaction matching the search, direction, and date filters.

Administrators and gate operators can finalize the lifecycle with `POST /api/v1/containers/:containerId/complete`. Completion only accepts a `GATE_OUT` container with no yard assignment and atomically advances it to `COMPLETED`, records a movement, and writes an audit entry. Repeated completion returns `409`.

Yard endpoints are available to administrators and yard operators. `POST /api/v1/yard/placement` accepts `containerId` and a seeded active `yardCode` such as `A-01`. Placement only accepts an unplaced `IN_YARD` container, checks the destination capacity, then atomically assigns the yard, advances status to `STORED`, and records movement and audit entries. `POST /api/v1/yard/relocation` accepts the same fields, only moves `STORED` containers, preserves `STORED` status, and records both source and destination locations. Destination/source yard rows are locked in deterministic order while checking capacity so concurrent placements and relocations cannot overbook a yard.

Administrators can manage yard settings with `GET /api/v1/yard` and `PATCH /api/v1/yard/:yardId`. The list includes current occupancy. `GET /api/v1/yard/export` downloads all locations as CSV with capacity, occupied and available slots, active status, and utilization percentage. Updates may change capacity or active status; capacity cannot be reduced below occupancy, and occupied locations cannot be deactivated. The update and its audit entry run in one transaction while locking the yard row, so they remain consistent with concurrent placement and relocation. The web app includes an administrator-only yard workspace for these settings and the occupancy export.

Administrators can review audit events with `GET /api/v1/audit`, using `search`, `entityType`, `action`, `from`, `to`, `page`, and `limit` filters. Results include actor, action, entity, timestamp, and before/after values. Passwords, token values, credentials, and secrets are removed recursively from audit JSON before it is returned. Date filters use inclusive UTC calendar dates (`YYYY-MM-DD`). `GET /api/v1/audit/export` streams every matching entry as CSV, preserving the same filters and sensitive-value redaction.

Movement history is available to authenticated users at `GET /api/v1/containers/:containerId/movements` with optional `from` and `to` inclusive UTC calendar-date filters (`YYYY-MM-DD`), plus `page` and `limit` parameters (newest first). Date filters apply consistently to both the returned page and pagination totals; invalid dates and reversed ranges are rejected. It includes status transitions, source/destination locations, descriptions, operator names, and timestamps. `GET /api/v1/containers/:containerId/movements/export` accepts the same date filters and streams all matching movements as CSV, independent of the visible page. Movement records are append-only in PostgreSQL.

The authenticated dashboard is available at `GET /api/v1/dashboard/summary`, with optional `from` and `to` inclusive UTC calendar-date filters (`YYYY-MM-DD`) for gate transactions and recent movements. It returns gate-in/out totals and a per-UTC-day breakdown for the selected activity range; the web overview visualizes the daily trend. The yard-capacity card keeps its compact first-five view, can expand to show every configured location, and marks locations at or above capacity as full. `GET /api/v1/dashboard/summary/export` accepts the same date filters and downloads a CSV containing the selected period, daily gate totals, and current container/yard snapshot metrics. With no dates, gate activity remains limited to the current UTC day and the movement list shows the latest eight across the terminal. Container totals by status and active-yard capacity/occupancy remain current snapshots regardless of the activity filter. The web app includes an authenticated operations overview, a container workspace for search/filter (including container type and current yard code), detail/history, registration, CSV import preview/confirmation, gate, yard, and completion actions, a gate-history workspace for administrators and gate operators, and administrator-only user, yard, and audit-log workspaces. Container inventory, gate history, and audit log can export every record matching their current filters as CSV; container exports include all matching pages, not only the visible page. The user workspace supports search, creation, and role/status updates. The app signs in through the API, keeps access tokens in memory, and uses the HttpOnly refresh cookie and CSRF flow to restore a session. Set `VITE_API_BASE_URL` when the API is not served at `http://localhost:3000/api/v1`.

Run the current checks with:

```powershell
npm run validate
```

`npm run validate` includes the mocked browser workflows. Playwright uses fictional in-memory API responses and does not connect to PostgreSQL.

Create local environment values from `.env.example` when a feature requires them. Never commit `.env` files or real credentials.

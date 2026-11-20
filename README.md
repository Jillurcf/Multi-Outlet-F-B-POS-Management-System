# Multi-Outlet F&B POS Management System

A production-minded point-of-sale system for food and beverage businesses with multiple outlets. It includes an Express/Prisma API, PostgreSQL constraints and transactions, a staff POS UI, an HQ admin UI, dashboards, and reporting.

## Features

- Two role-specific workspaces: an outlet POS/stock workspace (`/pos`) and an HQ administration/reporting workspace (`/admin`).
- JWT authentication with database-backed role/outlet checks on every request; staff are strictly scoped to their own outlet.
- Outlet-specific menu assignments and pricing; sale-time price/name/SKU snapshots for immutable receipts and reports.
- Atomic checkout transaction with conditional stock decrements, deadlock-reducing item ordering, per-outlet receipt counters, stock movement ledger, and `Idempotency-Key` retry protection.
- Restocks, manual stock adjustments and per-item movement history.
- HQ dashboards, daily sales, revenue/transaction by outlet, top-selling items and low-stock reports over date ranges.
- Printable receipts via the browser print dialog; no PDF generation library.
- Docker Compose for development and production (Caddy HTTPS), health checks, migration automation, lint/build/typecheck/test verification and CI.

## Technology stack

| Layer | Technology |
| --- | --- |
| API | Node.js (engine `>=20`; Node 22 in Docker/CI), Express 4, TypeScript 5, Prisma 6, Zod 3 |
| Database | PostgreSQL 16 with CHECK, FK and unique constraints, indexes and an outlet receipt-counter trigger |
| Web | React 18, React Router 6, TanStack Query 5, axios, Vite 5, Tailwind CSS 3, TypeScript 5 |
| Shared code | `@pos/shared` workspace with Zod request schemas and DTO types |
| Auth | `jsonwebtoken` (JWT with `sub` only) and `bcryptjs` password hashing (cost 12) |
| Infrastructure | Docker Compose, multi-stage Dockerfiles, nginx 1.27 (static SPA), Caddy 2 (TLS/reverse proxy) |
| Quality | ESLint 9, TypeScript checks, Node test runner, GitHub Actions CI |

## Project structure

```text
.
├── apps/
│   ├── api/                 Express API, Prisma schema/migrations/seed, tests
│   │   ├── prisma/          schema.prisma, migrations/, seed.ts, seedTransactions.ts
│   │   └── src/             app, config, routes, controllers, services, repositories, middleware
│   └── web/                 React/Vite SPA, nginx config, Dockerfile
├── packages/shared/         Shared Zod schemas and DTO types
├── deploy/Caddyfile         Production HTTPS reverse-proxy configuration
├── scripts/deploy.sh        Production deploy + health verification
├── docker-compose.yml       Development stack (PostgreSQL, API, web)
├── docker-compose.prod.yml  Production stack (adds Caddy, internal-only services)
└── docs/                    Technical architecture documentation
```

## Architecture

Backend requests follow `routes → controllers → services → repositories → database`. Business rules live in services; all database access lives in repositories. HQ and outlet responsibilities, the sales lifecycle, concurrency decisions and deployment topology are detailed in [`docs/architecture.md`](docs/architecture.md).

Environment: Node.js 20+, npm 10+, PostgreSQL 16 or Docker Compose.

## Local setup

```bash
cp .env.example .env
npm install
npm run prisma:migrate
npm run prisma:seed
npm run dev:api
npm run dev:web
```

The API listens on `http://localhost:4000/api`; the web app listens on `http://localhost:5173`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | API port, default `4000` |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signing secret, at least 32 characters outside tests |
| `JWT_EXPIRES_IN` | Token lifetime such as `1d`, `12h`, or `15m` |
| `CORS_ORIGIN` | Allowed browser origin; required in production |
| `SEED_ADMIN_EMAIL` | HQ admin seed email |
| `SEED_ADMIN_PASSWORD` | HQ admin seed password |
| `SEED_ADMIN_NAME` | HQ admin seed display name |
| `SEED_STAFF_PASSWORD` | Seed password for all outlet users |
| `POSTGRES_USER` | Compose database user |
| `POSTGRES_PASSWORD` | Compose database password |
| `POSTGRES_DB` | Compose database name |
| `POSTGRES_PORT` | Host database port |
| `API_PORT` | Host API port |
| `WEB_PORT` | Host web port |
| `VITE_API_URL` | Browser-facing API base URL |
| `WEB_DOMAIN` | Public frontend hostname used by the production reverse proxy |
| `API_DOMAIN` | Public API hostname used by the production reverse proxy |
| `ACME_EMAIL` | Contact email for automatic TLS certificate issuance |

Change all seed and database passwords before any shared or production deployment.

### Docker Compose

```bash
cp .env.example .env
npm run docker:up
```

Compose starts PostgreSQL, applies Prisma migrations, then starts the API and web app on `${WEB_PORT:-8080}`. Use `npm run docker:down` to stop the stack.

## Roles and authentication

- `HQ_ADMIN` manages outlets, master menu items, outlet assignments, staff accounts, dashboards, and reports.
- `OUTLET_STAFF` views assigned menu items, updates inventory, creates sales, views receipts/history, and sees an outlet dashboard.
- Login returns a JWT containing only the user ID. Each request reloads the active user from the database.
- Staff outlet ownership always comes from the authenticated user, never from request input.
- Seeding creates one HQ admin (`SEED_ADMIN_*`) plus `MAIN` and `NORTH` outlets with `staff.main@example.com` and `staff.north@example.com` accounts (password from `SEED_STAFF_PASSWORD`). Each staff account is bound to one outlet and cannot read or change another outlet's data.
- Seeding also creates menu items, outlet assignments/inventory, and completed sales with sale-time price snapshots. These transactions are deterministic and are reused by the reporting accuracy tests.

### Demo credentials (created only after running the seed)

| Account | Email | Password |
| --- | --- | --- |
| HQ admin | value of `SEED_ADMIN_EMAIL` (`admin@example.com` in `.env.example`) | value of `SEED_ADMIN_PASSWORD` |
| Main outlet staff | `staff.main@example.com` | value of `SEED_STAFF_PASSWORD` |
| North outlet staff | `staff.north@example.com` | value of `SEED_STAFF_PASSWORD` |

No credentials are hardcoded: the seed requires the environment variables above (passwords of at least 12 characters). Replace all example values before using the system beyond local development.

## API reference

All endpoints except login and health require `Authorization: Bearer <token>`.

### Public

- `GET /api/health`
- `POST /api/auth/login`

### HQ Admin

- `GET|POST /api/outlets`
- `GET|PATCH|DELETE /api/outlets/:id`
- `GET|POST /api/outlets/:outletId/menu-items`
- `PATCH|DELETE /api/outlets/:outletId/menu-items/:menuItemId`
- `GET|POST /api/menu-items`
- `GET|PATCH|DELETE /api/menu-items/:id`
- `POST /api/users/staff`
- `GET /api/dashboard/hq`
- `GET /api/reports/sales/daily?from=<iso>&to=<iso>`
- `GET /api/reports/sales/summary?from=<iso>&to=<iso>`
- `GET /api/reports/revenue/by-outlet?from=<iso>&to=<iso>`
- `GET /api/reports/transactions/by-outlet?from=<iso>&to=<iso>`
- `GET /api/reports/top-items?from=<iso>&to=<iso>`
- `GET /api/reports/low-stock?page=1&limit=20`

### Outlet Staff

- `GET /api/auth/me`
- `GET /api/outlet/menu-items`
- `GET /api/outlet/inventory`
- `GET /api/outlet/inventory/movements`
- `POST /api/outlet/inventory/:outletMenuItemId/stock`
- `PATCH /api/outlet/inventory/:outletMenuItemId`
- `POST /api/outlet/sales`
- `GET /api/outlet/sales`
- `GET /api/outlet/sales/:saleId`
- `GET /api/outlet/sales/:saleId/receipt`
- `GET /api/dashboard/outlet`

`DELETE` deactivates records rather than removing them, preserving historical sales and auditability.

## Frontend routes

- `/login` — role-aware sign-in with persisted JWT.
- `/pos` — staff workspace: metrics, POS menu/cart/checkout with printable receipts, inventory restock/adjustment with movement history, and paginated sales history.
- `/admin` — HQ workspace: dashboard, outlets, master menu, outlet menu assignments, staff creation, and reports with revenue-by-outlet, transaction counts, low stock, and top-selling items.

Set `VITE_API_URL` to point the web app at the API.

## Data and transaction rules

- Money is stored as integer cents; quantities are integers.
- Assigning a master menu item to an outlet creates a zero-stock inventory row.
- Checkout runs in a single Prisma transaction:
  - validates that every item has an active master record and is assigned and available at the staff outlet;
  - sorts line items to reduce deadlocks;
  - atomically decrements stock only when quantity is sufficient;
  - rolls back all deductions if any item has insufficient stock;
  - increments a database-backed per-outlet receipt counter;
  - writes sale and sale-item snapshots with prices captured at sale time.
- Receipt numbers are unique per outlet via a database constraint.
- `POST /api/outlet/sales` accepts an optional `Idempotency-Key` header; retries with the same key at the same outlet return the original sale without charging stock twice.
- Database CHECK constraints protect non-negative stock and positive prices/quantities.
- HQ reports aggregate completed sales only: revenue from `sales.total_cents` and top items from `sale_items` price/quantity snapshots, never from current menu prices. The five sales reports accept `from`/`to` filtering; `low-stock` uses `page`/`limit` and reads current inventory.

## Quality checks

```bash
npm run verify
```

`verify` runs lint, production builds, TypeScript checks, and the API test suite individually:

```bash
npm run lint
npm run build
npm run typecheck
npm test
```

CI runs `npm ci` followed by `npm run verify` on pushes and pull requests.

## Prisma utilities

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run prisma:studio
```

## Production deployment

Production uses Docker Compose on a Linux VPS with Caddy for automatic HTTPS. PostgreSQL and the API are internal-only; Caddy publishes ports 80/443.

```bash
cp .env.production.example .env
```

Edit `.env` so `WEB_DOMAIN`, `API_DOMAIN`, `VITE_API_URL`, `CORS_ORIGIN`, `JWT_SECRET`, `POSTGRES_PASSWORD`, and `ACME_EMAIL` match the target host. `VITE_API_URL` must be the browser-facing API URL because Vite embeds it at build time.

DNS for both domains must point to the VPS before starting the stack. Compose reads `.env`, but `scripts/deploy.sh` checks required variables with `printenv`, so export them into the shell first (for example `set -a; . ./.env; set +a`). Then run:

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

The script builds images, applies Prisma migrations, starts all services, and verifies `https://<API_DOMAIN>/api/health` plus `https://<WEB_DOMAIN>`. Seed the database once after the first migration if the demo accounts are required:

```bash
docker compose -f docker-compose.prod.yml run --rm api npm run prisma:seed -w @pos/api
```

Useful operational commands:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f caddy
docker compose -f docker-compose.prod.yml down
```

Backups should include the `postgres_data` volume and the production `.env` file stored securely outside the repository.

## Documentation

| Document | Description |
| --- | --- |
| [Documentation index](docs/README.md) | Reading guide and status of every document |
| [Architecture](docs/architecture.md) | System context, layering, auth, sales lifecycle, stock deduction, receipt generation |
| [Database design](docs/database-design.md) | Tables, columns, constraints, indexes, migrations, concurrency decisions |
| [ERD](docs/erd.md) | Complete Mermaid entity–relationship diagram and relationship register |
| [API documentation](docs/api-documentation.md) | Endpoint reference with request/response examples and error contract |
| [Scaling strategy](docs/scaling-strategy.md) | Plan for 10 outlets / 100,000 monthly transactions; implemented vs. proposed |
| [Microservices migration](docs/microservices-migration.md) | Proposed service boundaries, events, Saga/Outbox and migration phases |
| [Offline POS and KDS strategy](docs/offline-pos-kds-strategy.md) | Proposed offline terminals, sync, receipt numbering and local kitchen displays |

Microservices migration and offline POS/KDS describe **future architecture only**; scaling strategy mixes the implemented baseline with proposals. Offline mode, KDS, message brokers and microservices are not implemented in this repository.

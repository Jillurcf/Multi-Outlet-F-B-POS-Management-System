# Multi-Outlet F&B POS Management System

A production-minded point-of-sale system for food and beverage businesses with multiple outlets. It includes an Express/Prisma API, PostgreSQL constraints and transactions, a staff POS UI, an HQ admin UI, dashboards, and reporting.

## Architecture

```text
apps/api   Express API, Prisma schema/migrations, services, repositories
apps/web   React/Vite SPA for outlet staff and HQ admins
packages/shared  Shared Zod schemas and DTO types
```

Backend requests follow `routes → controllers → services → repositories → database`. Business rules live in services; all database access lives in repositories.

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
- HQ reports aggregate completed sales only: revenue from `sales.total_cents` and top items from `sale_items` price/quantity snapshots, never from current menu prices. All reports accept `from`/`to` date filtering.

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

DNS for both domains must point to the VPS before starting the stack. Then run:

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

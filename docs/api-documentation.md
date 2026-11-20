# API Documentation

**Status:** implemented HTTP API. Base URL in development: `http://localhost:4000/api`. All paths below are relative to that base. Source: `apps/api/src/routes/**`, `controllers/**`, `services/**`, shared schemas in `packages/shared/src/schemas/**`.

## 1. Conventions

- JSON request and response bodies. `express.json` accepts up to 1 MB; no form-encoded endpoints.
- The public routes are `GET /` (service identity), `GET /health` and `POST /auth/login`. All other endpoints require `Authorization: Bearer <jwt>`.
- Successful responses return the DTO directly (arrays or objects), except paginated lists, which use `{ items, total, page, limit, totalPages }`. `DELETE` endpoints return `204` with an empty body.
- All timestamps are ISO-8601 UTC strings. Money fields are integer cents.
- Request validation uses Zod and is strict for `body`, `query` and `params` (unknown fields are rejected); header validation is intentionally permissive. `page` defaults to `1`, `limit` to `20` (maximum `100`).
- `GET` endpoints with date ranges require both `from` and `to` as parseable dates (`from <= to`); the service normalizes them to UTC day boundaries.

### Error format

Every error uses the same envelope:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock for one or more items",
    "details": { "outletMenuItemId": "...", "requestedQuantity": 2 }
  }
}
```

| Code | HTTP | Meaning |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Business rule violation detected in a service (invalid basket shape, duplicate items, quantity/price bounds) |
| `VALIDATION_ERROR` | 400 | Zod validation failure (for example empty cart or bad quantity); `details` contains `formErrors` and `fieldErrors` |
| `UNAUTHORIZED` | 401 | Missing/invalid/expired token or inactive user |
| `FORBIDDEN` | 403 | Role not allowed, or staff account has no outlet |
| `NOT_FOUND` | 404 | Unknown route or resource |
| `CONFLICT` | 409 | Uniqueness/relation conflict, including P2002 races and item availability conflicts |
| `INSUFFICIENT_STOCK` | 409 | Stock deduction failed; includes the failing item and requested quantity |
| `SERVICE_UNAVAILABLE` | 503 | Database unavailable (health endpoint) |
| `INTERNAL_ERROR` | 500 | Unexpected error; Prisma errors are mapped where recognized |

## 2. Authorization matrix

| Endpoint | Public | HQ_ADMIN | OUTLET_STAFF |
| --- | --- | --- | --- |
| `GET /`, `GET /health`, `POST /auth/login` | Yes | Yes | Yes |
| `GET /auth/me` | No | Yes | Yes |
| `/outlets/**`, `/menu-items/**`, `/users/staff`, `/reports/**`, `GET /dashboard/hq` | No | Yes | No |
| `/outlet/menu-items`, `/outlet/inventory/**`, `/outlet/sales/**`, `GET /dashboard/outlet` | No | No | Yes |

Staff outlet identity is always derived from the authenticated user; no endpoint accepts an outlet ID to override it.

## 3. Authentication and health

### `GET /`

Unauthenticated service identity probe: `200 { "service": "pos-api" }`.

### `GET /health`

```json
{ "status": "ok", "service": "pos-api", "database": "up", "timestamp": "2026-01-05T09:00:00.000Z" }
```

Returns `503 SERVICE_UNAVAILABLE` when the database check fails.

### `POST /auth/login`

Request:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"staff.main@example.com","password":"<SEED_STAFF_PASSWORD>"}'
```

Validation: `email` trimmed, lowercased, valid and ≤255 characters; `password` 1–200 characters. Passwords are compared with bcrypt; inactive users cannot log in.

Response `200`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "00000000-0000-4000-8000-000000000101",
    "email": "staff.main@example.com",
    "fullName": "Main Outlet Staff",
    "role": "OUTLET_STAFF",
    "outletId": "00000000-0000-4000-8000-000000000010"
  }
}
```

The JWT payload contains only `sub` (user ID) plus standard `iat`/`exp` claims. The server reloads the user from the database on every request, so role/outlet changes take effect immediately. Default lifetime is `1d`. Invalid credentials → `401 UNAUTHORIZED` / `Invalid email or password`.

### `GET /auth/me`

Response `200` is the bare `AuthUser` object shown above (without `token`). Returns `401` for a missing/inactive user.

## 4. HQ admin endpoints

All HQ routes require `Authorization: Bearer <token>` and role `HQ_ADMIN`.

### Outlets

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/outlets?page=1&limit=20` | `200 Paginated<OutletDto>` |
| `POST` | `/outlets` | `201 OutletDto`; `code` unique, `^[A-Za-z0-9_-]+$`, 2–50 chars |
| `GET` | `/outlets/:id` | `200 OutletDto`; UUID path param |
| `PATCH` | `/outlets/:id` | `200 OutletDto`; at least one field required |
| `DELETE` | `/outlets/:id` | `204`; sets `isActive = false` (no physical delete) |

```bash
curl -X POST http://localhost:4000/api/outlets \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"code":"WEST","name":"West Outlet","address":"3 West Road"}'
```

```json
{
  "id": "9f1c...",
  "code": "WEST",
  "name": "West Outlet",
  "address": "3 West Road",
  "isActive": true,
  "createdAt": "2026-01-05T09:00:00.000Z",
  "updatedAt": "2026-01-05T09:00:00.000Z"
}
```

Duplicate codes return `409 CONFLICT` (Prisma P2002). Creating an outlet also creates its `receipt_counters` row via a database trigger.

### Master menu

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/menu-items?page=1&limit=20` | `200 Paginated<MenuItemDto>` |
| `POST` | `/menu-items` | `201 MenuItemDto`; `sku` unique, `^[A-Za-z0-9_-]+$`, 2–50 chars |
| `GET` | `/menu-items/:id` | `200 MenuItemDto` |
| `PATCH` | `/menu-items/:id` | `200 MenuItemDto`; partial update, at least one field |
| `DELETE` | `/menu-items/:id` | `204`; sets `isActive = false` |

`MenuItemDto` fields: `id`, `sku`, `name`, `category`, `description` (nullable), `isActive`, `createdAt`, `updatedAt`. Master items carry no price; prices live in outlet assignments.

### Outlet menu assignments

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/outlets/:outletId/menu-items?page=1&limit=20` | `200 Paginated<OutletMenuItemDto>` |
| `POST` | `/outlets/:outletId/menu-items` | `201 OutletMenuItemDto`; creates zero-stock inventory row |
| `PATCH` | `/outlets/:outletId/menu-items/:menuItemId` | `200 OutletMenuItemDto`; update `priceCents` / `isAvailable` |
| `DELETE` | `/outlets/:outletId/menu-items/:menuItemId` | `204`; sets `isAvailable = false` |

```bash
curl -X POST http://localhost:4000/api/outlets/$OUTLET_ID/menu-items \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"menuItemId":"<uuid>","priceCents":550,"isAvailable":true}'
```

```json
{
  "id": "<assignment-uuid>",
  "outletId": "<uuid>",
  "menuItemId": "<uuid>",
  "sku": "COFFEE",
  "name": "Coffee",
  "category": "Beverages",
  "description": null,
  "priceCents": 550,
  "isAvailable": true,
  "quantity": 0,
  "lowStockThreshold": 0,
  "createdAt": "2026-01-05T09:00:00.000Z",
  "updatedAt": "2026-01-05T09:00:00.000Z"
}
```

Duplicates → `409 CONFLICT`; assigning to an inactive outlet or assigning an inactive master item → `409 CONFLICT`; `priceCents` must be a positive integer ≤ 100,000,000.

### Staff provisioning

`POST /users/staff` — request:

```json
{
  "email": "cashier.west@example.com",
  "password": "at-least-12-characters",
  "fullName": "West Cashier",
  "outletId": "<active-outlet-uuid>"
}
```

Response `201` is an `AuthUser` with forced role `OUTLET_STAFF`. Unknown/inactive outlet → `404 NotFoundError`; duplicate email → `409 CONFLICT`.

### Dashboards

`GET /dashboard/hq` → `200`:

```json
{
  "totalOutlets": 2,
  "activeOutlets": 2,
  "activeMenuItems": 7,
  "lowStockItemCount": 0,
  "todaySalesCount": 0,
  "todayRevenueCents": 0,
  "latestSales": []
}
```

`latestSales` contains up to five `SaleDto` objects. "Today" is the current UTC day.

### Reports

All report endpoints are `GET` and require `from` and `to` query parameters (ISO dates/date-times). Deterministic seed data makes the canonical `2026-01-05T00:00:00.000Z` → `2026-01-06T23:59:59.999Z` range useful for verification.

```bash
curl -G http://localhost:4000/api/reports/sales/summary \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'from=2026-01-05T00:00:00.000Z' \
  --data-urlencode 'to=2026-01-06T23:59:59.999Z'
```

| Endpoint | Response shape |
| --- | --- |
| `/reports/sales/daily` | `DailySalesDto[]`: `{ date, outletId, outletName, salesCount, revenueCents }` grouped by UTC day and outlet |
| `/reports/sales/summary` | `{ from, to, salesCount, revenueCents }` with normalized boundaries |
| `/reports/revenue/by-outlet` | `OutletRevenueDto[]`: `{ outletId, outletName, revenueCents, transactionCount }`, zero-sale outlets included |
| `/reports/transactions/by-outlet` | `{ outletId, outletName, transactionCount }[]` |
| `/reports/top-items` | `TopSellingItemDto[]`: `{ outletId, outletName, rank, menuItemSku, menuItemName, quantitySold, revenueCents }` — top five per outlet |
| `/reports/low-stock?page=1&limit=20` | `Paginated<LowStockItemDto>` with `{ outletMenuItemId, outletId, outletName, sku, name, quantity, lowStockThreshold }` |

```json
{ "from": "2026-01-05T00:00:00.000Z", "to": "2026-01-06T23:59:59.999Z", "salesCount": 7, "revenueCents": 11500 }
```

Revenue is `SUM(sales.total_cents)`; top items use `SUM(sale_items.quantity)` and `SUM(sale_items.line_total_cents)` snapshots. Invalid ranges return `400 VALIDATION_ERROR` with `from must be before or equal to to`.

## 5. Outlet staff endpoints

### Assigned menu

`GET /outlet/menu-items?page=1&limit=100` → `200 Paginated<OutletMenuItemDto>`. Only available assignments whose master item is active are returned. Reads are scoped to `req.auth.outletId`.

### Inventory

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/outlet/inventory?page=1&limit=20` | `200 Paginated<OutletInventoryDto>` |
| `GET` | `/outlet/inventory/movements?page=1&limit=20&outletMenuItemId=<uuid>` | `200 Paginated<StockMovementDto>`; optional item filter |
| `POST` | `/outlet/inventory/:outletMenuItemId/stock` | `200 OutletInventoryDto`; writes a `RESTOCK` movement |
| `PATCH` | `/outlet/inventory/:outletMenuItemId` | `200 OutletInventoryDto`; writes an `ADJUSTMENT` movement if quantity changed |

```bash
curl -X POST http://localhost:4000/api/outlet/inventory/$ITEM_ID/stock \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"quantity":24,"note":"Morning delivery"}'
```

```json
{
  "id": "<inventory-uuid>",
  "outletMenuItemId": "<item-uuid>",
  "menuItemId": "<master-uuid>",
  "sku": "COFFEE",
  "name": "Coffee",
  "priceCents": 500,
  "quantity": 124,
  "lowStockThreshold": 5,
  "updatedAt": "2026-01-05T09:00:00.000Z"
}
```

Validation: restock quantity is a positive integer (≤ 1,000,000); adjustments require at least one of `quantity` / `lowStockThreshold`, with non-negative integers. Inventory records outside the staff member's outlet yield `404 Inventory record not found for this outlet`.

`StockMovementDto` fields: `id`, `outletId`, `outletMenuItemId`, `sku`, `name`, `movementType`, `quantityBefore`, `quantityChange`, `quantityAfter`, `actorUserId`, `saleId`, `note`, `createdAt`.

### Sales and receipts

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/outlet/sales` | `201 SaleDto`; optional `Idempotency-Key` header |
| `GET` | `/outlet/sales?page=1&limit=20` | `200 Paginated<SaleDto>`, newest first |
| `GET` | `/outlet/sales/:saleId` | `200 SaleDto` |
| `GET` | `/outlet/sales/:saleId/receipt` | `200 ReceiptDto` (`SaleDto` + `receiptTitle`) |

Create sale request:

```bash
curl -X POST http://localhost:4000/api/outlet/sales \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: checkout-8f3c1e2a' \
  -d '{"items":[{"outletMenuItemId":"<uuid>","quantity":2},{"outletMenuItemId":"<uuid>","quantity":1}]}'
```

Response `201`:

```json
{
  "id": "<sale-uuid>",
  "outletId": "<outlet-uuid>",
  "outletName": "Main Outlet",
  "cashierName": "Main Outlet Staff",
  "receiptNumber": 6,
  "totalCents": 1450,
  "createdAt": "2026-01-05T09:00:00.000Z",
  "items": [
    {
      "id": "<line-uuid>",
      "outletMenuItemId": "<uuid>",
      "menuItemName": "Coffee",
      "menuItemSku": "COFFEE",
      "quantity": 2,
      "unitPriceCents": 350,
      "lineTotalCents": 700
    },
    {
      "id": "<line-uuid>",
      "outletMenuItemId": "<uuid>",
      "menuItemName": "Croissant",
      "menuItemSku": "CROISSANT",
      "quantity": 1,
      "unitPriceCents": 750,
      "lineTotalCents": 750
    }
  ]
}
```

Receipt response adds `"receiptTitle": "Receipt #6"`.

Validation rules: 1–50 items, unique `outletMenuItemId` per sale, quantities 1–1000, items must be assigned/available at the staff outlet with an active master record and valid price. Failure modes include `400 BAD_REQUEST` for invalid baskets, `409 INSUFFICIENT_STOCK` with the failing item details, and `409 CONFLICT` if an item became unavailable.

#### Idempotent retries

The `Idempotency-Key` header is optional (1–100 characters matching `^[A-Za-z0-9._:-]+$`). Sending the same key at the same outlet returns the **original sale DTO** with the same `201` status and performs no second stock deduction or receipt allocation. Keys are scoped per outlet, so the same key at a different outlet creates a distinct sale. The web client generates a UUID key per checkout and reuses it across failed retries.

### Outlet dashboard

`GET /dashboard/outlet` → `200`:

```json
{
  "outletId": "<uuid>",
  "outletName": "Main Outlet",
  "todaySalesCount": 2,
  "todayRevenueCents": 2550,
  "lowStockItemCount": 0,
  "latestSales": []
}
```

## 6. Security and operational notes

- Security headers on all responses: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`; `x-powered-by` is disabled.
- CORS allows exactly `CORS_ORIGIN` (default `http://localhost:5173`; required explicitly in production).
- There is no rate limiting, CSP or HSTS in the current implementation.
- Prisma errors are normalized: P2002 → `409 CONFLICT`, P2003/P2014 → `409`, P2025 → `404`, P2034 → `409` (`Write conflict detected, please retry`).
- Unknown JSON syntax returns `400 BAD_REQUEST` / `Invalid JSON body`; unknown routes return `404 NOT_FOUND` with the method and path in the message.
- Graceful shutdown handles `SIGINT`/`SIGTERM` with a 10-second forced exit and disconnects Prisma.

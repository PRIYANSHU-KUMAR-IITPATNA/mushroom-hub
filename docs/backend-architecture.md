# Mushroom Hub backend architecture

**Approved stack:** Node.js + Express 5 + TypeScript + Zod + Prisma 6.12 + Neon PostgreSQL. The REST API prefix is `/api/v1`; the deployment target is Google Cloud Run. The existing React/Vite site remains on Vercel and is not changed by the backend.

## Current implementation boundary

The `backend/` directory is an independently installable application. The Express application exposes `GET /health` and `GET /api/v1/health`, handles JSON request IDs and errors, validates CORS origins, applies Helmet, and emits structured request logs. It validates environment configuration before connecting Prisma and listening. It disconnects Prisma on `SIGTERM`/`SIGINT`.

The Prisma schema is the initial relational data model. It does not create or alter any hosted database. A database migration must be reviewed and explicitly applied by an operator. No authentication, OTP, authorization middleware, business write routes, payment processing, or production transaction service is implemented yet. Do not treat the health endpoint as a readiness check; it reports process liveness and does not query Neon.

## Code organization

```text
backend/
  prisma/
    schema.prisma       Prisma 6 PostgreSQL schema (pooled URL + direct URL)
    migrations/         Reviewed, versioned SQL migrations
  src/
    config/             Zod environment parser and Prisma lifecycle
    middleware/         request validation and centralized errors
    modules/health/     API liveness route
    routes/             versioned API router composition
    utils/              structured logger
    tests/              API, environment, and database configuration tests
    app.ts              Express app factory
    server.ts           startup, port binding, graceful shutdown
```

The API uses a small modular-monolith shape. Business areas should be added under `src/modules/<area>/` with route, input schema, service/use-case, and repository boundaries. Routes should remain thin; domain checks and writes spanning records belong in service transactions. Keep the existing frontend and its demo data paths independent until a separately reviewed frontend integration.

## Data and transaction boundaries

- Neon PostgreSQL is the source of truth for future shared operations.
- `DATABASE_URL` is the Neon pooled runtime connection. `DIRECT_DATABASE_URL` is the direct connection Prisma uses for migrations.
- Amounts and physical quantities use PostgreSQL `numeric` via Prisma `Decimal`; calculate and round monetary totals on the trusted server.
- Farmer payables and buyer receivables are separate ledgers. Corrections use linked reversal entries; do not edit/delete posted financial or inventory history.
- Physical harvest intake is represented at a named collection centre with receipt and weighing records. An accepted grade can be traced to a sellable inventory batch; rejected quantities must not create one.
- Operations that change status plus inventory/ledger/audit rows must be implemented later in a database transaction, with locking/conditional writes and idempotency. The current backend has no such write operations.
- Grade labels A/B/C/D are modeled; grade criteria, rates, prices, fees, terms, and credit limits are not seeded or inferred.

## API conventions and controls

Successful responses use `{ "data": ..., "error": null, "meta": { "requestId": "..." } }`. Errors use `{ "data": null, "error": { "code": "...", "message": "...", "details": [], "requestId": "..." } }`. Do not expose stack traces, SQL errors, credentials, or OTP values in API responses or logs.

CORS allows only configured origins; set `CORS_ORIGINS` to a comma-separated allowlist. Browser requests without an `Origin` are permitted for health checks and non-browser clients; this is not authentication. Authentication, authorization, CSRF, account provisioning, and rate limiting remain prerequisites before adding user-specific endpoints.

## Environment separation

Use independent development, staging, and production databases, Neon branches/projects, credentials, API services, storage buckets, and Vercel environment configuration. Never use a production URL for local migration development. Keep credentials in local ignored `.env` files or deployment secret stores, never in source control or frontend `VITE_*` variables.

## Deployment target

The Dockerfile is Cloud Run compatible: the process binds to `0.0.0.0:$PORT` (default 8080), responds at `/health`, and handles SIGTERM gracefully. It does not deploy, configure billing, create a Cloud Run service, or connect to a production database. Deployment, database provisioning/migration, DNS, and secret configuration require separate approval.

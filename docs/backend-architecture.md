# Mushroom Hub backend architecture

**Approved stack:** Node.js + Express 5 + TypeScript + Zod + Prisma 6.12 + Neon PostgreSQL. The REST API prefix is `/api/v1`; the deployment target is Google Cloud Run. The existing React/Vite site remains on Vercel and is not changed by the backend.

## Current implementation boundary

The `backend/` directory is an independently installable application. The Express application exposes `GET /health` and `GET /api/v1/health`, handles JSON request IDs and errors, validates CORS origins, applies Helmet, and emits structured request logs. It validates environment configuration before connecting Prisma and listening. It disconnects Prisma on `SIGTERM`/`SIGINT`.

The Prisma schema is the relational data model. It does not create or alter any hosted database. A database migration must be reviewed and explicitly applied by an operator. The farmer application module now provides persistent OTP challenges, opaque applicant sessions, consented application submission/status, and role-guarded admin review routes. A `SmsProvider` interface is injectable into the app factory, but no real provider has been selected or configured; the running server intentionally returns `503` for OTP requests. Do not treat the health endpoint as a readiness check; it reports process liveness and does not query Neon.

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
    modules/farmer-applications/
                        OTP/session, application, and admin review routes
    routes/             versioned API router composition
    utils/              structured logger
    tests/              API, environment, and database configuration tests
    app.ts              Express app factory
    server.ts           startup, port binding, graceful shutdown
```

The API uses a small modular-monolith shape. Routes validate input and keep domain writes spanning records in Prisma transactions. Applicant routes use database-backed sessions and CSRF tokens. Admin review requires an active `ADMIN` role grant; approval requires the pre-provisioned `FARMER` role. No public role provisioning or admin registration route exists. OTP challenge and phone/IP request limits use PostgreSQL so they are shared across instances; deployment must still apply an edge limit and configure the correct trusted proxy/IP boundary.

The admin portal's existing PIN-gated screens remain browser-local demos. The separate `/admin/farmer-applications` screen calls only the role-protected backend endpoints and is not authorized by the demo PIN.

## Data and transaction boundaries

- Neon PostgreSQL is the source of truth for future shared operations.
- `DATABASE_URL` is the Neon pooled runtime connection. `DIRECT_DATABASE_URL` is the direct connection Prisma uses for migrations.
- Amounts and physical quantities use PostgreSQL `numeric` via Prisma `Decimal`; calculate and round monetary totals on the trusted server.
- Farmer payables and buyer receivables are separate ledgers. Corrections use linked reversal entries; do not edit/delete posted financial or inventory history.
- Physical harvest intake is represented at a named collection centre with receipt and weighing records. An accepted grade can be traced to a sellable inventory batch; rejected quantities must not create one.
- Farmer application creation, status history, review decisions, farmer profile creation, role grant, and idempotency record are transactionally linked. OTP plaintext is never persisted; session cookies contain random opaque tokens whose hashes are stored in the database.
- The additive farmer-onboarding migration is committed but has not been applied to any database.
- Grade labels A/B/C/D are modeled; grade criteria, rates, prices, fees, terms, and credit limits are not seeded or inferred.

## API conventions and controls

Successful responses use `{ "data": ..., "error": null, "meta": { "requestId": "..." } }`. Errors use `{ "data": null, "error": { "code": "...", "message": "...", "details": [], "requestId": "..." } }`. Do not expose stack traces, SQL errors, credentials, or OTP values in API responses or logs.

CORS allows only configured origins and supports credentialed browser requests; set `CORS_ORIGINS` to exact HTTPS origins in production. Browser requests without an `Origin` are permitted for health checks and non-browser clients; this is not authentication. The browser sends `VITE_API_BASE_URL` as a public API base URL and never receives database, SMS, or OTP-hash secrets.

## Environment separation

Use independent development, staging, and production databases, Neon branches/projects, credentials, API services, storage buckets, and Vercel environment configuration. `OTP_HASH_SECRET` is server-only and must be at least 32 characters. Provider-specific SMS credentials cannot be named until a provider is approved and its adapter is implemented. Never use a production URL for local migration development. Keep credentials in local ignored `.env` files or deployment secret stores, never in source control or frontend `VITE_*` variables.

## Deployment target

The Dockerfile is Cloud Run compatible: the process binds to `0.0.0.0:$PORT` (default 8080), responds at `/health`, and handles SIGTERM gracefully. It does not deploy, configure billing, create a Cloud Run service, or connect to a production database. Deployment, database provisioning/migration, DNS, real SMS adapter/secret configuration, and role provisioning require their approved external setup.

# Mushroom Hub backend local setup

This guide covers the separate Express API under `backend/`. It does not require changing the Vercel frontend and does not provision Neon or Google Cloud resources.

## Prerequisites

- Node.js 22 or later and npm.
- A development-only Neon PostgreSQL database for database-backed work. The health/API unit tests and TypeScript build do not connect to Neon.

## Install and configure

From PowerShell:

```powershell
Set-Location C:\mushroom-hub\backend
npm ci
Copy-Item .env.example .env
```

Edit `backend/.env` locally. Never paste real values into source files, commits, tickets, or chat messages.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled PostgreSQL connection for normal application queries. Use the Neon pooler hostname and TLS (`sslmode=require`); Prisma 6.12 uses this runtime endpoint. |
| `DIRECT_DATABASE_URL` | Neon direct (non-pooler) connection for Prisma migrations and other direct database administration. Prisma 6.12 uses this URL as `directUrl`. |
| `PORT` | HTTP port; defaults to `8080`, as required by Cloud Run. |
| `NODE_ENV` | `development`, `test`, or `production`; defaults to `development`. |
| `CORS_ORIGINS` | Comma-separated exact browser origins, e.g. `http://localhost:5173`. Do not use `*`. |
| `OTP_HASH_SECRET` | Optional until a real SMS adapter is selected; when set, use at least 32 random characters and keep it server-side. It is used to HMAC OTP values and IP identifiers. |

No SMS vendor has been selected or integrated. The app factory accepts a `SmsProvider` adapter for controlled integration tests or a future approved provider, but the normal server starts without one and OTP requests return `503 OTP_PROVIDER_UNAVAILABLE`. There is no development OTP bypass. Do not treat the onboarding flow as live until a real adapter and its server-only credentials have been configured.

Use separate Neon databases/branches and distinct credentials for local development, staging, and production. Confirm the hostname and database before running any migration. The committed `.env.example` contains placeholders only; `.env` and other private environment files are ignored by Git.

## Generate, migrate, run

```powershell
npm run db:generate
npm run db:validate
npm run dev
```

The API listens on `http://localhost:8080` by default:

- `GET http://localhost:8080/health`
- `GET http://localhost:8080/api/v1/health`

Both endpoints are liveness checks. They do not prove that the configured Neon database is available. The process itself connects Prisma before binding the port.

To create and apply a migration on a disposable development database only:

```powershell
npm run db:migrate:dev -- --name initial_schema
```

Inspect the generated migration SQL and confirm the selected URL points to the intended development database before applying. Prisma may ask to reset a drifted development database; **do not approve/reset without separate authorization and confirmation that the database is disposable**. Never run `migrate dev` against staging or production. For a reviewed migration already checked into source control, the deployment command is:

```powershell
npm run db:migrate:deploy
```

That command applies migrations to the database selected by `DIRECT_DATABASE_URL`; it is intentionally not run by this guide or by server startup. Confirm backup/recovery and obtain explicit operational approval before running it against a shared or production database.

## Tests and production build

```powershell
npm test
npm run build
```

Tests compile the TypeScript and run Node's built-in test runner with Supertest. They cover health routes, safe API errors, environment parsing, CORS allowlisting, and database URL configuration without opening a Neon connection. `npm run build` generates the Prisma client and emits JavaScript under `backend/dist/`.

## Cloud Run preparation (no deployment)

`backend/Dockerfile` builds a Node 22 image. At a future deployment, configure Cloud Run's injected `PORT`, runtime secrets `DATABASE_URL`, `DIRECT_DATABASE_URL`, and `OTP_HASH_SECRET`, `NODE_ENV=production`, and an explicit production `CORS_ORIGINS` allowlist. Add provider-specific SMS credentials only after selecting and implementing a vendor adapter. Configure the Vercel `VITE_API_BASE_URL` to the Cloud Run API's `/api/v1` URL. The onboarding migration has not been applied to any database. This repository does not run `gcloud`, create a service, enable billing, configure DNS, or deploy.

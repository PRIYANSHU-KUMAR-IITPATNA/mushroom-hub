# Mushroom Hub backend

Separate Express + TypeScript REST API for Mushroom Hub. The existing React/Vite frontend remains a separate Vercel project. The API is prepared for Neon PostgreSQL and future Google Cloud Run hosting; nothing in this folder provisions or deploys those services.

## Current foundation

- Node.js 22+, Express 5, TypeScript, Zod, Prisma 6.12, Neon PostgreSQL.
- Versioned health endpoint: `GET /api/v1/health`; liveness endpoint: `GET /health`.
- JSON request IDs, restricted origin-based CORS, Helmet headers, structured request logging and a consistent JSON error envelope.
- Relational Prisma schema for users/roles, farmer and buyer profiles, training, bag batches/distribution, production, collection-centre harvest intake and weighing, A–D grades, decisions, inventory, buyer orders/dispatch, separate farmer/buyer ledgers, payments/allocations, expenses, audit records and idempotency keys.
- No OTP/authentication, business-write endpoints, payment gateway, credit workflow, or production business transactions have been implemented.
- Unit/API tests do not connect to Neon. The server requires valid database URLs and connects before it begins listening.

See [local setup](../docs/backend-local-setup.md), [architecture](../docs/backend-architecture.md), and [schema overview](../docs/database-schema-overview.md).

## Commands

Run from `backend/`:

```powershell
npm ci
Copy-Item .env.example .env
# Fill .env with a development database's Neon pooler and direct URLs.
npm run db:generate
npm run dev
npm test
npm run build
npm start
```

`npm run db:migrate:dev -- --name <migration-name>` is for a disposable/local development database only. Review migration SQL before applying it anywhere. `npm run db:migrate:deploy` applies checked-in migrations to the database selected by `DIRECT_DATABASE_URL`; it is not run automatically during startup or container build.

## Deployment preparation

The Dockerfile builds a production Node image and starts `dist/server.js` on the `PORT` provided by Cloud Run (8080 by default). Configure `DATABASE_URL`, `DIRECT_DATABASE_URL`, `PORT`, `NODE_ENV=production`, and explicit `CORS_ORIGINS` as Cloud Run runtime secrets/settings only after separate deployment approval. No cloud resources or billing are configured by this repository change.

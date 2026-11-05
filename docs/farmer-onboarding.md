# Farmer onboarding implementation

## What was discovered

- The frontend is React/Vite/TypeScript with a custom `window.location.pathname` router in `src/App.tsx`; React Router is not installed.
- English/Hindi copy is held in `src/i18n/translations.ts`. Existing farmer, buyer, and PIN-gated admin portals are browser-local demos, not production authentication.
- The Express API is versioned at `/api/v1`; it already uses Zod, a shared error envelope, Helmet, CORS allowlisting, Prisma, and the shared logger.
- `User.phoneE164`, `UserRole`, `FarmerProfile`, and the existing verification models were reused. The repository had no SMS provider, session/auth middleware, or server-authorized admin review flow.
- Vercel builds the root Vite app to `dist/`; the explicit SPA rewrite now serves direct route requests from `index.html`.

## Implemented paths

- `src/farmer/BecomeFarmerPage.tsx` provides the bilingual registration, status, FAQ, and draft privacy-notice views.
- `src/farmer/onboardingApi.ts` calls the versioned API with credentialed cookies, CSRF headers, and idempotency keys.
- `src/admin/FarmerApplicationReview.tsx` provides OTP sign-in and the separately role-protected review queue. The existing admin demo links to this page but does not authorize it.
- `src/i18n/translations.ts`, `src/App.tsx`, `src/components/layout/Header.tsx`, `src/components/layout/Footer.tsx`, `src/index.css`, and `vercel.json` wire the bilingual UI and direct routes.
- `backend/src/modules/farmer-applications/` contains OTP/session and application/review routes; `backend/src/routes/index.ts` mounts them beneath `/api/v1`.
- `backend/prisma/schema.prisma` and `backend/prisma/migrations/20261105000000_farmer_onboarding/migration.sql` add challenges, sessions, applications, and status history without modifying existing tables.

## Security and privacy boundaries

- OTP codes are generated with Node's cryptographic random generator and only an HMAC hash is stored. Challenges expire after five minutes, have five verification attempts, a 60-second resend cooldown, and shared PostgreSQL phone/IP request limits. New challenges invalidate prior active ones.
- `BrevoSmsProvider` implements the official transactional SMS send endpoint with a bounded timeout. It sends only a backend-generated OTP and treats a successful HTTP response as accepted by Brevo, not as proof of handset delivery.
- Brevo SMS is disabled by default. `BREVO_SMS_ENABLED=true` is rejected at startup unless the API key, approved sender, and OTP hash secret are configured. Provider failures are categorized in safe server logs; provider response bodies and credentials are never sent to the frontend or logged.
- Sessions use random opaque HttpOnly cookies; production cookies use `Secure; SameSite=None` for the separate Vercel/Cloud Run origins. Unsafe requests require a CSRF token. CORS remains an exact configured-origin allowlist with credentials enabled.
- Applicant status is scoped to the authenticated user. Admin routes require an active `ADMIN` role; approvals require a pre-provisioned `FARMER` role. There is no public admin registration or role-grant route. Admin provisioning remains an approved out-of-band operation.
- Internal review notes are omitted from applicant responses. The privacy notice is a technical draft and requires business/legal review before production use.

## Required external setup before a live journey

1. Verify the Brevo account has transactional SMS enabled, active credits, and an approved sender ID. The configured key authenticated against Brevo's account endpoint (HTTP 200); transactional SMS statistics returned HTTP 500, so SMS entitlement, credits, sender approval, and India route remain unverified. A valid API key alone does not establish SMS readiness.
2. Before enabling India delivery, verify Brevo's India route and comply with TRAI DLT requirements: registered sender/header, Principal Entity, and approved content template as applicable. Register the actual OTP text/template with the required dynamic variable and check any provider-specific requirements.
3. Configure `BREVO_API_KEY`, `BREVO_SMS_SENDER`, `BREVO_SMS_ENABLED=true`, and `OTP_HASH_SECRET` as backend-only settings. Locally, use `backend/.env`; in production, use Google Cloud Secret Manager for the key and hash secret. Never use `VITE_*` for secrets.
4. Configure `VITE_API_BASE_URL` in the Vercel project to the deployed API base ending in `/api/v1`; set Cloud Run `CORS_ORIGINS` to the exact HTTPS Vercel/custom origins.
5. Confirm the Neon database/project/branch and restore point. The additive migration has **not** been applied. Apply it only after reviewing the target and SQL and obtaining the required operational approval, using `npm run db:migrate:deploy` from `backend/`.
6. Provision `ADMIN` and `FARMER` roles and the initial administrator through the approved secure database/provisioning process. The application exposes no role-provisioning route.
7. Configure Cloud Run secrets, Vercel environment, and production edge/IP rate limits. Configure the forwarded-client-IP trust boundary before relying on IP-based API limits.
8. Review the privacy notice and retention policy; notification to applicants remains a follow-up because no notification provider/configuration exists.

## OTP unavailable-message diagnosis

The previous generic frontend message grouped an unconfigured frontend API URL with a disabled backend SMS provider. It now distinguishes those cases and provider send failures in English and Hindi. In the inspected local backend environment, an API key was present but `BREVO_SMS_SENDER`, `BREVO_SMS_ENABLED`, and `OTP_HASH_SECRET` were absent. Since SMS defaults to disabled, the backend did not instantiate the Brevo provider and the OTP request returns `503 OTP_PROVIDER_UNAVAILABLE`. No backend was listening locally and no local application log files were present; startup logs now include only whether an SMS provider is configured.

The checked-out `origin/main` backend also calls `createApp` without an SMS provider, while the Brevo wiring is only on `feature/brevo-transactional-sms`. Thus the current main-branch backend will always return `503 OTP_PROVIDER_UNAVAILABLE` for OTP requests. The Vercel production `VITE_API_BASE_URL` and Cloud Run environment were not inspectable from this workspace (no linked Vercel project or deployment CLI was available). No live SMS was sent.

The supplied local Neon credentials were reported as rotated, but no database connectivity check, migration, or live transaction was performed. No Vercel or Cloud Run deployment was performed.

The configured Brevo key was moved from the ignored repository-root `.env` into the ignored `backend/.env`; only the backend process loads it. The sender and `BREVO_SMS_ENABLED` remain unset/disabled, and no SMS was sent.

## Verification completed

- Frontend production build and direct-route/browser checks for `/become-a-farmer`, `/farmer-application`, `/privacy`, and `/admin/farmer-applications`; the homepage CTA was followed in the browser.
- Responsive viewport checks at 360px, 768px, and 1280px; no horizontal overflow was observed. Hindi rendering and the transient network-error/retained-phone state were checked.
- Backend TypeScript build, Prisma schema validation, and automated tests cover mobile normalization, application/review schema rules, missing SMS-provider behavior, CORS credentials, safe errors, and unauthenticated applicant/admin rejection.
- Brevo provider tests use mocked responses for accepted sends, invalid credentials, insufficient credits, sender rejection, and timeout. No test calls Brevo's send endpoint.
- There is no frontend test script in the root package. The requested `npm test` check is therefore not available for the frontend; the production build passed.
- Backend/frontend database transaction flows, live OTP delivery, and admin review against a test database remain unverified. The repository has no frontend test runner, and no isolated development database/provider was used.
- `npm audit` reported zero backend vulnerabilities and one pre-existing moderate Vite development-server advisory in the frontend dependency tree; no dependency changes were made for this unrelated issue.

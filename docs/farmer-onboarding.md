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
- `SmsProvider` is an injection boundary, not an SMS implementation. No provider has been chosen; `server.ts` supplies none and the OTP request endpoint returns `503`. No development OTP bypass exists.
- Sessions use random opaque HttpOnly cookies; production cookies use `Secure; SameSite=None` for the separate Vercel/Cloud Run origins. Unsafe requests require a CSRF token. CORS remains an exact configured-origin allowlist with credentials enabled.
- Applicant status is scoped to the authenticated user. Admin routes require an active `ADMIN` role; approvals require a pre-provisioned `FARMER` role. There is no public admin registration or role-grant route. Admin provisioning remains an approved out-of-band operation.
- Internal review notes are omitted from applicant responses. The privacy notice is a technical draft and requires business/legal review before production use.

## Required external setup before a live journey

1. Select an SMS vendor and implement its `SmsProvider` adapter; decide the vendor-specific secret names, delivery policy, and provider-side abuse limits. Until then OTP delivery is deliberately unavailable.
2. Set `OTP_HASH_SECRET` to a server-only random value of at least 32 characters, plus the provider's server-only credentials. Never use `VITE_*` for secrets.
3. Configure `VITE_API_BASE_URL` in the Vercel project to the deployed API base ending in `/api/v1`; set Cloud Run `CORS_ORIGINS` to the exact HTTPS Vercel/custom origins.
4. Confirm the Neon database/project/branch and restore point. The additive migration has **not** been applied. Apply it only after reviewing the target and SQL and obtaining the required operational approval, using `npm run db:migrate:deploy` from `backend/`.
5. Provision `ADMIN` and `FARMER` roles and the initial administrator through the approved secure database/provisioning process. The application exposes no role-provisioning route.
6. Configure Cloud Run secrets, Vercel environment, and production edge/IP rate limits. Configure the forwarded-client-IP trust boundary before relying on IP-based API limits.
7. Review the privacy notice and retention policy; notification to applicants remains a follow-up because no notification provider/configuration exists.

The supplied local Neon credentials were reported as rotated, but no database connectivity check, migration, or live transaction was performed. No Vercel, Cloud Run, Git push, or production deployment was performed.

## Verification completed

- Frontend production build and direct-route/browser checks for `/become-a-farmer`, `/farmer-application`, `/privacy`, and `/admin/farmer-applications`; the homepage CTA was followed in the browser.
- Responsive viewport checks at 360px, 768px, and 1280px; no horizontal overflow was observed. Hindi rendering and the transient network-error/retained-phone state were checked.
- Backend TypeScript build, Prisma schema validation, and automated tests cover mobile normalization, application/review schema rules, missing SMS-provider behavior, CORS credentials, safe errors, and unauthenticated applicant/admin rejection.
- Backend/frontend database transaction flows, live OTP delivery, and admin review against a test database remain unverified. The repository has no frontend test runner, and no isolated development database/provider was used.
- `npm audit` reported zero backend vulnerabilities and one pre-existing moderate Vite development-server advisory in the frontend dependency tree; no dependency changes were made for this unrelated issue.

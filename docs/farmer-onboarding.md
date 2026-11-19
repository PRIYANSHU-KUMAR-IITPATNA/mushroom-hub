# Farmer onboarding

## Registration flow

The Become a Farmer page verifies email through the Express API before showing the farmer details form. The applicant supplies a contact mobile number, farm and location details, and consent. Submitting creates an application in `PENDING_REVIEW`; email verification does not enroll or approve a farmer. Admins continue to use the existing phone OTP login and role-protected review queue.

The frontend is React/Vite/TypeScript with English and Hindi copy in `src/i18n/translations.ts`. It calls the versioned API with credentialed cookies, CSRF headers, and idempotency keys. The backend uses Express, Zod, Prisma, and Neon PostgreSQL.

## Email OTP and data model

- `POST /api/v1/auth/email-otp/request` accepts an email and sends a six-digit code through Brevo's transactional email endpoint. `POST /api/v1/auth/email-otp/verify` consumes the challenge and establishes the existing HttpOnly session.
- Codes are generated cryptographically and stored only as an HMAC hash. Challenges expire after five minutes, permit five attempts, enforce a 60-second resend cooldown, invalidate prior active codes, and use database-backed email/IP request limits shared across Cloud Run instances.
- `POST /api/v1/farmer-applications` requires a session whose user has a verified email, validates/normalizes the contact phone, and creates a single application per account. The application stores phone and block separately; the existing village/locality field is retained.
- The schema and additive migration add nullable user email/verification fields, the email challenge table, and application/profile contact/location columns. The migration is not applied. Review its SQL and target database before an approved deployment; do not reset production data.
- Provider errors are categorized without logging provider response bodies, API keys, or OTP values. A successful Brevo response means accepted for processing, not confirmed delivery.

## Configuration and operational status

Backend-only configuration:

```text
BREVO_API_KEY
BREVO_EMAIL_SENDER
BREVO_EMAIL_SENDER_NAME
BREVO_EMAIL_ENABLED
BREVO_EMAIL_TIMEOUT_MS
OTP_HASH_SECRET
```

Email is disabled by default. When enabled, startup validation requires the API key, sender address/name, and a 32-character OTP hash secret. Use `backend/.env` locally and Cloud Run Secret Manager for production secrets. Never configure a Brevo key in a `VITE_*` variable.

The local backend environment has Brevo credentials, sender settings, and email delivery enabled. Read-only Brevo account and sender API checks succeeded, but the configured sender was not present in the authorized sender list. API authentication does not establish sender authorization or successful delivery; verify the sender and transactional email status in Brevo before attempting a send. No email was sent. The local email timeout is explicitly set to 10 seconds, and a strong OTP hash secret is stored only in the ignored `backend/.env`; never copy its value into source control or chat. Configure the same secret in Cloud Run through Secret Manager.

The current local database URL assignments are invalid/placeholders, so no isolated Neon test database could be confirmed. The database was not contacted and no migration was applied. Configure valid pooled and direct URLs for the same dedicated non-production Neon database, then verify the target before requesting migration approval. No Cloud Run or Vercel deployment was performed. Configure `VITE_API_BASE_URL` to the deployed `/api/v1` URL and set Cloud Run `CORS_ORIGINS` to exact HTTPS frontend origins before production use.

## Verification

Automated delivery tests must mock the provider. Never send real test email without explicit authorization. A production-ready end-to-end claim requires an authorized email recipient, observed email receipt, successful OTP verification, and confirmation that replay is rejected; these checks have not been performed.

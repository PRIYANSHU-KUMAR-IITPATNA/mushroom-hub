# Mushroom Hub production data architecture and migration path

> **Historical planning snapshot:** This document contains the earlier Supabase/Firebase/custom-backend comparison. On 2026-11-04 the approved implementation stack became Express + TypeScript + Prisma + Neon PostgreSQL, with REST at `/api/v1` and Google Cloud Run as the API target; the existing frontend stays on Vercel. Supabase-specific recommendations below are not current implementation guidance. See [backend architecture](./backend-architecture.md), [database schema overview](./database-schema-overview.md), and [backend local setup](./backend-local-setup.md) for the approved direction.

**Status:** historical planning proposal. No production backend connection or migration is represented by this document.

## 1. What the project actually implements

The project is a React 19 + TypeScript + Vite frontend. Its paths are selected in `src/App.tsx`: `/` is the public landing page, `/farmer` is the farmer portal, `/buyer` and `/buyer/*` are buyer portal views, and `/admin` and `/admin/*` are admin portal views. These are client-side path checks, not server-enforced routes. There is no API client, database, server, provider SDK, or dependency for authentication or persistence in the current package manifest.

### Current persistence keys and shapes

All records below are JSON in browser `localStorage`, scoped to one browser profile and origin; they are not shared between users or devices. The buyer/admin session markers use `sessionStorage`, are browser-local, and are not server sessions.

| Key | Current value/schema | Observed behavior |
|---|---|---|
| `mushroom-hub-farmer-demo-v1` | `{ schemaVersion: 1, profile: FarmerProfile \| null, bagOrders: BagOrder[], trainingRegistrations: TrainingRegistration[], harvestRecords: HarvestRecord[], payments: PaymentRecord[] }` | One farmer profile and its associated lists in one local JSON document. The storage loader checks shapes and payment-to-harvest IDs; malformed values may be removed by the demo loader. |
| `mushroom-hub-buyer-demo-v1` | `{ schemaVersion: 1, profiles: BuyerProfile[], enquiries: BuyerEnquiry[], orders: BuyerOrder[] }` | Buyer profiles and their enquiries/orders share one local JSON document. The loader checks that each enquiry/order references a profile in the same document. |
| `mushroom-hub-admin-demo-settings-v1` | `{ schemaVersion: 1, bagUnitPrice: number, gradeRates: { A: number, B: number, C: number } }` | Local settings. Defaults are bag unit price 80 and grade rates A=180, B=140, C=100 (INR as presented by the UI). |
| `mushroom-hub-language` | `'en' \| 'hi'` | Browser-local UI-language preference; defaults to English. Translation dictionaries are in the client. |
| `mushroom-hub-buyer-demo-session` (`sessionStorage`) | Mobile number string | Used to find a buyer profile in the local buyer document. |
| `mushroom-hub-admin-demo-session` (`sessionStorage`) | `'open'` | Opens the demo admin view for that browser tab/session. |

Current TypeScript records, summarized from `src/farmer/types.ts` and `src/buyer/types.ts`:

- `FarmerProfile`: `id`, `fullName`, `mobile`, `state`, `district`, `locality`, `pinCode`, `registeredAt`, `mobileVerified`.
- Farmer `BagOrder`: `id`, `productId`, integer `quantity`, pickup/delivery and optional address, `unitPrice`, `subtotal`, `status: 'placed'`, `createdAt`.
- `TrainingRegistration`: `id`, `sessionId`, `registeredAt`, `status: 'registered'`.
- `HarvestRecord`: `id`, submitted timestamp/weight and status (`submitted`, `accepted`, `rejected`); accepted timestamp, accepted weight, grade A/B/C and rate; or rejection timestamp/reason; optional in-record audit trail. An accepted value is calculated as accepted kg × rate/kg, not stored separately.
- Farmer `PaymentRecord`: `id`, optional reference, `harvestId`, positive `amount`, `paidAt`, `status: 'paid'`. The demo calculates amount paid and outstanding by summing payments against the accepted harvest value.
- `BuyerProfile`: `id`, contact and business names, mobile, buyer type, location fields, creation time and `mobileVerified`.
- `BuyerEnquiry`: `id`, `buyerId`, expected quantity as a string, message, creation time, optional workflow status (`new`, `reviewed`, `follow-up`) and update time.
- Buyer `BuyerOrder`: `id`, reference, buyer/product IDs, integer kg, unit price/subtotal, pickup/delivery and optional address, status (`placed`, `accepted`, `cancelled`), optional status history and creation time.
- `BagProduct`, `TrainingSession` and `BuyerDemoProduct` are TypeScript shapes, not persisted tables. Training sessions are two hard-coded sample sessions. The farmer bag product uses the demo ID `demo-oyster-grow-bag`; its price comes from local settings. The buyer catalogue has two hard-coded oyster sample products at INR 180/kg and INR 200/kg with sample availability of 15 kg and 10 kg.

### Implemented behavior versus not implemented

- **Demo authentication only:** farmer registration and buyer sign-in accept the fixed code `123456`; farmer “verification” sets `mobileVerified: true` locally. The buyer session stores the chosen mobile number. The admin also accepts `123456` and stores `'open'` in session storage. This is intentionally simulated; it does not prove phone ownership, authenticate a server request, or secure admin data.
- **Farmer:** can save a profile, place a bag order (1–20 demo bags), register for hard-coded training sessions, and submit a harvest weight. Admin can accept/reject a submitted harvest, record accepted weight/grade/rate or rejection reason, and append a local decision audit entry. Admin can manually record a payment against one accepted harvest; the demo validates it against calculated outstanding value. These writes change only the browser-local JSON.
- **Buyer:** can create a local enquiry/profile and place an order against fixed product prices and sample availability. Admin can mark enquiries reviewed/follow-up and move an order from placed to accepted/cancelled. These do not decrement shared stock, notify fulfilment, charge a buyer, or trigger shipment.
- **Admin settings:** update local bag price and A/B/C harvest rates; those settings are not centrally shared or versioned.
- **Inventory and accounting:** there is no stock ledger or shared inventory. There are no buyer credit limits, due dates, buyer balances, buyer-side payment records, payment gateway, or verified bank transfers. Farmer payment entries are manual demo records.
- **Bilingual UI:** English and Hindi dictionaries are implemented for the public site and portals; `en`/`hi` is persisted as a local preference. User data should be language-neutral; translate UI labels from stable codes instead of persisting translated status labels.

## 2. Backend options and recommendation

Pricing was checked against official provider pages on **2026-10-19**. Prices and quotas can change; re-check and estimate SMS, taxes, regions, backups, and usage before launch.

| Option | Small-startup cost shape | Effort and fit for this project | Auth, relational data, security, recovery and scale |
|---|---|---|---|
| **Supabase** | Official pricing lists a Free plan and a Pro plan from **US$25/month**. Pro includes US$10/month of compute credits, covering one Micro compute instance; a single-project Micro setup is described as US$25/month before usage beyond included quotas. SMS/OTP provider charges, taxes, and overages are separate. Free has lower quotas and may pause inactive projects. | **Low–moderate.** Hosted Postgres, Auth, Storage, APIs and Row Level Security (RLS) mean less infrastructure to assemble. SQL migrations and transactional functions fit the current farmer/buyer/order/ledger relationships. | Built-in phone OTP support through configured SMS providers; email/password is another option. PostgreSQL foreign keys, constraints and transactions are a natural fit. RLS can enforce per-user reads/writes, but policies and privileged actions still need careful design and testing. Paid plans provide daily backups (Pro: last 7 days per current backup docs); SQL dump/export and a tested restore plan should supplement them. Can evolve to a separate trusted API/services when needed. |
| **Firebase** | Officially offers Spark (no-cost quotas for eligible services) and Blaze (pay-as-you-go). Phone verification, Firestore reads/writes, storage, functions, egress, and any relational Data Connect use have product-/region-/usage-specific charges. Do not treat “free tier” as a production cost estimate; set budgets and alerts. | **Moderate.** Firebase Authentication, Firestore and Storage integrate well with a browser application. Firestore is document-oriented, so relationships, multi-record transactions, financial allocation queries and admin reporting need denormalization and deliberate data rules. Firebase Data Connect adds a PostgreSQL-backed relational path, but is a separate design choice rather than a drop-in Firestore schema. | Phone auth is supported; Firestore Security Rules and server-side Admin SDK checks require disciplined ownership-based rules. Managed export/import is available for Firestore, but requires billing and Cloud Storage; export is not necessarily a point-in-time snapshot. Scales well, though usage-based reads and data duplication can make costs harder to predict. |
| **Custom API + PostgreSQL** | No single official price: it depends on chosen API host, managed Postgres provider/size/region, object storage, observability, backups and SMS vendor. A small deployment can start with one modest API service and database, but do not assume a specific monthly total without selecting and pricing those providers. | **Highest initial and ongoing engineering/operations effort.** The team must build and maintain API endpoints, migrations, deployment, auth integration, validation, rate limits, monitoring and restore procedures. Offers the most control and the clearest place to put business transactions. | Choose an auth provider or implement a mature standard flow; avoid writing OTP/password cryptography and delivery from scratch. PostgreSQL gives full relational integrity and transactions. Enforce authorization in the API and database, keep DB credentials server-only, and implement backup/export and restore drills. Scales flexibly but creates direct operational ownership. |

**Recommendation: Supabase Pro for the first real multi-user release, with PostgreSQL as the source of truth.** It best fits the project's relational workflow and small team: one hosted Postgres database, hosted authentication, object storage if needed, and row-level policies reduce setup while preserving SQL portability. Use its Free plan only for development/staging or a low-risk proof of concept, not as a production reliability commitment. Budget separately for India-compatible SMS delivery and its regulatory requirements; Supabase documents that phone sign-in requires an SMS provider and calls out country-specific rules such as India's TRAI DLT. If finance rules, integrations, or operational needs outgrow direct client-to-database access, put sensitive commands behind a small trusted API or database functions rather than replacing the data model.

**Trade-offs:** Supabase does not make an insecure schema secure automatically: RLS must be enabled and tested on every exposed table, privileged keys must stay server-side, and complex writes should be transactional. Firebase can be an excellent authentication/realtime product, but its default NoSQL data shape is less natural for this ledger-like relational workflow. A custom API offers control but adds the most code and operational responsibility. In every option, SMS costs and deliverability are independent concerns.

## 3. Proposed relational model

Use PostgreSQL UUID primary keys (Auth's UUID for the account identity), UTC `timestamptz`, explicit `numeric` values for weights and INR, foreign keys, unique constraints and status checks. Use `numeric(12,3)` for kg and `numeric(14,2)` for INR totals/rates unless finance/accounting requirements establish another precision. Store ISO currency code `INR` where monetary records could later support more currencies. API commands must calculate monetary values on the trusted side and round according to a documented policy.

This is a logical proposal, not migration SQL. Names and exact fields should be finalized before implementation.

| Table (proposed) | Key fields and relationships | Important integrity rules |
|---|---|---|
| `user_accounts` / Auth identity | `id UUID PK` equal to `auth.users.id`; phone/email from the trusted auth provider; account state and timestamps. | Unique normalized phone where present. Auth identity proves sign-in, not business role. |
| `user_roles` | `(user_id FK, role)` with role `farmer`, `buyer` or `admin`, assigned timestamp and assigning admin. | Only a trusted provisioning process/admin can grant or revoke roles; never accept role changes from the account owner. Decide whether users may hold multiple roles. |
| `farmer_profiles` | `user_id PK/FK`; full name; normalized phone reference; state, district, locality, PIN; optional coarse coordinates only if needed; created/updated times. | One farmer profile per farmer account; validate location and phone server-side. Avoid collecting exact location without a clear need/consent. |
| `buyer_businesses` | UUID; business name/type; address/location; business status; creator account; timestamps. | Business belongs to its owner account; add reviewed/verified business status only if an actual process is approved. |
| `buyer_profiles` / business members | UUID; `business_id FK`; `user_id FK`; contact name and contact preferences. | Membership/ownership rules define which buyer users can act for the business; uniquely constrain membership. |
| `buyer_enquiries` | UUID; business and submitting-user FKs; expected quantity and unit; message; created time; workflow status. | Buyer can create/read own business enquiries; admin can review/update. Record workflow changes in audit history, not just the latest value. |
| `products` | UUID; stable SKU; kind (`bag` or `mushroom`); name/description or translation keys; unit; active flag; timestamps. | Do not rely on hard-coded product IDs/prices as live catalogue. |
| `catalogue_offers` | UUID; product FK; buyer-facing unit price/currency; published state; effective dates; optional grade/pack details. | Historical order lines copy the agreed unit price and unit; editing an offer must not rewrite existing orders. |
| `inventory_locations` and `inventory_movements` | Location UUID; product FK; signed quantity delta in the product's unit; movement kind; actor; timestamp; optional explicit FK to bag-order line or buyer-order line and reason. Current stock is the sum of movements (or a reconciled projection). | Record receipts, reservation/commit, cancellation release, spoilage and adjustments as movements. Prevent overselling in a transaction that locks/validates available stock; do not trust a cached browser quantity. Record an adjustment reason and actor. |
| `bag_orders` and `bag_order_lines` | Order UUID; farmer `user_id`; status/history; fulfillment/address snapshot; timestamps. Lines reference product and store positive quantity, unit-price snapshot and currency. | Create order + inventory reservation atomically if reserving stock. Enforce allowable transitions server-side. Existing demo only has one bag product and a `placed` status. |
| `training_sessions` and `training_registrations` | Session UUID, start time, location/capacity/status; registration UUID with session and farmer FKs, status and timestamps. | Unique `(session_id, farmer_user_id)`; capacity checked transactionally if introduced. |
| `harvest_submissions` | UUID; farmer `user_id`; submitted kg; current status; submitted time; accepted kg, grade, rate/kg and decision time when accepted; rejection reason/time when rejected. | Submitted kg > 0. Accepted state requires accepted kg > 0, grade in A/B/C, rate >= 0 and no rejection reason. Rejected state requires a non-empty reason and no accepted values. Pending state has no decision fields. Use a conditional update/transaction so only a currently submitted harvest can be decided. |
| `harvest_decision_audit` | UUID; harvest FK; actor user FK; action; prior/new status; accepted kg, grade and rate snapshot or rejection reason; note; `created_at`. | Append-only to application roles. Every accept/reject/correction is a committed audit event; do not overwrite or erase the decision history. |
| `farmer_payments` and `farmer_payment_allocations` | Payment UUID; farmer FK; amount, currency, paid/recorded time, reference, method, external reference if applicable, recorder and status. Allocation UUID links payment to accepted harvest and amount. | Amount > 0; payment and harvest farmer must match. Allocate only against accepted harvests. In one transaction, prevent duplicate idempotency keys, over-allocation and allocation beyond current accepted value. Posted records are corrected through reversals/adjustments, not silent edits/deletes. |
| `buyer_orders`, `buyer_order_lines`, `buyer_order_status_history` | Order UUID; buyer business and submitting-user FKs; line items with product, quantity/unit and agreed unit-price snapshots; fulfillment/address snapshot; current status; history rows with actor/time/reason. | Validate catalogue eligibility and stock on the server; transition via a transaction and append status history. A buyer must not update its own order to an admin-only state. |
| `admin_settings` | Key, typed/validated JSON or typed columns, value, version/effective time, updated by. | Admin-only write; each update is auditable and applies prospectively. Keep the rate captured on a harvest and price captured on an order immutable for historical calculations. |
| `audit_logs` | UUID; actor; action; entity type/id; timestamp; request/idempotency correlation ID; minimal before/after fields or change summary. | Append-only to application roles, private to authorized admins/auditors. Redact tokens, OTPs, secrets and unnecessary personal data. |

### Derived balances and historical values

- **Accepted harvest value:** derive as `accepted_weight_kg * rate_per_kg` from the accepted harvest snapshot. Do not maintain a separately editable total. Store weight, grade and rate chosen at decision time so later rate-setting changes do not reprice historical harvests.
- **Farmer harvest outstanding:** derive as accepted value minus the sum of valid payment allocations. Reject allocations that exceed the due amount within the transaction. Do not store an independently edited balance.
- **Buyer credit/balance (future functionality; not implemented):** add `buyer_credit_terms` with business FK, approved credit limit, currency, effective dates, due-days/terms and approver; derive current receivable from posted buyer invoices/charges less posted buyer payment allocations and reversals. Show “available credit” as limit less open receivables and applicable order commitments, derived transactionally. Do not add a mutable balance column as source of truth.
- **Buyer payment records and due dates (future functionality; not implemented):** introduce `buyer_invoices`/receivables, `buyer_payments` and `buyer_payment_allocations` only after deciding whether orders are prepaid, invoiced, or cash-on-delivery. Keep receipt reference, method, recorded/settled status and allocation audit; never imply a payment processor is connected today.
- **Inventory:** use the movement ledger as the audit source; if a materialized stock projection is later added for performance, update it in the same transaction and reconcile it against movements.

## 4. Access-control matrix

This is the **proposed production** policy, not current behavior.

| Data | Farmer | Buyer | Admin |
|---|---|---|---|
| Own account/profile | Read/update own permitted profile fields; cannot set role/verification state | Read/update own contact and business membership fields; cannot self-approve business or role | Read for support/operations; role grants are restricted and audited |
| Other users' profiles and private contact data | No access | No access except authorized members of own business | Need-to-know access only; audited |
| Catalogue, published training sessions | Read active offers/sessions | Read active offers | Create/update/deactivate |
| Farmer bag orders and training registrations | Create/read own; request allowed cancellation if enabled | No access | Read/manage operational status |
| Harvest submissions | Create/read own and decision outcome; cannot change accepted facts | No access | Read; decide submitted harvest via validated command; correction requires reason and audit |
| Farmer payments/allocations | Read own; no posting | No access | Record/reconcile with role and audit; no silent mutation |
| Buyer enquiries/orders | No access | Create/read own business data; permitted cancellation only through transition command | Read/review/update workflow; transition orders through validated command |
| Inventory movements/stock | No direct writes; optionally read farmer-facing availability | Read published availability only | Receive/adjust/fulfil via audited commands |
| Buyer credit/payment records (**future**) | No access | Read own business terms and ledger; initiate payment or report payment only as designed | Approve limits and reconcile/post receipts |
| Settings and audit logs | No access | No access | Authorized admin only; sensitive audit access can be separately limited |

For Supabase, enable RLS on every exposed table before exposing data through its client API. Policies should key ownership from the authenticated UID (`auth.uid()`), follow explicit business membership, and deny by default. Writes that span tables or enforce money/stock constraints should use a database transaction/function with narrowly granted execution rather than several client writes. Keep `service_role` and any database credentials on a trusted server only; never ship them to Vite/browser code.

## 5. Security, operational controls, and privacy

### Authentication and authorization

- Replace fixed demo codes with real phone OTP from Supabase Auth and a configured supported SMS provider, or choose another managed authentication method (for example email magic link/password plus MFA for admins). Verify the OTP with the provider and use its signed, expiring session/token; never accept a code typed by the browser as proof by itself.
- Normalize phone numbers to E.164, require verified contact before linking an account, rate-limit OTP requests and attempts, add CAPTCHA/abuse controls, monitor delivery/verification failures, and review Indian TRAI DLT and provider rules before enabling SMS. Budget for per-message charges and fraud.
- Assign `farmer`, `buyer`, or `admin` roles on the trusted side only. Admin access must never be trusted merely because the frontend says the user is an admin: UI flags/routes are user-controlled and can be changed or bypassed. Check signed identity and server/database role on every privileged operation; protect role provisioning with MFA, limited operators and audit logs.
- Require MFA for administrators where feasible, short-lived/revocable sessions, secure token handling, logout/revocation behavior, and a recovery path that does not let an attacker self-promote.

### Validate business operations on the trusted side

- **Harvest decisions:** verify the caller's admin role, current status, submitted weight, accepted weight/grade/rate bounds and rejection reason; make the status change and append-only audit event atomically. Use optimistic/conditional state checks so concurrent decisions cannot both succeed.
- **Orders and inventory:** validate the buyer/business relationship, active product/offer, server-side price, integer/positive quantities, delivery requirements, stock and allowed transition. Enforce stock reservation/movement and order-history changes in one transaction. Never accept client-supplied totals as authoritative.
- **Payments:** accept only authorized finance/admin commands; validate currency, positive amounts, farmer/harvest ownership, accepted harvest, remaining balance, duplicate/idempotency key, and payment reference. Commit payment and allocations together. Distinguish a manually recorded transfer from a verified provider webhook; verify webhook signatures and make handlers idempotent if a payment provider is later added. Do not treat a UI “paid” flag as bank confirmation.
- Validate all inputs server-side (lengths, types, enums, numeric precision, addresses, upload type/size), protect public endpoints from abuse, use TLS, and return only data needed by the caller.

### Secrets, backup, audit and privacy

- Vite `VITE_*` values are public build-time configuration. A Supabase publishable/anon key may be present in the browser only with effective RLS and is not a secret; service-role keys, database passwords, SMS credentials, webhook signing secrets and payment-provider secrets belong in the deployment secret manager/server environment. Never commit them, put them in client bundles, logs, or this document.
- Configure automated database backups, retain separate encrypted exports under restricted access, and rehearse restore to a separate environment. Supabase documents daily backups on paid plans (Pro currently retains 7 days; verify plan details). Test both schema and data recovery, including uploaded files and any external provider reconciliation. Do not assume backup equals point-in-time recovery; choose/price PITR if the recovery-point objective requires it.
- Establish a written recovery-point objective (RPO), recovery-time objective (RTO), backup retention, access review, incident contact and restoration checklist before launch. Use least-privileged operator access and alert on backup failures, policy denials, OTP spikes, unusual admin changes and failed payment/stock transactions.
- Keep decision, order, inventory, payment and role changes append-audited with actor, UTC timestamp, reason and correlation/idempotency key. Restrict log access, avoid secrets/OTP contents, and set retention/deletion policies consistent with tax/accounting and applicable privacy law.
- Minimize collection: collect only business and farmer data needed to operate the service; give clear notice/consent, define retention and account correction/deletion workflows, limit staff access, encrypt backups, and assess applicable Indian privacy, telecom, tax and record-keeping obligations before launch. Do not store identity documents, precise location, payment credentials or sensitive information unless an approved use case requires it.

## 6. Staged migration with demo preserved

1. **Baseline and decisions (this step).** Record the local keys/shapes and distinguish demo from live operations. Preserve the current local data untouched. Select data owner, launch scope, regions, support process, RPO/RTO and budget.
2. **Production design in an isolated environment.** Create a separate Supabase development/staging project, schema migrations, Auth configuration and test SMS setup. Seed only approved catalogue, training and settings values. Add RLS and transactional commands; test with multiple farmer/buyer accounts and admin/non-admin users, including cross-account denial and concurrent stock/payment attempts.
3. **Verify security and operations before real data.** Review policies and SQL functions, perform a role-based test matrix, check logs/secrets, set provider spending alerts and quotas, exercise backup/restore and incident procedures. Keep production credentials and data separate from staging.
4. **Pilot without replacing the demo.** Deploy backend-capable UI behind an explicit feature flag or separate test/staff URL. Leave existing demo routes and browser keys intact. Test registration, OTP, profile, catalogue, order, harvest decision and payment recording using clearly identified test data. A browser-only dual-write is not a safe migration strategy.
5. **Choose a cutover and data-import policy.** Decide whether the browser demos are disposable samples or contain user-entered records worth transferring. If importing, first provide a user-initiated export/consent process, preserve a read-only copy, dry-run schema mapping and duplicates, reconcile counts/totals, and mark old records as imported/unverified. Do not infer verified phone ownership/admin status from `mobileVerified` or the demo code; re-verify accounts and provision roles through trusted administration. Keep import id mappings and a reconciliation report.
6. **Controlled production cutover.** Launch for a limited cohort after acceptance and security tests pass. Give each cohort one write source at a time; stop accepting production changes in the demo for that cohort at the agreed cutover, but do not silently clear/delete its local demo data. Monitor error rates, denied policies, stock and ledger reconciliation, auth delivery and support tickets. Keep a rollback plan that restores the prior UI without discarding committed backend records.
7. **Expand and retire deliberately.** Add users/cohorts in stages, periodically reconcile derived balances and inventory projections, retest restores, and only deprecate demo storage after stakeholders explicitly approve retention/export and a stable production period. Existing demo keys should not be cleared merely because the backend is introduced.

## 7. Outstanding decisions before implementation

- Confirm that Supabase is acceptable, preferred deployment region/data residency, production availability requirements, expected user count and monthly budget.
- Select India-capable SMS/WhatsApp/email channel and provider; verify TRAI DLT obligations, sender registration, templates, delivery reliability, OTP abuse controls and per-message cost.
- Define account lifecycle, whether a phone can represent multiple roles/businesses, buyer membership/invitation and business verification, admin provisioning and MFA/recovery.
- Approve business rules for harvest re-decisions/adjustments, rate effective dates, rounding, payment methods/proof/reversal, and who is authorized to record/reconcile each payment.
- Define catalogue units, bag SKUs, locations, reservation/fulfilment/cancellation behavior, stock counts and whether training capacity/attendance is in scope.
- Decide if buyer credit is required at launch. If yes, determine invoice timing, terms, limit approval, ageing, partial payments, reconciliation and legal/accounting treatment before implementing the future ledger.
- Decide which demo data, if any, should be imported; define consent, verification, duplicate handling, retention, ownership and reconciliation requirements.
- Set RPO/RTO, backup retention, audit retention, support/admin staffing, privacy notice and data-subject request process.

## Official references checked

- [Supabase pricing](https://supabase.com/pricing) and [Supabase billing and quotas](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase phone sign-in](https://supabase.com/docs/guides/auth/phone-login), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), and [database backups](https://supabase.com/docs/guides/platform/backups)
- [Firebase pricing](https://firebase.google.com/pricing), [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Firebase Auth limits and phone verification limits](https://firebase.google.com/docs/auth/limits), and [Cloud Firestore export/import](https://firebase.google.com/docs/firestore/manage-data/export-import)

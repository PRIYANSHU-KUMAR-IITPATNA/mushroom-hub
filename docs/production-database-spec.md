# Mushroom Hub production database specification

**Status:** finalized design specification only. This is not migration SQL and does not create or connect to Supabase. The existing browser-local demo and its workflows remain unchanged. Nothing in this document asserts that a database, authentication provider, RLS policy, migration, or cloud infrastructure has been implemented.

## 1. Scope, conventions, and assumptions

This specification makes the logical design in `production-data-architecture.md` and `production-implementation-plan.md` concrete. Approved business rules below are design decisions, not evidence of deployed schema, security, or production readiness. Items explicitly identified as owner/deployment decisions remain unresolved.

### Naming, identity, time, units, and deletion

- Use `public` schema tables only where needed by the client; enable RLS before exposing any table via Supabase APIs. Keep internal/idempotency tables unexposed where possible.
- Supabase `auth.users.id` is the authentication identity. `user_profiles` has a stable application UUID; its nullable, unique `auth_user_id` maps to `auth.users.id`. Trusted authorization resolves `auth.uid()` through this mapping. Do not copy passwords, OTPs, provider tokens, or credentials into application tables.
- Primary entity IDs are `uuid NOT NULL DEFAULT gen_random_uuid()`. All timestamps are `timestamptz NOT NULL DEFAULT now()` and represent instants in UTC. Client-supplied timestamps are not authoritative.
- Use PostgreSQL `numeric(12,3)` for kilograms and other physical quantities; `numeric(14,2)` for INR amounts and prices; currency is `char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR')`. INR is the approved currency. The calculation rounding rule and whether rates need a scale finer than two decimal places are owner/deployment configuration decisions to settle before migration.
- Store stable codes/status values, never translated English/Hindi labels. Current UI language remains a client preference, not a business record.
- Use `created_at`, `updated_at` as applicable. Set `updated_at` using a database trigger. Do not use soft deletion for posted financial, inventory, harvest-decision, status-history, or audit facts. Correct them with explicit reversal/correction records and audit. Normal account closure archives/deactivates access; it does not destructively delete the profile or cascade-delete related records. Anonymize only where legally or operationally required. Retention periods, legal holds, and the exact anonymization procedure remain owner/legal decisions.
- The following defaults are structural, not business prices or seed data. No live price, training schedule, initial stock, or user is specified here.

### Constraint versus transaction rule

Use declarative constraints for row-local properties: `NOT NULL`, `CHECK`, `UNIQUE`, and foreign keys. Rules that compare rows, authorize a caller, depend on the current status/balance/stock, or write a history/ledger entry across tables require a trusted transactional function/API operation. PostgreSQL `CHECK` constraints must not be used to query other rows. RLS is an access boundary, not a substitute for integrity constraints.

## 2. Proposed schema

`auth.users` is managed by the selected authentication provider and is not recreated. Types below are explicit. Unless otherwise stated, every primary key and foreign key is non-null; every column not marked nullable is `NOT NULL`. Defaults shown are the only default values proposed. Status and enum choices retain current terminology where possible; the business transitions specified below are settled design rules. Other status values must not be introduced without an explicit design decision.

### Identity, roles, and profiles

#### `user_profiles`

One application profile per authenticated identity.

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK; stable application identity |
| `auth_user_id` | `uuid` | nullable UNIQUE FK `auth.users(id) ON DELETE SET NULL`; set/cleared only by trusted identity lifecycle operation |
| `display_name` | `text` | NOT NULL; `length(trim(display_name)) BETWEEN 1 AND 120` |
| `phone_e164` | `text` | nullable; UNIQUE when present; format validation in trusted signup flow |
| `phone_verified_at` | `timestamptz` | nullable; set only from verified Auth claims/server logic, never user-editable |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `updated_at` | `timestamptz DEFAULT now()` | NOT NULL; trigger-maintained |
| `archived_at` | `timestamptz` | nullable; profile deactivation only, subject to retention policy |

The Auth UUID is the authentication identity, not a role. Do not duplicate auth credentials. A unique phone may be insufficient if product decisions allow multiple identities/business roles per phone; confirm phone/account rules before enforcing uniqueness. Application records reference the stable profile ID, not `auth.users`, so account deactivation or approved Auth identity deletion need not cascade-delete retained business facts.

#### `user_roles`

| Column | Type / default | Constraints |
|---|---|---|
| `grant_id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `user_id` | `uuid` | NOT NULL FK `user_profiles(id) ON DELETE RESTRICT` |
| `role` | `text` | NOT NULL; CHECK in `('farmer','buyer','admin')` |
| `assigned_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `assigned_by` | `uuid` | nullable FK `user_profiles(id) ON DELETE RESTRICT`; null permitted only for controlled operator provisioning |
| `grant_reason` | `text` | NOT NULL; trimmed length 1–500 |
| `revoked_at` | `timestamptz` | nullable; null means currently active |
| `revoked_by` | `uuid` | nullable FK `user_profiles(id) ON DELETE RESTRICT`; null only for controlled system action |
| `revocation_reason` | `text` | nullable; trimmed length 1–500 when present |

Add these row-local constraints:

```sql
CHECK (role IN ('farmer', 'buyer', 'admin')),
CHECK (length(trim(grant_reason)) BETWEEN 1 AND 500),
CHECK (
  (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
  OR
  (revoked_at IS NOT NULL
   AND revocation_reason IS NOT NULL
   AND length(trim(revocation_reason)) BETWEEN 1 AND 500
   AND revoked_at >= assigned_at)
)
```

The first role constraint is listed with the column above and must be implemented once, not duplicated. The state CHECK makes an active row have no revocation fields and a revoked row have a timestamp and non-empty reason. Whether `revoked_by` is present is determined by trusted execution: ordinary admin revocation requires it; restricted operator/system recovery may use null and must record the approvers and change reference in the immutable audit event. `assigned_by` is required for ordinary grants and may be null only for controlled operator bootstrap/recovery, with corresponding immutable audit evidence. The database cannot establish from a nullable actor column alone that a null actor is legitimate.

Create a partial unique index on `(user_id, role) WHERE revoked_at IS NULL`. This index enforces at most one active row per profile and role, including under concurrent grants. A trigger rejects DELETE, changes to grant identity/attribution/reason fields, any update to an already-revoked row, and any transition other than active to revoked. Revocation is one conditional trusted update from active to revoked; a grant cannot be reopened or deleted. Re-grant inserts a distinct row with a new `grant_id` after revocation, preserving all prior grant rows. No direct INSERT/UPDATE/DELETE is granted to `anon` or `authenticated`; enable RLS with no client policies as an additional deny boundary. Normal admins may grant and revoke only `farmer` and `buyer` for other profiles; they cannot change any `admin` grant or any of their own grants. Admin grant/revocation/recovery is restricted to the operator process below.

#### `private.admin_operator_actions`

This internal append-only ledger records each two-person, operator-only admin-role action, including initial bootstrap, later admin-role grants/revocations, and lost-admin recovery:

| Column | Type / default | Constraints |
|---|---|---|
| `action_id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `operation` | `text` | NOT NULL; CHECK in `('initial_admin_bootstrap','admin_role_grant','admin_role_revocation','admin_recovery')` |
| `change_reference` | `text` | NOT NULL UNIQUE; trimmed length 1–200 |
| `target_auth_user_id` | `uuid` | NOT NULL; immutable Auth UUID snapshot, not an FK |
| `target_profile_id` | `uuid` | NOT NULL FK `user_profiles(id) ON DELETE RESTRICT` |
| `primary_operator_reference` | `text` | NOT NULL; trimmed length 1–200 |
| `backup_operator_reference` | `text` | NOT NULL; trimmed length 1–200; must differ from primary operator reference |
| `approval_bundle_sha256` | `text` | NOT NULL UNIQUE; exactly 64 lowercase hexadecimal characters |
| `occurred_at` | `timestamptz DEFAULT now()` | NOT NULL |

Enforce the listed field rules with row-local CHECK constraints, including `trim(primary_operator_reference) <> trim(backup_operator_reference)` and `approval_bundle_sha256 ~ '^[0-9a-f]{64}$'`; the change reference, action ID, and approval digest have UNIQUE constraints as shown.

The unique change reference and digest prevent the same recorded approval bundle from being applied twice in this database. A trusted transaction verifies that operation, target Auth UUID/profile, grant changes, and corresponding audit event match this action row. These cross-row matches are transaction rules. The database cannot verify the signatures or real-world identity behind operator references; the restricted runner must do that before connecting. Enable RLS with no client policies, revoke all client privileges, and deny UPDATE/DELETE with grants and an immutability trigger. Do not expose this table through Supabase APIs.

#### `private.admin_bootstrap_state`

This internal, non-API-exposed table is a permanent one-time marker for initial administrator setup in each database environment:

| Column | Type / default | Constraints |
|---|---|---|
| `bootstrap_name` | `text` | PK; CHECK `bootstrap_name = 'initial_admin'`; permits at most one initial bootstrap marker |
| `target_auth_user_id` | `uuid` | NOT NULL; immutable snapshot of the selected Auth UUID; UNIQUE |
| `target_profile_id` | `uuid` | NOT NULL UNIQUE FK `user_profiles(id) ON DELETE RESTRICT` |
| `bootstrap_grant_id` | `uuid` | NOT NULL UNIQUE FK `user_roles(grant_id) ON DELETE RESTRICT` |
| `operator_action_id` | `uuid` | NOT NULL UNIQUE FK `private.admin_operator_actions(action_id) ON DELETE RESTRICT` |
| `completed_at` | `timestamptz` | NOT NULL; database transaction time |

The table has no client policies or client grants and is not added to Supabase's exposed schemas. Revoke all privileges from `PUBLIC`, `anon`, and `authenticated`; enable RLS with no client policies as a further deny boundary. Its marker row is insert-only and permanent: deny UPDATE and DELETE through grants and an immutability trigger; the restricted bootstrap/recovery operator may not reset or remove it. The primary key plus immutable row prevents a second bootstrap in the same database, including after the original admin grant is revoked. The unique grant/profile/action references and transaction checks bind the marker to the original target and grant; a trusted operator transaction must verify that the grant is an `admin` grant for that target profile and that its profile mapped to the recorded Auth UUID at bootstrap time. The Auth UUID is retained as a snapshot rather than a foreign key so approved Auth identity deletion cannot erase or block this permanent setup evidence. These cross-row conditions are not expressible as this table's CHECK constraints.

#### Initial admin bootstrap and operator recovery

Initial bootstrap is a one-time, environment-specific deployment operation, not a public RPC, authenticated function, or browser capability. No reusable bootstrap function is installed. A reviewed operator runner must verify the selected Auth identity through the provider-supported administrative workflow and independently confirm the intended person out of band; its SQL step must confirm that `auth.users.id` exists, is not already mapped to a different profile, and that the profile is not archived. The Auth row's existence alone does not prove that the person or phone was correctly verified. The exact provider claim/admin API and database-read permissions used for this check require verification for the selected Supabase project and plan.

Two-person approval is evidenced by a canonical, environment-bound change manifest containing the project/environment identifier, target Auth UUID, operation, and change reference. The named primary and backup operators must approve the same manifest through the approved change-control system. The restricted runner verifies both approvals as independently authenticated and distinct, verifies that the signed manifest digest matches the requested operation and environment, and only then opens the database transaction. The operator-action row records both operator references, change reference, and digest. Database CHECK/UNIQUE constraints require distinct non-empty references and prevent reusing the same recorded change reference/digest; they cannot prove who controlled those references or validate signatures. That proof depends on the external approval system and runner credential custody. Never store approval secrets or private signing keys in the database.

The runner uses a restricted migration/operator database identity, separate from application roles and from any browser credential. The migration identity requires schema/object creation and ownership/DDL privileges for reviewed migrations, plus `USAGE` on `auth` and `REFERENCES` on `auth.users` to create the identity FK. The bootstrap transaction identity requires narrowly scoped `USAGE` on the internal schema; `SELECT` on the required `auth.users` identity key and relevant application rows; and `INSERT` on the profile, role, audit, operator-action, and marker rows. It must not grant those privileges to application roles. Whether the selected Supabase migration connection supports these exact grants, `auth.users` lookup, and transactional execution requires project-specific verification; do not assume a built-in role name or API key has them. Revoke `USAGE` on the internal schema and all table privileges on operator-action/marker tables from `PUBLIC`, `anon`, and `authenticated`; grant no execute on operator bootstrap/admin-recovery procedures to any client role. Revoke direct `SELECT/INSERT/UPDATE/DELETE` on `user_roles` and `audit_logs` from `anon` and `authenticated`; expose only approved reads and ordinary role-change functions through narrow views/functions. If normal role-change function execution is granted to `authenticated`, every invocation must independently resolve `auth.uid()` and enforce active-admin, non-self, farmer/buyer-only rules inside the function. No service-role browser/API credential is a substitute for the restricted migration/operator connection.

In one transaction the runner locks the bootstrap path, verifies there is no marker and no existing or historical admin grant, verifies the target identity/profile relationship, creates or maps the stable profile, inserts the `initial_admin_bootstrap` operator-action row, inserts the first `admin` role row with a non-empty reason and null `assigned_by`, writes `role.granted` and `admin.initial_bootstrap` audit rows with `source='system'`, null actor, and a `change_summary` containing the operator-action ID, grant ID, target profile ID, both approval references, change reference, and approval digest, then inserts the permanent marker. All object names are schema-qualified; SQL is static/parameterized, uses no dynamic SQL, and does not accept a client actor identity. Any failure rolls the whole transaction back. The unique marker is the final durable one-time guard; concurrent attempts must serialize or one must fail its unique-key insert. A post-commit verification confirms the marker, profile mapping, active grant and audit rows. The operator identity/reference is not represented as an application role.

Normal admin grant/revocation functions are separate: derive the actor from trusted authenticated context, require an active admin, reject self-targets and role `admin`, require a reason, conditionally mutate only farmer/buyer grants, and write the audit event in the same transaction. A grant emits `role.granted`; a revocation emits `role.revoked`. Each event sets `entity_type='user_roles'`, the affected grant ID, database-derived non-null `actor_user_id`, `source='admin'`, and required reason; its minimal change summary includes target profile, role, and resulting grant state. Each retryable normal grant/revocation uses `request_idempotency` scoped to the derived actor and fixed operation; same key/hash returns the original result, changed payload rejects, and the idempotency row and role/audit writes commit atomically. Bootstrap and operator-only admin recovery do not accept a client idempotency key or use a caller profile as actor; they use a signed one-time manifest, unique `admin_operator_actions.change_reference`/digest, and permanent bootstrap marker as applicable. Operator admin grant/revocation events use the same `role.granted`/`role.revoked` actions with `source='system'`, null actor, and operator-action ID plus approval evidence in the change summary. Initial bootstrap additionally emits `admin.initial_bootstrap`. Admin-role recovery after bootstrap uses a restricted operator transaction requiring the same two independently verified approvals; it inserts an operator-action row and role grant/revocation audit events atomically without altering the bootstrap marker or old records.

If the wrong initial admin was selected, preserve the bootstrap marker and all existing rows; use an approved two-person operator recovery to revoke the incorrect active grant with a reason and grant the correct Auth identity a new admin grant, recording both changes and approval evidence atomically. If all admins are lost, use the same restricted operator path to restore a verified admin identity, append-only; never make bootstrap repeatable or expose a client recovery function. This process depends on secure custody of the runner/database credentials and independent recovery of the approval system.

#### Profile updates and account lifecycle

RLS restricts rows but does not protect sensitive columns. Revoke direct client `UPDATE` on `user_profiles`, `farmer_profiles`, `buyer_profiles`, and `buyer_businesses`; expose narrowly scoped authenticated update functions that derive the target profile from `auth.uid()` and accept only explicit allowlisted fields. A user may update `user_profiles.display_name`, approved farmer contact/location fields, or buyer contact name. Phone changes must use a verified Auth change flow and trusted synchronization; a client may never set `phone_verified_at`, `auth_user_id`, `archived_at`, `user_roles`, membership ownership/role, or server-managed status/verification fields. Admin corrections also go through validated trusted functions with reason and audit. Apply explicit column-level `GRANT UPDATE` only if direct updates are chosen for a specific safe column; RLS alone is insufficient.

Normal account closure is archival/deactivation, not destructive deletion. A trusted workflow revokes active roles, deactivates the authentication identity, sets `user_profiles.archived_at`, and prevents new writes/sign-ins while preserving stable profile IDs referenced by orders, harvests, payments, allocations, memberships, and audit history. A user cannot edit `user_profiles.id`, `auth_user_id`, `farmer_profiles.user_id`, `buyer_profiles.user_id`, `buyer_businesses.created_by`, order/enquiry `submitted_by`, or membership ownership; trusted functions derive the actor from the authenticated identity and authorize each ownership relationship. Anonymize personal fields only where legally or operationally required, retaining the minimum pseudonymous identifiers and facts required for financial reconciliation, fraud prevention, disputes, and audit. Financial, harvest, order, inventory, status-history, and audit records must not be cascade-deleted when an account closes. The nullable `auth_user_id ... ON DELETE SET NULL` permits deletion of an authentication identity while retaining the application profile. Historical actor references may use `ON DELETE SET NULL` where approved, but `user_roles` grantor/revoker references and `audit_logs.actor_user_id` use `ON DELETE RESTRICT` so role and audit attribution cannot be nulled by deleting a profile. Ownership and financial references also use `ON DELETE RESTRICT`. Business-history request references may use `ON DELETE SET NULL`; immutable `audit_logs.request_id` uses `ON DELETE RESTRICT` so an idempotency-row cleanup cannot rewrite audit history. Every request/actor identity FK below states its deletion action explicitly.

Final retention periods, legal basis/holds, exact fields to anonymize, whether a stable pseudonymous ID may be retained, and the response to a deletion request require owner/legal/privacy approval. Purging an application tombstone or retained business facts is outside this default workflow and requires a separately approved, audited retention-expiry process after all restrictive references are eligible for removal.

#### `farmer_profiles`

| Column | Type / default | Constraints |
|---|---|---|
| `user_id` | `uuid` | PK; FK `user_profiles(id) ON DELETE RESTRICT` |
| `full_name` | `text` | NOT NULL; trimmed length 1–120 |
| `state` | `text` | NOT NULL; trimmed length 1–100 |
| `district` | `text` | NOT NULL; trimmed length 1–100 |
| `locality` | `text` | NOT NULL; trimmed length 1–160 |
| `pin_code` | `text` | NOT NULL; CHECK matches approved Indian PIN format, initially six digits |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `updated_at` | `timestamptz DEFAULT now()` | NOT NULL; trigger-maintained |
| `archived_at` | `timestamptz` | nullable |

Phone is sourced from the verified identity/profile rather than separately editable farmer data. A farmer cannot set verification fields or role. Exact profile fields and validation/privacy requirements require owner review.

### Buyer businesses, memberships, and enquiries

#### `buyer_businesses`

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `created_by` | `uuid` | NOT NULL FK `user_profiles(id) ON DELETE RESTRICT`; business ownership provenance |
| `business_name` | `text` | NOT NULL; trimmed length 1–160 |
| `buyer_type` | `text` | NOT NULL; CHECK in `('retailer','restaurant','hotel','wholesaler','other')` |
| `state` | `text` | NOT NULL; length 1–100 |
| `district` | `text` | NOT NULL; length 1–100 |
| `locality` | `text` | NOT NULL; length 1–160 |
| `pin_code` | `text` | NOT NULL; approved PIN validation |
| `business_status` | `text DEFAULT 'unreviewed'` | NOT NULL; CHECK in `('unreviewed','reviewed','follow_up','approved','rejected','archived')`; transitions are performed only by trusted admin functions |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `updated_at` | `timestamptz DEFAULT now()` | NOT NULL; trigger-maintained |
| `archived_at` | `timestamptz` | nullable |

Do not equate a submitted enquiry or authenticated buyer with an approved/verified business.

#### `buyer_business_members`

| Column | Type / default | Constraints |
|---|---|---|
| `business_id` | `uuid` | PK part; FK `buyer_businesses(id) ON DELETE RESTRICT` |
| `user_id` | `uuid` | PK part; FK `user_profiles(id) ON DELETE RESTRICT` |
| `membership_role` | `text DEFAULT 'member'` | NOT NULL; CHECK in `('owner','member')` |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `created_by` | `uuid` | nullable FK `user_profiles(id) ON DELETE SET NULL`; historical actor |
| `revoked_at` | `timestamptz` | nullable |

Composite PK `(business_id,user_id)` and partial unique index: at most one active `owner` per business. `membership_role` is business-scoped membership metadata, not an application role and grants no authority outside that business. Active membership lookup is required for buyer business access. Who may invite/add members, and whether multiple members are allowed in the pilot, require approval; users must not add themselves to an existing business.

#### `buyer_profiles`

| Column | Type / default | Constraints |
|---|---|---|
| `user_id` | `uuid` | PK; FK `user_profiles(id) ON DELETE RESTRICT` |
| `contact_name` | `text` | NOT NULL; trimmed length 1–120 |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `updated_at` | `timestamptz DEFAULT now()` | NOT NULL; trigger-maintained |
| `archived_at` | `timestamptz` | nullable |

Buyer contact address and buyer type belong to the business. Additional contact fields/preferences should be added only with an approved need.

#### `buyer_enquiries`

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `business_id` | `uuid` | NOT NULL FK `buyer_businesses(id) ON DELETE RESTRICT` |
| `submitted_by` | `uuid` | NOT NULL FK `user_profiles(id) ON DELETE RESTRICT` |
| `expected_quantity_kg` | `numeric(12,3)` | nullable; if present `> 0` |
| `message` | `text` | NOT NULL; trimmed length 1–500 |
| `status` | `text DEFAULT 'new'` | NOT NULL; CHECK in `('new','reviewed','follow_up')` |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `updated_at` | `timestamptz DEFAULT now()` | NOT NULL; trigger-maintained |
| `archived_at` | `timestamptz` | nullable; only under approved retention rules |

`submitted_by` must be an active member of `business_id`; enforce through trusted transaction (or trigger plus RLS), not a row-local CHECK. Optional quantity range from the demo needs product decision: preserve a structured range code or normalize to numeric quantity/unit before implementation.

#### `enquiry_status_history`

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `enquiry_id` | `uuid` | NOT NULL FK `buyer_enquiries(id) ON DELETE RESTRICT` |
| `previous_status` | `text` | nullable only for initial creation; otherwise approved status values |
| `new_status` | `text` | NOT NULL; CHECK in `('new','reviewed','follow_up')` |
| `actor_user_id` | `uuid` | nullable only for system creation; otherwise FK `user_profiles(id) ON DELETE SET NULL` |
| `reason` | `text` | nullable; bounded length |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `request_id` | `uuid` | nullable FK `request_idempotency(id) ON DELETE SET NULL`; retained history survives idempotency-record expiry |

Insert history atomically with the enquiry/status change; application clients cannot update/delete history.

### Products, offers, and inventory

#### `products`

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `sku` | `text` | NOT NULL UNIQUE; stable, case-normalized |
| `kind` | `text` | NOT NULL; CHECK in `('bag','mushroom')` |
| `name_key` | `text` | NOT NULL; stable localization key |
| `description_key` | `text` | nullable |
| `unit_code` | `text` | NOT NULL; approved stable unit such as `bag` or `kg`; no translated text |
| `active` | `boolean DEFAULT true` | NOT NULL |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `updated_at` | `timestamptz DEFAULT now()` | NOT NULL; trigger-maintained |
| `archived_at` | `timestamptz` | nullable; do not delete products referenced by history |

Allowed units and catalogue definitions require approval; no sample demo prices/stock are seeded as production facts.

#### `catalogue_offers`

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `product_id` | `uuid` | NOT NULL FK `products(id) ON DELETE RESTRICT` |
| `audience` | `text` | NOT NULL; proposed CHECK `('farmer','buyer')` |
| `unit_price` | `numeric(14,2)` | NOT NULL; CHECK `>= 0` |
| `currency` | `char(3) DEFAULT 'INR'` | NOT NULL; CHECK `= 'INR'` |
| `effective_from` | `timestamptz` | NOT NULL |
| `effective_until` | `timestamptz` | nullable; if set, `> effective_from` |
| `published` | `boolean DEFAULT false` | NOT NULL |
| `created_by` | `uuid` | nullable FK `user_profiles(id) ON DELETE SET NULL` |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |

Offers and prices are admin-controlled and effective-dated. Prevent overlapping active offers for the same product/audience using an exclusion constraint or equivalent trusted transaction. Historical order lines snapshot the exact unit price/currency selected at order acceptance and never reprice when an offer changes.

#### `inventory_locations`

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `code` | `text` | NOT NULL UNIQUE |
| `name` | `text` | NOT NULL; trimmed length 1–120 |
| `active` | `boolean DEFAULT true` | NOT NULL |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `archived_at` | `timestamptz` | nullable |

Do not collect exact location/address unless approved.

#### `inventory_balances` (transactional projection)

This row is a lockable, transactionally maintained projection; `inventory_movements` remains the audit ledger. `on_hand` is physical stock, including units currently reserved; `reserved` is the portion of physical stock committed to accepted buyer orders and not yet cancelled or fulfilled. Available physical stock is `on_hand - reserved`. Every movement records separate signed deltas for physical stock and reservations. All quantities use the product's unit.

| Column | Type / default | Constraints |
|---|---|---|
| `location_id` | `uuid` | PK part; FK `inventory_locations(id) ON DELETE RESTRICT` |
| `product_id` | `uuid` | PK part; FK `products(id) ON DELETE RESTRICT` |
| `unit_code` | `text` | NOT NULL |
| `on_hand` | `numeric(12,3) DEFAULT 0` | NOT NULL; CHECK `>= 0`; physical stock on hand, including reserved stock |
| `reserved` | `numeric(12,3) DEFAULT 0` | NOT NULL; CHECK `>= 0 AND reserved <= on_hand`; quantity reserved for accepted, unfulfilled buyer orders |
| `updated_at` | `timestamptz DEFAULT now()` | NOT NULL |

Composite PK `(location_id,product_id)`. The available quantity is `on_hand - reserved`. Only trusted transaction functions may mutate this projection.

#### `inventory_movements`

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `location_id` | `uuid` | NOT NULL FK `inventory_locations(id) ON DELETE RESTRICT` |
| `product_id` | `uuid` | NOT NULL FK `products(id) ON DELETE RESTRICT` |
| `movement_type` | `text` | NOT NULL; CHECK in `('receipt','reserve','release','commit','spoilage','adjustment','reversal')` |
| `on_hand_delta` | `numeric(12,3)` | NOT NULL; signed change to physical stock on hand |
| `reserved_delta` | `numeric(12,3)` | NOT NULL; signed change to the quantity reserved for accepted buyer orders |
| `unit_code` | `text` | NOT NULL; must match product's unit, enforced by trusted operation |
| `bag_order_line_id` | `uuid` | nullable FK `bag_order_lines(id) ON DELETE RESTRICT` |
| `buyer_order_line_id` | `uuid` | nullable FK `buyer_order_lines(id) ON DELETE RESTRICT` |
| `reversal_of` | `uuid` | nullable FK `inventory_movements(id) ON DELETE RESTRICT`; set only for a compensating movement |
| `reason` | `text` | nullable for routine commit; required and non-empty for `receipt`, admin `adjustment`, `spoilage`, and `reversal` |
| `actor_user_id` | `uuid` | nullable only for controlled system event; otherwise FK `user_profiles(id) ON DELETE SET NULL` |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `idempotency_key` | `uuid` | NOT NULL; UNIQUE per trusted operation scope |

Use a CHECK to disallow both order-line references at once; either may be null for non-order movement. A row must have at least one nonzero delta. Enforce the movement-specific delta shape and reversal linkage in the trusted operation. The source order must belong to the same product/location and change in the same transaction. Movement rows are append-only; correcting an erroneous movement uses a compensating `reversal` row, never UPDATE/DELETE.

Movement accounting convention (positive `q` is a validated quantity):

| Movement | `on_hand_delta` | `reserved_delta` | Meaning and conditions |
|---|---:|---:|---|
| `receipt` | `+q` | `0` | Adds physical stock; admin-only trusted operation records source and audit. |
| `reserve` | `0` | `+q` | Reserves available physical stock for an accepted buyer-order line; available stock (`on_hand - reserved`) must cover `q`. |
| `release` | `0` | `-q` | Cancellation releases an unfulfilled buyer-order reservation; cannot release more than that line's outstanding reservation. |
| `commit` | `-q` | `-q` | Fulfillment consumes physical stock and its reservation; cannot exceed that line's outstanding reservation. |
| `spoilage` | `-q` | `0` | Admin-only loss removes unreserved physical stock. Any affected reservation must first be released/cancelled in the same approved transaction. |
| `adjustment` | signed nonzero delta | `0` | Admin-only audited physical count correction with required reason; resulting on-hand must remain at least reserved. |
| `reversal` | inverse of original portion | inverse of original portion | Admin-only audited compensation for an erroneous still-reversible movement; references its source movement and may not reverse a quantity already consumed, released, or reversed. |

Buyer-order lifecycle: a buyer submits an enquiry (initial status `new`) or an order (initial status `placed`). An admin reviews and accepts an order; acceptance and reservation of the accepted quantities happen atomically. Cancellation releases the remaining reservation exactly once. Fulfillment commits the remaining reservation exactly once and reduces physical on-hand stock. Orders may not reserve more than available physical stock. Do not represent fulfillment as a separate stock receipt or as proof of physical delivery. Farmer bag orders retain their own status workflow and do not use the buyer-order `reserved` quantity in this specification; any bag-order stock reservation requires a separately defined design and must not change the meaning of `reserved_delta`.

Inventory receipt, adjustment, spoilage, and compensating reversal are admin-only trusted operations and write audit history atomically with the movement/projection update. Reversal of a receipt/adjustment/spoilage is permitted only when the resulting balance remains valid; reversal of order movements must also preserve order state and reservation lifecycle.

**Ledger/projection invariants:** for every `(location_id, product_id)`, `inventory_balances.on_hand = SUM(inventory_movements.on_hand_delta)` and `inventory_balances.reserved = SUM(inventory_movements.reserved_delta)` from the ledger's opening state of zero. `on_hand` represents physical stock, including reserved units; `reserved` represents the subset allocated to accepted buyer orders. `0 <= reserved <= on_hand`, and available physical stock is `on_hand - reserved`. Every balance change and corresponding movement insert commit in the same transaction. Reconciliation compares both sums to the projection and reports any mismatch; it does not silently overwrite or repair either source. Corrections require an audited trusted operation.

### Farmer bag orders and buyer orders

#### `bag_orders`

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `farmer_user_id` | `uuid` | NOT NULL FK `farmer_profiles(user_id) ON DELETE RESTRICT` |
| `fulfillment` | `text` | NOT NULL; CHECK in `('pickup','delivery')` |
| `delivery_address` | `text` | nullable; required for delivery, null for pickup (cross-field CHECK) |
| `status` | `text DEFAULT 'placed'` | NOT NULL; CHECK in `('placed','accepted','cancelled')`; trusted admin functions enforce bag-order transitions; this status does not reserve the buyer-order inventory projection |
| `currency` | `char(3) DEFAULT 'INR'` | NOT NULL; CHECK `= 'INR'` |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `updated_at` | `timestamptz DEFAULT now()` | NOT NULL; trigger-maintained |

Totals are derived from order lines; do not store an independently editable total. Only trusted create/transition operations write status and fulfillment snapshots.

#### `bag_order_lines`

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `bag_order_id` | `uuid` | NOT NULL FK `bag_orders(id) ON DELETE RESTRICT` |
| `product_id` | `uuid` | NOT NULL FK `products(id) ON DELETE RESTRICT` |
| `quantity` | `numeric(12,3)` | NOT NULL; CHECK `> 0`; if bag counts must be integral, enforce `quantity = trunc(quantity)` |
| `unit_code` | `text` | NOT NULL |
| `unit_price` | `numeric(14,2)` | NOT NULL; CHECK `>= 0` |
| `currency` | `char(3) DEFAULT 'INR'` | NOT NULL; CHECK `= 'INR'` |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |

No line edits after order confirmation; use an explicit cancellation/replacement workflow. Snapshot price from active offer in trusted transaction.

#### `bag_order_status_history`

`id uuid PK DEFAULT gen_random_uuid()`, `bag_order_id uuid NOT NULL FK bag_orders(id) ON DELETE RESTRICT`, `previous_status text NULL` (initial event only), `new_status text NOT NULL` CHECK against approved bag-order statuses, `actor_user_id uuid NULL FK user_profiles(id) ON DELETE SET NULL`, `reason text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `request_id uuid NULL FK request_idempotency(id) ON DELETE SET NULL`. Append-only; write atomically with order transition.

#### `buyer_orders`

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `reference` | `text` | NOT NULL UNIQUE; generated server-side |
| `business_id` | `uuid` | NOT NULL FK `buyer_businesses(id) ON DELETE RESTRICT` |
| `submitted_by` | `uuid` | NOT NULL FK `user_profiles(id) ON DELETE RESTRICT`; must be active business member |
| `fulfillment` | `text` | NOT NULL; CHECK `('pickup','delivery')` |
| `delivery_address` | `text` | nullable; required for delivery, null for pickup |
| `status` | `text DEFAULT 'placed'` | NOT NULL; CHECK in `('placed','accepted','cancelled','fulfilled')`; trusted admin transition functions enforce the buyer-order lifecycle |
| `currency` | `char(3) DEFAULT 'INR'` | NOT NULL; CHECK `= 'INR'` |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `updated_at` | `timestamptz DEFAULT now()` | NOT NULL; trigger-maintained |

Subtotal derives from lines; never trust a client subtotal. Buyer may submit and request cancellation through scoped functions but cannot accept, cancel finally, or fulfill an order or set an admin-only status. An admin accepts the order and reserves its accepted quantities atomically; cancellation releases its reservation; fulfillment commits it.

#### `buyer_order_lines`

Same financial snapshot model as bag lines: `id uuid PK DEFAULT gen_random_uuid()`, `buyer_order_id uuid NOT NULL FK buyer_orders(id) ON DELETE RESTRICT`, `product_id uuid NOT NULL FK products(id) ON DELETE RESTRICT`, `quantity numeric(12,3) NOT NULL CHECK (> 0)`, `unit_code text NOT NULL`, `unit_price numeric(14,2) NOT NULL CHECK (>= 0)`, `currency char(3) NOT NULL DEFAULT 'INR' CHECK (= 'INR')`, `created_at timestamptz NOT NULL DEFAULT now()`. Price/product/unit are server-selected and immutable after confirmation.

#### `buyer_order_status_history`

`id uuid PK DEFAULT gen_random_uuid()`, `buyer_order_id uuid NOT NULL FK buyer_orders(id) ON DELETE RESTRICT`, `previous_status text NULL` (initial event only), `new_status text NOT NULL CHECK IN ('placed','accepted','cancelled','fulfilled')`, `actor_user_id uuid NULL FK user_profiles(id) ON DELETE SET NULL`, `reason text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `request_id uuid NULL FK request_idempotency(id) ON DELETE SET NULL`. Append-only and atomically updated with order.

### Training

#### `training_sessions`

`id uuid PK DEFAULT gen_random_uuid()`, `session_code text NOT NULL UNIQUE`, `title_key text NOT NULL`, `starts_at timestamptz NOT NULL`, `ends_at timestamptz NULL CHECK (ends_at IS NULL OR ends_at > starts_at)`, `location_label text NOT NULL`, `capacity integer NOT NULL CHECK (capacity > 0)`, `status text NOT NULL DEFAULT 'draft' CHECK IN ('draft','published','cancelled','completed')`, `created_by uuid NULL FK user_profiles(id) ON DELETE SET NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `archived_at timestamptz NULL`. Training schedule, publication, capacity, and status changes are admin-controlled through trusted audited functions; a session cannot be published without a configured positive capacity. Actual schedule and capacity values are configured by the admin.

#### `training_registrations`

`id uuid PK DEFAULT gen_random_uuid()`, `session_id uuid NOT NULL FK training_sessions(id) ON DELETE RESTRICT`, `farmer_user_id uuid NOT NULL FK farmer_profiles(user_id) ON DELETE RESTRICT`, `status text NOT NULL DEFAULT 'registered' CHECK IN ('registered','cancelled','attended','no_show')`, `registered_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `UNIQUE(session_id,farmer_user_id)`. A trusted registration command checks the published state and counts every non-cancelled registration against configured capacity while holding a lock on the session; concurrent requests serialize so registrations cannot exceed capacity. An admin cannot reduce capacity below existing non-cancelled registrations. Farmer registration is subject to configured capacity; attendance status is admin-managed.

### Harvest submissions and decision history

#### `harvest_submissions`

| Column | Type / default | Constraints |
|---|---|---|
| `id` | `uuid DEFAULT gen_random_uuid()` | PK |
| `farmer_user_id` | `uuid` | NOT NULL FK `farmer_profiles(user_id) ON DELETE RESTRICT` |
| `submitted_weight_kg` | `numeric(12,3)` | NOT NULL; CHECK `> 0` |
| `status` | `text DEFAULT 'submitted'` | NOT NULL; CHECK `('submitted','accepted','rejected')` |
| `submitted_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `accepted_weight_kg` | `numeric(12,3)` | nullable; when accepted `> 0` |
| `grade` | `text` | nullable; when accepted CHECK in `('A','B','C')` |
| `rate_per_kg` | `numeric(14,2)` | nullable; when accepted `>= 0` |
| `accepted_at` | `timestamptz` | nullable |
| `rejection_reason` | `text` | nullable; when rejected trimmed length 1–1000 |
| `rejected_at` | `timestamptz` | nullable |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL |
| `updated_at` | `timestamptz DEFAULT now()` | NOT NULL; trigger-maintained |

CHECK state consistency: submitted has no decision fields; accepted requires accepted weight, grade, rate and `accepted_at`, with rejection fields null; rejected requires non-empty reason and `rejected_at`, with accepted fields null. Add only row-local consistency checks here. Conditional transition from `submitted` and audit insert require a trusted transaction. Harvest decisions are admin-only. The saved `rate_per_kg` is the exact effective-dated grade rate selected at acceptance; never change submitted weight or saved rate when later values change.

#### `harvest_grade_rates`

`id uuid PK DEFAULT gen_random_uuid()`, `grade text NOT NULL CHECK IN ('A','B','C')`, `rate_per_kg numeric(14,2) NOT NULL CHECK (rate_per_kg >= 0)`, `currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR')`, `effective_from timestamptz NOT NULL`, `effective_until timestamptz NULL CHECK (effective_until IS NULL OR effective_until > effective_from)`, `created_by uuid NULL FK user_profiles(id) ON DELETE SET NULL` (historical admin actor), `created_at timestamptz NOT NULL DEFAULT now()`. Rates are admin-controlled, effective-dated, and immutable once effective; a trusted admin function prevents overlapping effective periods for a grade and audits changes. Acceptance snapshots the exact applicable rate and grade on the harvest and in decision history. Changing a current rate never rewrites accepted harvests or their financial history.

#### `harvest_decision_history`

`id uuid PK DEFAULT gen_random_uuid()`, `harvest_id uuid NOT NULL FK harvest_submissions(id) ON DELETE RESTRICT`, `action text NOT NULL CHECK IN ('submitted','accepted','rejected','correction')`, `previous_status text NULL`, `new_status text NOT NULL CHECK IN ('submitted','accepted','rejected')`, `actor_user_id uuid NULL FK user_profiles(id) ON DELETE SET NULL`, `submitted_weight_kg numeric(12,3) NULL`, `accepted_weight_kg numeric(12,3) NULL`, `grade text NULL CHECK (grade IS NULL OR grade IN ('A','B','C'))`, `rate_per_kg numeric(14,2) NULL CHECK (rate_per_kg IS NULL OR rate_per_kg >= 0)`, `rejection_reason text NULL`, `reason text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `request_id uuid NULL FK request_idempotency(id) ON DELETE SET NULL`. Append-only. Corrections/re-review are admin-only trusted operations and require an explicit reason and audit.

### Farmer payments and allocations

No gateway, buyer payment, credit, invoice, or verified transfer is implied by these tables. Payment records represent **manually recorded farmer payment information** unless a separately approved provider integration defines verified settlement. Admins alone may create payments, allocate them, or reverse them. Partial allocations and unallocated remainders are supported. Payment and reversal operations require an idempotency key, and each reversal requires a reason and immutable audit record.

#### `farmer_payments`

`id uuid PK DEFAULT gen_random_uuid()`, `farmer_user_id uuid NOT NULL FK farmer_profiles(user_id) ON DELETE RESTRICT`, `record_type text NOT NULL CHECK IN ('receipt','reversal')`, `reference text NULL UNIQUE` (payment reference, server-generated if used), `evidence_metadata jsonb NULL` (permitted evidence metadata only; never store credentials or full payment secrets), `amount numeric(14,2) NOT NULL CHECK (> 0)` (positive magnitude for both record types), `currency char(3) NOT NULL DEFAULT 'INR' CHECK (= 'INR')`, `recorded_at timestamptz NOT NULL DEFAULT now()`, `payment_date date NULL`, `method text NULL` (configured method vocabulary), `recorded_by uuid NULL FK user_profiles(id) ON DELETE SET NULL` (historical actor), `reversal_of uuid NULL FK farmer_payments(id) ON DELETE RESTRICT`, `reversal_reason text NULL`, `request_id uuid NULL FK request_idempotency(id) ON DELETE SET NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

Row-shape rule: a `receipt` has no `reversal_of` and no `reversal_reason`; a `reversal` references a receipt for the same farmer/currency and requires a non-empty reason. A reversal row cannot itself be reversed; correct it only with a separately audited compensating operation. Do **not** make `reversal_of` unique: multiple partial reversals may reference one receipt. Enforce cumulative reversal amount not above the remaining reversible receipt amount in the locked reversal transaction. A receipt's effective unreversed amount is `receipt.amount - SUM(valid reversal.amount)`.

#### `farmer_payment_allocations`

`id uuid PK DEFAULT gen_random_uuid()`, `payment_id uuid NOT NULL FK farmer_payments(id) ON DELETE RESTRICT`, `harvest_id uuid NOT NULL FK harvest_submissions(id) ON DELETE RESTRICT`, `amount numeric(14,2) NOT NULL CHECK (> 0)` (positive magnitude), `created_at timestamptz NOT NULL DEFAULT now()`, `created_by uuid NULL FK user_profiles(id) ON DELETE SET NULL` (historical actor), `reversal_of uuid NULL FK farmer_payment_allocations(id) ON DELETE RESTRICT`.

For an original allocation, `payment_id` must identify a `receipt` and `reversal_of` is null. For an allocation reversal, `payment_id` must identify a `reversal`, `reversal_of` must identify an original allocation, and both must refer to the same harvest and original receipt. These cross-row conditions are validated by the trusted transaction. Multiple partial allocation reversals may reference one original allocation; cumulative reversal allocations cannot exceed that allocation's amount.

**Accounting:** allocations may be partial, and a receipt may have an unallocated remainder. An unallocated remainder is not applied to any harvest and does not reduce any harvest's outstanding value. For each accepted harvest, `outstanding = max(0, accepted_weight_kg * saved_rate - (SUM(valid original allocations) - SUM(valid allocation reversals)))`. Allocation sums are capped at both the receipt's remaining reversible amount and the harvest's remaining outstanding amount. The net allocated amount for a payment is calculated from original allocation amounts less their reversals; unallocated funds do not become a credit or buyer balance. Thus outstanding is accepted harvest value minus net valid allocations/payments actually allocated to that harvest, never an independently edited balance.

A full/partial receipt reversal is a new `farmer_payments` row of type `reversal` referencing the original receipt. In the same transaction, any portion of the reversal that was previously allocated must have matching allocation-reversal rows referencing those original allocations; the residual reversal amount can only come from the original receipt's then-unallocated remainder. Validate cumulative reversals against the receipt's remaining amount, cumulative allocation reversals against each original allocation's remaining amount, and that each reversal's amount equals its allocation reversals plus the amount reversed from the receipt's then-unallocated portion. Lock the receipt, affected allocations, and harvest rows before checking/updating. A reversal can never exceed the remaining reversible amount. Every reversal requires a non-empty reason and an immutable audit record in the same transaction.

Every payment creation, allocation, and reversal request must carry an idempotency key scoped to actor and operation; clients must reuse the same key on retry. The unique idempotency record and request-hash comparison ensure an identical retry returns the existing result, while reuse of a key with a different payload fails. The same business operation submitted with a different key is a new operation, not a duplicate: it must pass the normal state, remaining-balance, and amount validations and may succeed only if those validations permit it. Do not silently deduplicate based only on matching business fields. The request-idempotency retention period must be long enough to protect legitimate retries; its exact duration is a deployment/retention decision, and the schema must support enforcing it through recorded creation/expiry times and a controlled cleanup policy. Payment and allocation rows are append-only. Every receipt, allocation, reversal, and allocation reversal writes immutable audit events in the same transaction; audit entries are never edited/deleted. Store payment date, method, reference, and applicable evidence metadata according to the configured operating policy. Currency is INR. There is no buyer receivable/payment table in this specification.

### Settings, audit, and idempotency

#### `admin_settings`

`key text PK CHECK (length(trim(key)) BETWEEN 1 AND 100)`, `value jsonb NOT NULL`, `version bigint NOT NULL DEFAULT 1 CHECK (version > 0)`, `effective_at timestamptz NOT NULL DEFAULT now()`, `updated_by uuid NULL FK user_profiles(id) ON DELETE SET NULL` (historical actor), `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`. Validate setting-specific JSON shape/ranges in a trusted admin function (and add typed columns or constraints when settings are fixed). Updates are prospective; historical order and harvest snapshots remain unchanged. No production values/default rates are specified.

#### `audit_logs`

`id uuid PK DEFAULT gen_random_uuid()`, `actor_user_id uuid NULL FK user_profiles(id) ON DELETE RESTRICT`, `action text NOT NULL`, `entity_type text NOT NULL`, `entity_id uuid NULL`, `occurred_at timestamptz NOT NULL DEFAULT now()`, `request_id uuid NULL FK request_idempotency(id) ON DELETE RESTRICT`, `reason text NULL`, `change_summary jsonb NOT NULL DEFAULT '{}'::jsonb`, `source text NOT NULL CHECK IN ('user','admin','system')`. Do not include secrets, tokens, OTPs, full payment credentials, or excessive personal data in JSON. Enable RLS and grant no direct client INSERT/UPDATE/DELETE; audit-log reads are admin-only through a restricted trusted function. A trigger rejects UPDATE/DELETE so audit events are append-only for application and operator paths. `ON DELETE RESTRICT` prevents deleting an actor profile or correlated idempotency row from nulling audit attribution/correlation. Audit retention and anonymization require approval.

#### `request_idempotency`

Internal table not exposed to ordinary browser clients: `id uuid PK DEFAULT gen_random_uuid()`, `actor_user_id uuid NOT NULL FK user_profiles(id) ON DELETE RESTRICT` (retain actor scope while this idempotency record is retained), `operation text NOT NULL`, `idempotency_key uuid NOT NULL`, `request_hash text NOT NULL`, `result_entity_type text NULL`, `result_entity_id uuid NULL`, `result jsonb NULL` (only minimal non-sensitive replay response), `created_at timestamptz NOT NULL DEFAULT now()`, `expires_at timestamptz NULL`. `UNIQUE(actor_user_id,operation,idempotency_key)`. A trusted function sets `expires_at` no earlier than `created_at` plus the configured minimum retention interval; its exact duration and cleanup schedule are deployment/retention decisions. The schema supports enforcement through `created_at`/`expires_at`; trusted cleanup must not remove a record before that interval expires. Business/history correlation FKs to this table use `ON DELETE SET NULL`; immutable `audit_logs.request_id` uses `ON DELETE RESTRICT` to protect audit history. On duplicate key, compare request hash and return the prior committed result; reject a key reused with a different payload. A different key is a new operation that must pass ordinary validation.

## 3. Relationships and integrity summary

- `auth.users` maps 0:1 to `user_profiles.auth_user_id`; a stable `user_profiles` row may remain after its authentication identity is deleted. Roles are separate, trusted grant-history rows. Farmer profile is 1:1 with an application profile. Buyer identity has a contact profile and one or more business membership rows, subject to approved membership rules.
- Each buyer enquiry/order belongs to one business and one submitting member. Each farmer order, training registration, harvest, and payment belongs to one farmer identity. Child rows/history use restrictive foreign keys so records cannot disappear through cascading delete.
- Products have offers and inventory by location. Order lines snapshot product/unit/price/currency. Inventory movements reference product/location and optional order line. No order can change a historical price snapshot.
- Harvest decision data remains on the submission for current state; decision history is append-only. Accepted value is derived as `accepted_weight_kg * rate_per_kg`; outstanding is accepted value minus net allocations (original allocations less allocation reversals). Do not store an independently editable balance.
- A database CHECK enforces accepted/rejected field shape and non-negative row values; only trusted transactions enforce actor authorization, transition state, farmer/business ownership, stock and allocation sums, idempotency, and coupled history/audit writes. Harvest decisions, payments/allocations/reversals, inventory administration, training schedule/capacity changes, and audit-log reads are admin-only.
- Inventory movements are the ledger: their `on_hand_delta` and `reserved_delta` sums must equal the corresponding balance projection values. Update the projection in the same transaction while locking the `(location_id,product_id)` balance row. Reject a movement that would cause `on_hand < 0`, `reserved < 0`, `reserved > on_hand`, or available stock below zero. Adjustments require actor and reason.
- Use `SELECT ... FOR UPDATE` or equivalent serializable/atomic update logic for order/stock, harvest, payment, and registration capacity operations. Handle serialization/deadlock retries with bounded retry policy and idempotency keys. Do not rely on browser validation or read-then-write checks.

## 4. Authentication, role assignment, and trusted execution

- The selected authentication provider is the identity provider. A verified provider JWT identifies the authenticated subject; resolve it to exactly one active `user_profiles.auth_user_id`. The stable `user_profiles.id` is the application principal referenced by business tables. OTP verification status must come from provider claims or a trusted verification event, never a client boolean.
- Use provider-backed OTP or an owner-approved alternative. Normalize phone to E.164; rate-limit sends and verification attempts; use expiry, replay protection, CAPTCHA/abuse controls as appropriate, delivery monitoring, cost alerts, and approved recovery. No fixed demo code is accepted in production.
- Initial admin users are provisioned only by the one-time restricted operator procedure in section 2. Normal admins may grant/revoke farmer/buyer roles for other users, but may not change admin roles or any of their own role grants. Admin-role creation, revocation, and recovery require the restricted two-operator process. Require MFA for admins, short-lived/revocable sessions, and controlled recovery. Never accept `role=admin` or profile verification claims from browser payload.
- Role lifecycle is enforced by row CHECK constraints, the partial unique active-role index, restrictive client grants/RLS, and trusted transactional commands. The permanent `private.admin_bootstrap_state` marker and unique `private.admin_operator_actions` references prevent rerunning initial bootstrap; two distinct signed operator approvals are checked by the restricted runner and recorded in the operator-action row and audit, not inferred from client metadata. Exact Supabase Auth identity-verification, MFA assurance, and migration/operator database privileges remain provider-verification items; no deployed privilege or feature is asserted here.
- Business owner/member grants use trusted invitation/approval command; cannot self-join a business by supplying its UUID. Owner/member capability details require approval.
- Revoke direct DML on privileged tables. Security-definer functions must use a fixed safe `search_path`, fully qualify objects, validate `auth.uid()` and role/ownership inside the function, expose only narrowly granted execute permissions, avoid dynamic SQL, and emit audit rows in the same transaction. If an Edge Function/API is used, it must validate the Supabase JWT and role; service-role credentials stay server-side only and never enter `VITE_*` frontend configuration.

## 5. Row Level Security policy matrix

**Default:** RLS enabled on every client-reachable table; no policy means deny. The matrix describes intended row access, not that any policy is already installed. `—` means no permission. “Function only” means revoke direct table DML and use an authenticated, narrowly granted transaction function. `SELECT` of private data is limited to required fields; grant column privileges or expose safe views where RLS alone cannot hide columns. Admin is an authenticated user with an active trusted `admin` role, not a route/session marker.

The only application roles are `farmer`, `buyer`, and `admin`. Do not introduce additional application roles. Admin is the sole role authorized for harvest acceptance/rejection, payment creation/allocation/reversal, inventory administrative operations, training schedule/capacity administration, catalogue/settings changes, enquiry/order administration, and audit-log access. Buyer and farmer roles cannot perform those operations. All sensitive server/database operations execute through trusted server-side/database functions; clients cannot bypass authorization through direct table writes. No client-controlled role, ownership, or status value grants authority.

| Table/group | Anonymous SELECT / I / U / D | Farmer SELECT / I / U / D | Buyer SELECT / I / U / D | Admin SELECT / I / U / D |
|---|---|---|---|---|
| `user_profiles` | — / — / — / — | Own safe fields via view / — / allowlisted update function only / — | Own safe fields via view / — / allowlisted update function only / — | Need-to-know safe view / — / audited correction function only / — |
| `user_roles` | — / — / — / — | Own active role indicator only via safe view; no table read / — / — / — | Same / — / — / — | Role list via restricted admin function / function only / function only / —; no direct table DML |
| `farmer_profiles` | — / — / — / — | Own / function only / allowlisted update function only / — | — / — / — / — | Need-to-know / function only / function only / — |
| `buyer_profiles` | — / — / — / — | — / — / — / — | Own user row / function only / allowlisted update function only / — | Need-to-know / function only / function only / — |
| `buyer_businesses`, `buyer_business_members` | — / — / — / — | — / — / — / — | Active member business rows / function only for approved create/join/invite flow / permitted business fields only / — | Need-to-know / function only / function only / — |
| `buyer_enquiries` | — / — / — / — | — / — / — / — | Active business members read their business; insert only as self and active member / function only / —; status update only function / — | Read all needed / —; transitions via function / function only / — |
| `enquiry_status_history` | — / — / — / — | — / — / — / — | Same business read / — / — / — | Authorized admin read / function only / — / — |
| `products`, published `catalogue_offers` | Published catalog only / — / — / — | Published offers / — / — / — | Published offers / — / — / — | All non-archived / function only / function only / — |
| `inventory_locations`, `inventory_balances` | — / — / — / — | Only explicitly approved farmer availability view / — / — / — | Published availability only / — / — / — | Admin read / function only / function only / — |
| `inventory_movements` | — / — / — / — | — / — / — / — | — / — / — / — | Admin read / function only / — / — |
| `bag_orders`, `bag_order_lines` | — / — / — / — | Own order/lines / create via function / no direct update; allowed cancellation via function only / — | — / — / — / — | Need-to-know read / function only / function only / — |
| Bag status history | — / — / — / — | Own order history / — / — / — | — / — / — / — | Read / function only / — / — |
| `training_sessions` | Published sessions only / — / — / — | Published sessions / — / — / — | Published sessions / — / — / — | All / function only / function only / — |
| `training_registrations` | — / — / — / — | Own / registration function only / cancellation/status function only / — | — / — / — / — | Need-to-know read / function only / function only / — |
| `harvest_submissions` | — / — / — / — | Own / submit function only / no decision-field write; correction request only by function / — | — / — / — / — | Read operational records / —; accept/reject function only / function only / — |
| `harvest_decision_history` | — / — / — / — | Own history read / — / — / — | — / — / — / — | Restricted read / function only / — / — |
| `farmer_payments`, `farmer_payment_allocations` | — / — / — / — | Own history read, minimum fields / — / — / — | — / — / — / — | Admin read, minimum necessary / admin-only trusted function / admin-only trusted function / — |
| `buyer_orders`, `buyer_order_lines` | — / — / — / — | — / — / — / — | Active business member read / create function only / cancellation request function only / — | Need-to-know read / function only / function only / — |
| Buyer order status history | — / — / — / — | — / — / — / — | Own business history / — / — / — | Read / function only / — / — |
| `admin_settings` | — / — / — / — | — / — / — / — | — / — / — / — | Authorized admin read / function only / function only / — |
| `audit_logs` | — / — / — / — | — / — / — / — | — / — / — / — | Admin read via restricted function / insert only from trusted functions / — / — |
| `request_idempotency` | — / — / — / — | No direct access / — / — / — | No direct access / — / — / — | No direct table access / trusted functions only / — / — |

**Policy requirements:** resolve the authenticated subject to the active profile, then check active role and membership in every policy/function. Do not rely on caller-supplied `user_id`, `business_id`, role, or status alone. Avoid recursive role-table RLS by using a tightly scoped helper function or claims populated only by trusted role provisioning; test revocation semantics. Admin UI access does not grant database permissions. Never allow anonymous access to private records. Private payment details and audit logs must not be exposed through broad admin list endpoints. Admin is the sole application role for privileged operations. No application role has DELETE on financial, inventory, status-history, harvest-history, or audit data. RLS is a defense layer and never the sole authorization or integrity mechanism.

## 6. Trusted transactional operations

Every mutating operation validates caller JWT, active role, row ownership/business membership, input constraints, expected current state, and an idempotency key. Start a single PostgreSQL transaction, write primary rows plus history/ledger/audit and idempotency result, then commit. Any error rolls back the whole operation. Return only the minimum necessary data. Client retries with the same actor/operation/key and identical request hash return the original result; same key with a different hash is rejected. Unique constraints serialize simultaneous use of the same key.

### Harvest acceptance/rejection

1. Verify the caller has an active `admin` role. Harvest acceptance and rejection are admin-only.
2. Claim idempotency key; lock the harvest row `FOR UPDATE`.
3. Require current status `submitted`; reject stale/repeated decisions.
4. Acceptance validates finite positive accepted kg, A/B/C grade, selects and locks the effective-dated rate for that grade at acceptance time, and validates maximum precision/value bounds and consistent rejection fields. Ignore client-supplied rates. Rejection requires bounded non-empty reason and clears accepted fields.
5. Conditional status update, immutable decision history row, general audit row, and idempotency result commit atomically. Two competing accept/reject requests cannot both transition; one succeeds and the other returns a conflict without second audit/value.
6. Value derives from accepted kg × saved rate using defined rounding/scale; no separately mutable accepted-value field. Keep submitted kg immutable.

### Inventory and bag/buyer orders

1. Use trusted order commands: farmers may create their own bag orders and buyers may submit orders for a business in which they are an active member. Validate role/ownership, active offer, fulfillment fields, positive quantity and authoritative effective-dated price; ignore/reject client totals. Snapshot the effective-dated price at order submission and preserve it at acceptance. Do not permit direct writes to order lines, inventory movements, or balances.
2. On buyer order submission, set `placed` and do not reserve stock. Admin review/acceptance changes it to `accepted` and reserves the accepted line quantities atomically; the accepted quantity is the submitted line quantity in this design. Lock the order first and affected `inventory_balances` rows in deterministic `(location_id,product_id)` order. Compute available physical stock as `on_hand - reserved` from the locked projection; reject acceptance if any line would cause oversell. Update the order, projection, movements, status history, audit, and idempotency result in the same transaction.
3. Acceptance records `(0,+q)`; cancellation records `(0,-q)` only for the remaining reservation; fulfillment records `(-q,-q)` only for the remaining reservation. Each transition checks current order state and per-line outstanding reservation under lock. Admin alone accepts, finally cancels, or fulfills an order. A buyer cancellation request does not itself change final status or stock; the admin-authorized cancellation function performs the status change and release atomically. A buyer order may transition from `placed` to `accepted` or `cancelled`, then from `accepted` to `cancelled` or `fulfilled`; stale/repeated transitions conflict.
4. Admin alone may receive stock, adjust physical counts, record spoilage, or reverse an eligible movement. Receipt records its source; adjustment, spoilage, and reversal require a reason. Spoilage can remove only unreserved physical stock. Every operation is audited and atomically appends its ledger row and changes the projection. To reverse an erroneous movement, validate that its quantity has not subsequently been consumed/released/reversed and append a linked compensating movement; never edit/delete a movement.
5. Concurrent order acceptances lock balances and serialize; only orders that fit available physical stock commit reservations. Cancellation and fulfillment lock the same order first, then balances, and conditionally transition from the expected state; only one competing transition can win, preventing duplicate release/commit. Retry deadlocks/serialization failures with bounded policy and the same idempotency key. After each operation, ledger sums and projection must reconcile; an invariant failure aborts the transaction.

### Farmer payment record/allocation

1. Only an authenticated admin may invoke payment creation/allocation/reversal functions. Lock the accepted harvest, receipt/reversal chain, and affected allocations in deterministic order.
2. Require matching farmer and INR currency, accepted harvest, positive amount/allocation, and valid configured payment date, method, reference/evidence metadata. Reject pending/rejected harvest, over-allocation, and zero/negative values. Do not label manually recorded transfer as bank/provider verified.
3. A receipt may be partially allocated or have an unallocated remainder. Unallocated funds do not affect harvest outstanding. Claim the idempotency key and create receipt, allocation(s), audit, and idempotency result atomically.
4. Full or partial reversal creates a positive-magnitude reversal payment referencing the original receipt, plus matching allocation-reversal rows for any previously allocated portion. The portion reversed without allocation rows cannot exceed the receipt's then-unallocated remaining amount. Validate cumulative limits under locks; identical retries with the same key and request hash return the original result; same-key/different-payload reuse is rejected. A different key represents a new operation and must pass the same current balance/amount checks. Reversals require a reason and audit event. Audit events are append-only; neither original receipt nor allocations are edited/deleted.
5. Any failure after a primary payment/allocation/reversal write rolls back all payment, allocation, audit, and idempotency writes. Buyer payments/credit are out of this specification.

### Training and enquiry/order workflow

- Registration transaction locks the session row, checks configured capacity and published state, and enforces `UNIQUE(session_id, farmer_user_id)`. Locking/serializing registrations prevents concurrent requests from exceeding capacity. Repeated requests with the same idempotency key return the same registration; another active registration violates uniqueness.
- Enquiry and buyer/bag order transitions require current status and permitted transition; update status and append history/audit atomically. A buyer cannot set an admin-only status. Duplicate or stale transitions conflict without duplicate history.
- Authorization and state changes are enforced server-side, even when UI hides controls.

### Settings

Only an authorized admin function writes settings with schema/range validation, version increment, and audit in one transaction. Prices/rates are admin-controlled and effective-dated; effective changes are prospective and existing offer, order, and harvest snapshots remain unchanged. INR calculations use the specified numeric storage scales and a rounding rule finalized as a deployment configuration before launch. Do not seed demo amounts as production settings.

## 7. Acceptance tests

These are proposed acceptance tests to execute during implementation; none is claimed to have been executed. Use migrations, a local/staging environment, synthetic identities/data, and fault injection only in non-production.

### Authorization/RLS

1. Anonymous SELECT/INSERT/UPDATE/DELETE on every private table returns no data/permission denial; published product/session reads expose only approved public fields.
2. Farmer A cannot SELECT or UPDATE Farmer B profile, order, registration, harvest, decision history, or payment; changing request `user_id` does not bypass ownership. Cross-account INSERT attempts using another farmer's or buyer's identifiers fail.
3. Buyer A cannot SELECT or UPDATE Buyer B business/enquiry/order/lines/history, cannot self-join another business, and cannot change another member’s profile; forged business/user IDs fail. Cross-account INSERT attempts fail.
4. Farmer/buyer cannot add self as admin, update role/verification, or call any admin function. Ordinary admin UI route or forged client role grants no access.
5. Farmer/buyer cannot review enquiries, decide harvests, manage settings/catalogue/inventory/training schedules, or create/allocate/reverse payments. Attempt harvest acceptance/rejection and payment creation/allocation/reversal as non-admin and verify denial; each operation succeeds only through an authorized admin function. Inventory administration and audit-log access are likewise admin-only.
6. Revoking role or business membership stops access on next authorized request/session refresh; role grants/revokes are audited.
7. Farmer A cannot INSERT an enquiry/order/harvest/registration for Farmer/Buyer B or another business by forging owner IDs; Buyer A cannot INSERT an enquiry/order into Buyer B's business. Cross-account DELETE attempts for profiles, business records, orders, harvests, payments, and histories are denied, including when the caller supplies another account's identifiers. Cross-account SELECT, INSERT, UPDATE, and DELETE are all explicitly tested.
8. Attempts by a user to UPDATE `user_profiles.id`, `auth_user_id`, `phone_verified_at`, role grants, membership owner/role, `created_by`/`submitted_by`, archive fields, administrative status, or another account's safe profile fields fail. Allowed profile edits through the validated function change only allowlisted fields and create an audit event where required.
9. Revoke a role grant, verify immediate denial on the next authorized request, then grant the same role again with a new `grant_id`; both historical rows remain, exactly one active grant exists, and the re-grant is audited.
10. Verify normal admins can grant/revoke farmer/buyer roles only for other users; attempts to alter their own grant or any admin grant fail. Attempt active/revoked rows with inconsistent timestamps, actor/reason fields, empty reasons, role values outside the three-role set, reopening, and deletion; each fails. Inject a failure between grant/revocation and audit insert and assert no partial commit.
11. In a disposable environment, bootstrap once with two distinct valid approvals and verify exactly one marker, initial admin grant and system audit event commit. Retry after success and after revoking the first admin; both attempts fail without changing history. Missing, invalid, duplicated, same-operator, wrong-target, wrong-environment, or digest-mismatched approvals fail before any durable change. Concurrent bootstrap attempts result in one success at most.
12. Inject failure before the bootstrap audit or marker insert and verify the Auth/profile mapping, role row, audit and marker all roll back. Verify the marker cannot be updated/deleted through client or ordinary admin privileges. Exercise wrong-admin and lost-admin recovery with two approvals; verify the marker and all prior role/audit rows remain unchanged and recovery appends new audited grants/revocations.
13. Close a user account through the archive/deactivation workflow; verify access is removed and financial, harvest, order, inventory, membership, and audit/history rows remain. Verify deletion of a request/idempotency row sets historical `request_id` references to NULL, and deletion of removable actor profiles sets nullable actor references to NULL; ownership and retained idempotency actor references reject deletion via `ON DELETE RESTRICT`.

### Integrity, concurrency, idempotency

1. Invalid or non-finite weights, rates, grades, currency, quantity, status, reason, and excessive precision fail at database/trusted boundary.
2. Launch two simultaneous decisions on the same submitted harvest; exactly one commits and one conflict occurs. Verify one decision-history row, one audit event, and one derived accepted value.
3. Launch concurrent buyer-order acceptances whose quantities exceed the same stock; assert reservations serialize, no oversell occurs, and accepted quantities are reserved atomically. Launch concurrent cancellation/release requests and concurrent fulfillment/commit requests, including cancellation versus fulfillment; assert only one valid terminal transition and exactly one release or commit per reserved quantity.
4. After receipt, reservation, cancellation, fulfillment, spoilage, adjustment, and a permitted reversal, reconcile physical `on_hand_delta` and `reserved_delta` sums against both projection columns. Deliberately inject a projection mismatch in a disposable test database and verify reconciliation detects and reports it without silently repairing it.
5. Retry identical create-order, decision, registration, payment, allocation, and reversal requests with the same key; no duplicate entity/movement/history/payment/allocation. Reuse a key with a different payload is rejected. Submit the same logical operation with a different key and verify it is treated as a new operation subject to normal state/balance validation, not silently deduplicated. Verify idempotency results remain available throughout the configured retry-retention period.
6. Payment tests cover pending/rejected harvest, farmer/currency mismatch, zero/negative amount, amount above due, over-allocation after concurrent partial allocations, duplicate reference/key handling, valid partial allocation, unallocated remainder, and derived outstanding. Verify full reversal, partial reversal, reversal of allocated and unallocated amounts, required reason/audit, and rejection of any reversal exceeding the remaining reversible receipt/allocation amount.
7. Force an exception after each primary write but before history, movement, allocation, audit, and idempotency completion for harvest, inventory/order, payment, role grant/revocation, training registration, and profile update operations. Assert full rollback: no partial data, stock drift, extra history/audit, or consumed idempotency result. Retry with same key succeeds once.
8. Attempt direct UPDATE/DELETE of ledger, payment, harvest decision history, order history, role grants, and audit logs as each client role; verify denied. Verify profile column restrictions independently of RLS by attempting direct updates to trusted columns.
9. Launch concurrent farmer registrations for a training session at configured capacity; verify capacity is not exceeded and excess requests fail cleanly.

### Migration, recovery, and deployment

10. Apply all migrations to an empty disposable database; apply again according to migration runner semantics; confirm version ordering and no untracked schema drift.
11. Seed only synthetic fixtures; verify FK/check/unique constraints and RLS after each migration. Test forward migration from previous staging snapshot and documented rollback/forward-fix procedure.
12. Inject migration failure and confirm transaction/restore approach leaves a known schema state; test rollback only for reversible schema changes and preserve committed records.
13. Restore encrypted backup/export into an isolated database, validate schema/version, row counts, relationships, ledger/payment reconciliation, access controls and measured RTO/RPO. Never restore over live production as a test.
14. Deploy pilot artifact with separate staging/production environment configuration; verify direct routes, HTTPS, secret absence from bundle, authentication, RLS matrix, monitoring alerts, and demo route/data isolation.

## 8. Migration order

Order migrations to satisfy dependencies and deploy/test RLS before UI integration:

1. **Environment:** resolve deployment decisions, provider, hosting region/budget, and required retention configuration; create isolated staging only after those approvals; establish migration runner, test authentication, and synthetic fixtures. No production or real user data.
2. **Foundation:** extensions required for UUID/exclusion constraints, timestamp trigger, `user_profiles`, `user_roles`, `audit_logs`, idempotency table, append-only private operator-action ledger, permanent private bootstrap marker, role/authorization helper functions, and restricted grants. Establish default-deny access before client exposure. The bootstrap SQL is an operator-run transaction; do not install a public/reusable bootstrap RPC.
3. **Profiles/business:** `farmer_profiles`, `buyer_profiles`, `buyer_businesses`, `buyer_business_members`; add ownership and membership RLS tests before dependent tables.
4. **Reference data:** `products`, `catalogue_offers`, `training_sessions`; seed only explicitly approved synthetic/test catalog/session values.
5. **Enquiry and training:** `buyer_enquiries`, enquiry history, `training_registrations`; implement status and registration functions/tests.
6. **Inventory and orders:** `inventory_locations`, `inventory_balances`, `bag_orders`/lines/history, `buyer_orders`/lines/history, then `inventory_movements`; implement transactional buyer acceptance/reservation, release/cancellation, fulfillment/commit, receipt, adjustment, spoilage, and reversal functions. Migration may stage cyclic references using nullable FKs added after both sides exist.
7. **Harvest and rates:** `harvest_grade_rates`, `harvest_submissions`, `harvest_decision_history`, admin-only effective-rate and decision functions, constraints, RLS and concurrency tests.
8. **Payments/settings:** payment/allocation/reversal schema and admin-only write functions; `admin_settings` and trusted write function; audit all updates. Keep buyer credit/payment outside this specification.
9. **Security and operations gate:** run complete RLS/transaction/fault-injection test suite, backup/restore drill, secret review, monitoring and rollback rehearsal before production consideration.
10. **Pilot UI and cutover:** separate backend-backed pilot deployment; preserve demo untouched; demo import is separate explicit approval/export/reconciliation process, never automatic dual-write.

## 9. Rollback and operational controls

- Keep migrations in version control and tag releases. Prefer expand/contract migrations; first deploy backward-compatible columns/tables, migrate consumers, then remove obsolete schema only after separate review and backup.
- A UI rollback reverts to the last known-good pilot artifact/feature flag and never deletes backend data. The demo remains an independent deployment/data path.
- For data/security incident, disable affected writes, preserve logs, revoke affected sessions/credentials, notify designated incident owner, and recover into a new isolated environment first. Reconcile committed events before resuming; never restore stale data over live transactions as a shortcut.
- Before launch, approve RPO, RTO, backup retention, encrypted export cadence, access, incident response and audit/privacy retention. Enable managed backups appropriate to the selected plan, retain restricted encrypted exports, and repeatedly prove restore including database and any object storage.
- Configure monitoring for application errors, RLS denials, auth/OTP abuse and delivery, unusual privileged actions, failed transactions, inventory/payment reconciliation, and backup/export failure. Never log secrets, session tokens, OTP values, or unnecessary personal/payment details.
- Hosting provider, region, security headers, domain and TLS configuration are **unverified** until selected. Production must use a separate Supabase project, Auth settings, SMS configuration, secrets, database and backups from staging.

## 10. Decisions requiring owner approval

The business rules in this specification are finalized. Resolve deployment and operational configuration below before provisioning cloud resources or implementing:

1. **Provider/cost:** Supabase acceptance or alternative; monthly budget ceiling including database, hosting, OTP, monitoring, taxes, backup and overages.
2. **Hosting, region, and availability:** hosting/domain, staging and production regions/data residency, expected traffic, uptime target, separate API/Edge Function need, and public vs staff-only pilot deployment.
3. **Identity:** OTP channel/provider, SMS vendor and India/TRAI DLT obligations, verified phone/account uniqueness, OTP limits/CAPTCHA, and admin MFA/recovery. The role authority and two-person operator procedure are approved; record the actual named primary and backup operators and initial administrator identity as deployment-time decisions.
4. **Business membership:** whether a buyer business may have multiple members, who invites/revokes members, what “approved business” means, and the phone/account uniqueness policy. The application role set and privileged-operation authority are fixed in this specification.
5. **Pilot scope and operational data:** staff-only synthetic vs real-user pilot; selected products, units, stock locations and initial stock/source; actual admin-configured training schedules/capacities; whether and when manual farmer payments are enabled in the pilot. The buyer-order acceptance/reservation/cancellation/fulfillment lifecycle is fixed in this specification.
6. **Configured prices and rates:** actual effective-dated offer prices and A/B/C grade-rate values, rounding policy for INR calculations, and whether grade rates require finer precision than `numeric(14,2)`. INR currency, A/B/C grades, admin control, effective dating, and immutable historical snapshots are fixed.
7. **Payment operating details:** allowed method vocabulary, which evidence metadata is required for each method, payment-date convention, reconciliation owner, and any separately approved gateway/bank/UPI integration. Payment/reversal authority, idempotency, partial allocation/unallocated remainder, reversal rules, and INR currency are fixed; buyer credit/payment is outside this specification.
8. **Data/privacy:** whether any demo records are eligible for user-consented export/import (default: none); identity re-verification, retention, legal holds, anonymization, privacy notice, audit retention and support/incident owner.
9. **Recovery and idempotency retention:** RPO/RTO, backup retention/cadence, encrypted export access, restore frequency, monitoring provider/retention, incident communications and rollback authority; set an idempotency-key retention duration long enough to protect legitimate retries and configure controlled cleanup.

## Assumptions and unresolved items

- The specification describes a possible Supabase/PostgreSQL design, but the provider is not approved or provisioned. The design is not migration SQL and does not prove implementation.
- Approved design rules include the only three application roles, admin-only privileged operations, INR currency, A/B/C grades, effective-dated admin-controlled prices/rates, immutable historical snapshots, buyer-order reservation lifecycle, admin-managed training schedules/capacity, and payment/reversal rules. Actual initial values, currency-calculation rounding, policy retention periods, provider, hosting region, membership details, operational pilot scope, and deployment configuration remain unresolved as listed above.
- Existing Farmer, Buyer and Admin Portal stores use versioned localStorage documents and tab-scoped simulated sessions. The current demo has no Supabase/API integration. It remains unchanged and isolated from any future staging/production store.
- Acceptance tests above are proposed for implementation and have not been executed as part of this documentation specification.
- No real customer data, credentials, or secrets are used by this specification.

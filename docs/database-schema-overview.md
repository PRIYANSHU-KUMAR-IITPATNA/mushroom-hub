# Mushroom Hub database schema overview

The schema in `backend/prisma/schema.prisma` is a normalized initial Prisma 6.12 model for Neon PostgreSQL. It is design/build foundation only: no Neon connection was made and no migration was applied. A production rollout requires reviewed migration SQL, environment-specific credentials, a backup/recovery plan, and approval.

## Models and relationships

| Area | Models | Relationships and integrity intent |
|---|---|---|
| Identity and access | `User`, `Role`, `Permission`, `RolePermission`, `UserRole` | A person has one user identity and may separately have a farmer profile, a buyer profile, or both. Role grants are records rather than a fixed role column. Profile identity is unique per user. Authorization and safe role grant/revocation workflows are not implemented yet. |
| Farmer and buyer profiles | `FarmerProfile`, `BuyerProfile`, `FarmerVerification` | Farmer and buyer profiles reference the same `User` table. Verification records reference a farmer and optional reviewing user; evidence fields store object keys, not file contents. |
| Training | `TrainingSession`, `TrainingRegistration`, `TrainingAttendance` | Registration joins a farmer profile to a session and is unique per pair. Attendance is one record per registration. Capacity checks must be atomic in a future service. |
| Grow operations | `MushroomBagBatch`, `BagDistribution`, `ProductionRecord` | Distribution references a source bag batch and farmer. Production may reference its distribution. Inventory decrement and distribution creation must share a transaction. |
| Collection and quality | `CollectionCentre`, `HarvestSubmission`, `WeighingRecord`, `HarvestGradeResult`, `HarvestDecision` | Harvest belongs to a farmer; physical receipt records collection centre/operator/time; each weighing records gross/tare/net; one grade result per harvest per A/B/C/D grade. Decision history is appendable. Only accepted quantities should create sellable inventory. |
| Products and inventory | `Product`, `InventoryBatch`, `InventoryMovement` | Sellable batches reference a product, collection centre, and optionally the harvest/grade result that produced them. A batch maintains on-hand and reserved projections; movements record signed physical-stock and reservation deltas, and reversals point to the original movement. Available stock is on-hand minus reserved. |
| Buyer commerce | `BuyerOrder`, `BuyerOrderItem`, `DispatchRecord`, `DispatchItem` | Orders belong to buyer profiles. Items snapshot quantity/unit/price/currency. Dispatch items reference order items and dispatch records. Stock reservation, dispatch and cancellation transitions need trusted transactional enforcement. |
| Farmer payables | `FarmerPayableLedgerEntry` | Separate append-oriented ledger tied to a farmer and optionally a harvest decision. Reversal entries reference the original entry. |
| Buyer receivables | `BuyerReceivableLedgerEntry` | Separate buyer ledger tied to a buyer profile and optionally an order. Reversal entries reference the original entry. |
| Payments | `Payment`, `PaymentAllocation` | Payment records include direction/method/reference; allocations point to either farmer payable or buyer receivable entries, and allocation corrections link to the original allocation. Validate direction, exactly-one ledger target, outstanding amounts, and duplicates in a transaction. |
| Business controls | `Expense`, `AuditLog`, `IdempotencyKey` | Expenses retain correction/reversal links. Audit events record actors and entity references. Idempotency keys are unique per actor/operation/key. These are storage structures only; append-only access controls and replay behavior must be implemented before real use. |

## Numeric, historical, and pending business rules

- Weights and quantities use PostgreSQL `numeric(14,3)`; INR amounts and rates use `numeric(14,2)`. Prisma maps these values to `Decimal`, not JavaScript floating-point `number`.
- Currency defaults to `INR`. Confirm exact rounding, maximum harvest/stock/payment amounts, and operational quantity precision before finance workflows.
- The initial migration adds PostgreSQL checks for positive/nonnegative quantities, exact net weights, INR, receipt fields, fulfillment addresses, one ledger target per payment allocation, reversal links, and one active user-role grant. Cross-row accounting/stock invariants still require transactional service logic.
- No grade criteria, price/rate, fee, payment term, credit limit, seeded inventory, or initial user is defined.
- Do not delete posted payment, allocation, ledger, dispatch, audit, or inventory history; record corrections as linked reversals.
- Database-level cross-row rules such as accepted-weight sums, stock availability, payment allocations, and idempotency replay require trusted transaction logic. Prisma's schema alone cannot express every business invariant.

## Migrations

Prisma uses `DATABASE_URL` for pooled application queries and `DIRECT_DATABASE_URL` for direct migration connections. Review generated SQL before applying it. `prisma migrate dev` is restricted to a disposable development database; production/staging deployment uses reviewed, checked-in migrations through `prisma migrate deploy`. No migration is automatically run when the API starts.

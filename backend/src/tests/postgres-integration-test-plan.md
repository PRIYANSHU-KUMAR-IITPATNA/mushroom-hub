# PostgreSQL integration test plan

Status: planned; no PostgreSQL integration tests have been executed.

## Safety and execution gate

- Use only `backend/.env.test` and the dedicated local `mushroom_hub_test` database.
- Before constructing a Prisma client, load that file explicitly, set `NODE_ENV=test`, and call `parseEnvironment(process.env)`. Abort if either database URL is not loopback or does not name `mushroom_hub_test`.
- Never fall back to `backend/.env`, an inherited production URL, Neon, or a remote host.
- Do not use `migrate reset`, `db push`, `TRUNCATE`, or broad table deletion.
- Apply the checked-in migration chain only after separate approval.
- Create uniquely identified fixtures and delete only rows created by the current test run, in foreign-key-safe order. Assert cleanup affected only those fixture identifiers. If cleanup fails, fail the run and report the fixture IDs; do not broaden cleanup.
- Run mutation, rollback, and concurrency cases in the dedicated test database only.

## Existing database-independent coverage

`src/tests/` currently contains unit and HTTP tests for environment validation, application request validation, auth normalization, payable arithmetic, effective-rate selection, quantity reconciliation, decision classification, middleware, health/error responses, and provider behavior. These tests do not exercise PostgreSQL transaction semantics.

## PostgreSQL integration cases to implement and run

Use seeded users, farmer profile/application, an admin role grant, collection centre, active grade-specific kilogram products, approved rate policies, a physically received/graded harvest, and a unique request ID/idempotency key per case. Assert persisted state by querying the database after each operation.

1. **Farmer application lifecycle** — create an application through the real service/API, approve it as an authenticated admin, and assert application status, history/audit event, and role grant are persisted together.
2. **Grade-wise acceptance** — accept multiple grades and assert one decision, exact grade results, one inventory batch and receipt movement per positive accepted grade, and accurate inventory quantities.
3. **Payable posting** — assert grade-specific ledger entries snapshot the approved policy ID/reference/rate and rounded amount, with amounts matching accepted quantities.
4. **Rejected quantities** — fully rejected grades produce no inventory batch/movement or payable; partial acceptance records only accepted quantities in inventory and payable.
5. **Missing approved rate** — force acceptance to fail and assert harvest status, decision/results, inventory, ledger, idempotency, and audit state are unchanged.
6. **Idempotency** — identical actor/key/payload returns the original decision without additional records; same key/different payload conflicts.
7. **Decision uniqueness and concurrency** — concurrent identical and competing keys for one harvest result in at most one decision/receipt/payable; conflicts are explicit and no duplicates persist.
8. **Audit consistency** — successful writes have a matching audit event; failed transactions leave no success-shaped audit/idempotency rows.
9. **Rollback fault injection** — cause failures at inventory batch, inventory movement, payable, idempotency, and audit writes; verify every acceptance-side write rolls back.
10. **Database constraints/triggers** — verify immutable approved rate policies and posted payable rows; verify valid linked corrections/reversals remain allowed.

## Test evidence requirements

Record each case's expected and actual database state, result, DB identity, migration status, and discovered defect. Do not label mocked or unit tests as PostgreSQL integration tests. Concurrency and rollback claims require real PostgreSQL execution.

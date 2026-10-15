# LedgerLoop Implementation Plan

## Repository baseline

- Repository: `naveeth06/LedgerLoop`
- Default branch: `main`
- Inspection date: 2026-10-15
- Greenfield implementation; not a refactor.
- Verification: merged increments are checked through GitHub Actions for migrations, PostgreSQL RLS integration, type-checking, build and unit tests. Direct local execution is not available in this session.
- Docker is optional and deferred; CI uses temporary PostgreSQL service containers.

## Engineering principles

1. Persist money as integer paise; use deterministic calculations.
2. Post vouchers and journal lines atomically; enforce balanced debit/credit totals at the database boundary. Posted vouchers are immutable and corrected by reversal.
3. Tenant-own every company resource with forced RLS and transaction-local context.
4. Audit mutations; AI outputs remain untrusted suggestions requiring human approval.
5. Avoid placeholder metrics; validate configuration and keep secrets out of source control.
6. Include tests and demo scripts where meaningful; report verification accurately.

## Architecture

- `apps/web`: Angular standalone, Material/CDK, signals, Tailwind and accessible responsive UI.
- `apps/api`: NestJS API, auth, authorization, validation, OpenAPI and accounting services.
- `apps/worker`: BullMQ workers/scheduled jobs.
- `packages/types`: shared contracts/schemas.
- PostgreSQL/pgvector, Redis/BullMQ and S3-compatible object storage. Docker optional locally.

## Phased delivery

### Phase 0 — Foundation
- [x] npm workspaces, integer-paise helper, health endpoint, config validation and CI.
- [ ] Linting, lockfile policy and final environment validation.

### Phase 1 — Tenant and identity
- [x] Users, companies, memberships, branches, audit log, forced RLS and tenant context.
- [x] Database pool lifecycle, active-membership transactions and audit service.
- [x] Argon2id password hashing and refresh-session rotation/replay defense.
- [x] Email/password auth, CSRF/origin checks, access tokens, CORS and throttling.
- [x] Access-token guard, company onboarding, roles and branch APIs.
- [x] Company directory and branch listing with user-scoped membership RLS.
- [ ] Email verification/password reset and Google sign-in.
- [ ] Distributed rate limiting, security monitoring and full auth integration tests.

### Phase 2 — Accounting core
- [x] Tenant-scoped chart of accounts and audited list/create API.
- [x] Company settings and tenant-scoped GST registration APIs.
- [x] Tenant-scoped parties directory with customer/supplier/both types, GSTIN/contact/address data, paise credit limits, forced RLS and audit.
- [ ] Items, warehouses and opening balances.
- [ ] Deterministic CGST/SGST/IGST calculations and rounding rules.
- [ ] Voucher, journal-entry and journal-line schema with atomic posting and database-enforced balance.
- [ ] Posted voucher immutability and reversal workflow.
- [ ] Tests for balance, rollback, tax, rounding, immutability and tenant boundaries.

### Phase 3 — Sales and purchases
- [ ] Quotes, invoices, receipts, purchase orders, bills, payments, expenses and debit notes.
- [ ] Invoice-to-payment demo and Playwright e2e.
- [ ] GST-aware numbering, validation and audit trail.

### Phase 4 — Banking and reporting
- [ ] Secure statement import with size/type limits and scanning.
- [ ] Reconciliation candidates with confidence thresholds; low-confidence matches never auto-post.
- [ ] Trial balance, P&L, balance sheet, receivables ageing and GST summary from posted journals.
- [ ] Statement-import demo and Playwright e2e.

### Phase 5 — Reminders and AI
- [ ] BullMQ overdue reminders with retries, idempotency and audit.
- [ ] Claude-backed categorisation scoped to current-company ledger candidates.
- [ ] Receipt extraction/reconciliation suggestions with validation and human approval.
- [ ] Quotas, prompt-injection defense, redaction and AI audit metadata.
- [ ] Tests for isolation, malformed output, quotas, approval and confidence thresholds.

### Phase 6 — Hardening
- [ ] WCAG 2.2 AA and keyboard/screen-reader review.
- [ ] Responsive checks at 640/1024/1440px; loading/empty/error/offline states and Ctrl+K.
- [ ] OpenAPI, seed data, Dockerfiles, docs, CI and demo scripts.
- [ ] Run lint, unit, API integration and Playwright suites in a real runtime.

## Implementation increments

1–9. **Completed:** foundation, auth, tenant RLS, company/branch context and chart of accounts. Latest relevant CI runs are linked in prior merged PRs.
10. **Completed:** company settings and GST registration APIs; [CI run #139 passed](https://github.com/naveeth06/LedgerLoop/actions/runs/38762723608).
11. **In review:** tenant-scoped party directory schema and list/create APIs, validation, forced RLS, audit and tests. Verify latest-head CI before marking complete.

## Acceptance gates

- Never mark work complete merely because source files exist.
- Posting: balanced journal lines and voucher in one transaction; failed posting leaves no partial state.
- Reconciliation: low-confidence matches remain suggestions.
- Reminders: server-side scheduling, idempotency and tests.
- Tenant isolation is tested against PostgreSQL, not inferred from service filters.
- Report only checks that actually ran.

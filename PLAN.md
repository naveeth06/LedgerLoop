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
- [x] Tenant-scoped item and warehouse directories with HSN/SAC, GST-rate metadata, integer-paise prices, inventory flags, optional branch assignment, forced RLS and audit.
- [x] Opening trial-balance posting and tenant-scoped opening inventory snapshots, atomically linked to posted journals.
- [x] Deterministic CGST/SGST/IGST calculations and integer-paise half-up rounding rules.
- [x] Journal entry and line schema with atomic posting and database-enforced balance.
- [x] Posted journal and opening-inventory immutability at the database boundary.
- [ ] Reversal workflow.
- [x] Tests for balance, rollback, GST tax, rounding, immutability and tenant boundaries covered by completed increments.

### Phase 3 — Sales and purchases
- [x] Sales quotations and sales invoice draft schemas with tenant-scoped lines, automatic numbering, GST totals and audit events.
- [ ] Invoice issue/posting to receivables, sales, output GST and inventory deduction.
- [ ] Receipts and receivable allocation.
- [ ] Purchase orders, bills, supplier payments, expenses and debit notes.
- [ ] Invoice-to-payment demo and Playwright e2e.
- [x] GST-aware sales numbering, validation and audit trail foundation.

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

1–9. **Completed:** foundation, auth, tenant RLS, company/branch context and chart of accounts.
10. **Completed:** company settings and GST registration APIs.
11. **Completed:** tenant-scoped party directory.
12. **Completed:** tenant-scoped items and warehouses.
13. **Completed:** tenant-scoped journal entries and lines, draft creation, balanced posting checks, forced RLS, audit events and unit tests.
14. **Completed:** opening trial-balance posting and opening inventory snapshots. Inventory values use integer arithmetic with half-up paise rounding; journal posting, stock rows and audit events share one tenant transaction. Latest merged CI run passed.
15. **In progress:** sales quotation/invoice draft foundation, deterministic GST engine, automatic numbering, tenant-scoped lines, invoice immutability guard and audit events.

## Acceptance gates

- Never mark work complete merely because source files exist.
- Posting: balanced journal lines and voucher in one transaction; failed posting leaves no partial state.
- Reconciliation: low-confidence matches remain suggestions.
- Reminders: server-side scheduling, idempotency and tests.
- Tenant isolation is tested against PostgreSQL, not inferred from service filters.
- Report only checks that actually ran.

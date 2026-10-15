# LedgerLoop Implementation Plan

## Repository baseline

- Repository: `naveeth06/LedgerLoop`
- Default branch: `main`
- Inspection date: 2026-10-15
- This is a greenfield implementation, not a refactor.
- Verification: merged increments are verified through GitHub Actions for migrations, tenant RLS integration, TypeScript type-checking, build, and unit tests. Direct local execution is not available in this session.
- Local setup constraint: Docker is optional and intentionally deferred. GitHub Actions uses a temporary PostgreSQL service for integration tests; local database work can use native PostgreSQL on Windows later.

## Product and engineering principles

1. Persist money as integer paise and keep calculations deterministic.
2. Post vouchers and journal lines atomically; enforce balanced debit/credit totals at the database boundary. Posted vouchers are immutable and corrected by reversal.
3. Scope every tenant-owned table by `company_id`; enable and test forced RLS with transaction-scoped context.
4. Audit mutations. AI outputs are untrusted suggestions and require human approval.
5. Never use placeholder business metrics; empty states must be explicit.
6. Validate configuration at startup; keep secrets out of source control.
7. Each increment includes tests and a demo script where meaningful; report checks accurately.

## Target architecture

- `apps/web`: Angular standalone, Angular Material/CDK, signals, Tailwind, accessible responsive UI.
- `apps/api`: NestJS, validation, authentication, authorization, OpenAPI, accounting services.
- `apps/worker`: BullMQ workers and scheduled jobs.
- `packages/types`: shared TypeScript contracts and schemas.
- PostgreSQL/pgvector, Redis/BullMQ, S3-compatible object storage. Docker is optional locally.
- Server-side Claude adapter with structured output validation, company quotas and approval workflows.

## Phased delivery

### Phase 0 — Foundation
- [x] npm workspaces, integer-paise helper, API health, configuration validation and CI.
- [ ] Linting, lockfile policy and final environment validation.

### Phase 1 — Tenant and identity
- [x] Users, companies, memberships, branches, audit log, forced RLS and tenant context.
- [x] Database pool lifecycle, active-membership tenant transactions and audit service.
- [x] Argon2id password hashing, refresh-token hashing/rotation and replay-triggered family revocation.
- [x] Email/password auth, CSRF/origin protection, short-lived access tokens and throttling.
- [x] Global access-token guard, company onboarding, role checks and branch APIs.
- [x] Authenticated company directory and branch listing with user-scoped membership RLS.
- [ ] Email verification/password reset and Google sign-in.
- [ ] Distributed rate limiting, security monitoring and full auth integration tests.

### Phase 2 — Accounting core
- [x] Tenant-scoped chart-of-accounts schema and list/create API with account constraints, forced RLS and audit.
- [x] Company settings retrieval/update and tenant-scoped GST registration list/create API (PR #10 pending verification).
- [ ] Parties, items, warehouses and opening balances.
- [ ] Integer-paise money types and deterministic CGST/SGST/IGST tax calculations including rounding rules.
- [ ] Voucher, journal-entry and journal-line schema with atomic posting and database-enforced balance.
- [ ] Posted voucher immutability and reversal workflow.
- [ ] Unit/database integration tests for balance, rollback, tax, rounding, immutability and tenant boundaries.

### Phase 3 — Sales and purchases
- [ ] Quotes, invoices, receipts, purchase orders, bills, payments, expenses and debit notes.
- [ ] Invoice-to-payment demo and Playwright e2e coverage.
- [ ] GST-aware document numbering, validation and audit trail.

### Phase 4 — Banking and reporting
- [ ] Secure statement uploads/import parsing with type/size limits and scanning.
- [ ] Reconciliation candidates with confidence thresholds; never auto-post low-confidence matches.
- [ ] Trial balance, profit and loss, balance sheet, receivables ageing and GST summary from posted journals.
- [ ] Statement-import demo and Playwright e2e coverage.

### Phase 5 — Reminders and AI
- [ ] BullMQ overdue reminders with retries, idempotency and delivery audit.
- [ ] Claude-backed categorisation using only current-company ledger candidates.
- [ ] Receipt extraction/reconciliation suggestions with schema validation and human approval.
- [ ] Per-company quotas, prompt-injection defenses, redaction and AI-created-record audit.
- [ ] Tests for isolation, malformed outputs, quota, prompt injection, approval and confidence thresholds.

### Phase 6 — Hardening
- [ ] WCAG 2.2 AA, keyboard/screen-reader review and shared light/dark tokens.
- [ ] Responsive checks at 640/1024/1440px; loading, empty, error/offline states and Ctrl+K.
- [ ] OpenAPI, seed data, Dockerfiles, complete docs, CI and demo scripts.
- [ ] Run lint, unit, API integration and Playwright suites in a real runtime.

## Implementation increments

1. **Completed:** repository plan, npm workspace, integer-paise utility, environment template, README, optional Compose and initial CI.
2. **Completed:** NestJS API starter, health endpoint, config validation and scripts.
3. **Completed:** PostgreSQL tenant schema, forced RLS and integration test.
4. **Completed:** database runtime, active-membership checks, audit service and tests.
5. **Completed:** password hashing and refresh-session rotation/replay defense.
6. **Completed:** auth endpoints, CSRF/origin, access tokens, CORS and throttling; CI passed.
7. **Completed:** authorization guard, company onboarding, branch creation and audit; CI passed.
8. **Completed:** company directory/branch listing and user-scoped membership RLS; [CI passed](https://github.com/naveeth06/LedgerLoop/actions/runs/38761759245).
9. **Completed:** chart-of-accounts schema/API and account audit; [CI passed](https://github.com/naveeth06/LedgerLoop/actions/runs/38762262278).
10. **In review:** company settings and GST registrations. Verify current-head CI before marking complete.

## Acceptance gates

- A feature is not complete merely because source exists.
- Posting acceptance: balanced invoice journal lines in one transaction; failed posting leaves no partial state.
- Reconciliation acceptance: low-confidence matches remain suggestions.
- Reminder acceptance: server-side schedule with idempotency and tests.
- Security acceptance: tenant isolation tested against PostgreSQL, not inferred from filters.
- Release acceptance: migrations, seed, docs, environment template, CI and demo scripts; report only actual checks.

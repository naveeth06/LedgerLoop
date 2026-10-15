# LedgerLoop Implementation Plan

## Repository baseline

- Repository: `naveeth06/LedgerLoop`
- Default branch: `main`
- Inspection date: 2026-10-15
- Observed state at initial inspection: repository was empty; this is a greenfield implementation, not a refactor.
- Verification: merged increments have been verified through GitHub Actions for migrations, tenant RLS integration, TypeScript type-checking, build, and unit tests. The current auth HTTP endpoint branch must pass its own latest-head workflow before it is considered verified. Direct local execution is not available in this session.
- Local setup constraint: Docker is optional and intentionally deferred. GitHub Actions uses a temporary PostgreSQL service for integration tests; local database work can use native PostgreSQL on Windows later.

## Product and engineering principles

1. Keep accounting calculations deterministic and use integer paise for persisted money.
2. Post each voucher and its journal lines atomically. Enforce balanced debit/credit totals at the PostgreSQL transaction boundary; posted vouchers are immutable and corrected by reversal.
3. Scope every tenant-owned table by `company_id`. Enable and test PostgreSQL row-level security, with transaction-scoped tenant context and safe connection-pool behavior.
4. Audit every mutation. AI outputs are untrusted suggestions, require human approval, and are tagged/audited when accepted.
5. Never use placeholder business metrics. Empty states must be explicit.
6. Validate configuration at startup; keep secrets out of source control and provide only safe placeholders in `.env.example`.
7. Each increment must include tests and a runnable demo script where meaningful. Report exactly which checks were run and which remain unverified.

## Target architecture

- `apps/web`: Angular 18+ standalone application, Angular Material/CDK, signals, Tailwind, accessible responsive UI and keyboard-first workflows.
- `apps/api`: NestJS HTTP API, validation, authentication, authorization, OpenAPI, accounting domain services.
- `apps/worker`: BullMQ workers and server-side scheduled jobs, including overdue reminders.
- `packages/types`: shared TypeScript contracts and validated API schemas.
- PostgreSQL with migrations and `pgvector`; Redis/BullMQ; S3-compatible object storage. Docker is optional for local development.
- Claude integration isolated behind a server-side provider adapter, structured JSON parsing/schema validation, company quotas, and approval workflows.

## Phased delivery

### Phase 0 — Repository and API foundation
- [x] npm workspaces, shared integer-paise helper, NestJS health endpoint, configuration validation, and CI.
- [ ] Add linting, lockfile policy, and final environment validation.

### Phase 1 — Tenant and identity foundation
- [x] Users, companies, memberships, branches, and audit-log schema.
- [x] Forced RLS and transaction-scoped tenant context; PostgreSQL integration coverage.
- [x] PostgreSQL pool lifecycle management, active-membership tenant transactions, and transaction-aware audit writes.
- [x] Argon2id password hashing, refresh-token hashing/rotation, and replay-triggered session-family revocation.
- [x] Email/password sign-up, sign-in, refresh, and logout HTTP endpoints; HttpOnly refresh cookie, CSRF checks, origin validation, credentialed CORS, short-lived signed access tokens, and endpoint throttling.
- [ ] Access-token authorization guard and protected route policy.
- [ ] Email verification/password reset, Google sign-in adapter, and company onboarding/membership creation.
- [ ] Distributed rate limiting, security monitoring, and full authentication integration tests.

### Phase 2 — Accounting core
- [ ] Chart of accounts, ledgers, parties, items, warehouses, company settings, and GST registrations.
- [ ] Integer-paise money types and deterministic CGST/SGST/IGST tax calculation, including rounding rules.
- [ ] Voucher, journal-entry, and journal-line schema with atomic posting and database-enforced balance.
- [ ] Posted voucher immutability and reversal workflow.
- [ ] Unit and database integration tests for balance, rollback, tax, rounding, immutability, and tenant boundaries.

### Phase 3 — Sales and purchases
- [ ] Quotes, invoices, receipts, purchase orders, bills, payments, expenses, and debit notes.
- [ ] Invoice-to-payment demo script and Playwright end-to-end coverage.
- [ ] GST-aware document numbering, validation, and audit trail.

### Phase 4 — Banking and reporting
- [ ] Secure statement uploads/import parsing with type/size limits and scanning integration.
- [ ] Reconciliation candidates with explicit confidence thresholds; never auto-post low-confidence matches.
- [ ] Trial balance, profit and loss, balance sheet, receivables ageing, and GST summary derived from posted journal data.
- [ ] Statement-import demo script and Playwright e2e coverage.

### Phase 5 — Reminders and AI assistance
- [ ] Server-side overdue reminder scheduling with BullMQ, retries, idempotency, and delivery audit.
- [ ] Claude-backed expense/bank categorisation using only the current company's ledger candidates.
- [ ] Receipt extraction and reconciliation suggestions with schema validation and human approval.
- [ ] Reminder drafting, per-company quotas, prompt-injection defenses, redaction, and AI-created-record flags/audit events.
- [ ] Tests for cross-company isolation, malformed outputs, quota enforcement, prompt injection, approval, and confidence thresholds.

### Phase 6 — Hardening and release readiness
- [ ] WCAG 2.2 AA keyboard and screen-reader review; light/dark themes from shared tokens.
- [ ] Responsive checks at 640/1024/1440px; loading, empty, error, and offline states; Ctrl+K palette.
- [ ] OpenAPI docs, migrations and seed data, Dockerfiles, complete README, CI, and demo scripts.
- [ ] Run lint, unit, API integration, and Playwright suites in a real runtime; resolve failures and document remaining limitations.

## Implementation increments

1. **Completed:** repository plan, npm workspace, integer-paise utility and tests, environment template, README, optional Docker Compose, and initial CI.
2. **Completed:** NestJS API starter, health endpoint, startup validation, and API build/typecheck/test scripts.
3. **Completed:** PostgreSQL tenant schema, forced RLS policies, tenant context helper, and PostgreSQL-backed RLS integration test.
4. **Completed:** database runtime, active-membership tenant resolution, transaction-aware audit service, and unit tests.
5. **Completed:** Argon2id password hashing, opaque refresh-token hashing, session persistence, transactional refresh rotation, replay-triggered family revocation, and unit tests.
6. **In progress:** HTTP authentication endpoints, CSRF/origin protections, short-lived access tokens, CORS, and rate limiting. Must not be considered complete until the current branch's CI passes.

## Acceptance gates

- A feature is not marked complete merely because source files exist.
- Accounting posting acceptance: a posted invoice creates balanced journal lines in one database transaction; failed posting leaves no partial state.
- Reconciliation acceptance: matches below the configured threshold remain suggestions and never post automatically.
- Reminder acceptance: reminders execute from the server scheduler while the web app is closed, with idempotency and test coverage.
- Security acceptance: tenant isolation is tested against the database, not inferred from service filters alone.
- Release acceptance: migrations, seed, docs, environment template, CI, and demo scripts are present; all claimed checks have actual recorded results.

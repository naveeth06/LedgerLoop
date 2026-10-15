# LedgerLoop Implementation Plan

## Repository baseline

- Repository: `naveeth06/LedgerLoop`
- Default branch: `main`
- Inspection date: 2026-10-15
- Observed state at initial inspection: repository was empty; this is a greenfield implementation, not a refactor.
- Verification: GitHub Actions passed npm install, PostgreSQL migration, tenant RLS integration, TypeScript type-checking, API build, and unit tests for the merged tenant foundation. The database runtime/membership/audit increment is being verified separately in CI. Direct local execution is not available in this session.
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
- [x] Inspect repository metadata and record the implementation plan.
- [x] Establish npm workspaces and shared integer-paise helper with unit tests.
- [x] Add NestJS API starter, health endpoint, startup environment validation, and build/typecheck/test scripts.
- [x] Add starter GitHub Actions workflow; initial API and utility checks passed.
- [x] Add README, environment template, and Docker Compose file for a later optional local infrastructure phase.
- [ ] Add linting, lockfile policy, and final environment validation.

### Phase 1 — Tenant and identity foundation
- [x] Run the PostgreSQL migration and RLS integration test in CI; migration and RLS checks passed in the merged tenant-foundation increment.
- [x] Add initial users, companies, memberships, branches, and audit-log schema.
- [x] Add company-scoped RLS policies and transaction-scoped tenant context.
- [x] Add PostgreSQL pool lifecycle management, `DATABASE_URL` validation, active-membership tenant transactions, and transaction-aware audit writes (CI verification pending for this increment).
- [ ] Argon2 password hashing, email/password sign-in, Google sign-in adapter, rotating refresh tokens in HttpOnly cookies, CSRF, rate limits.
- [ ] RBAC permission guard on every protected route; complete audit-write integration.
- [ ] Unit/integration tests for tenant isolation, refresh rotation/reuse, authorization, and audit writes.

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

1. **Completed:** repository plan, npm workspace, integer-paise utility and tests, development environment template, README, optional Docker Compose, and initial CI.
2. **Completed:** NestJS API starter, `GET /api/health`, startup validation, and API build/typecheck/test scripts. GitHub Actions passed for the merged increment.
3. **Completed:** initial PostgreSQL tenant schema, forced RLS policies, transaction-local tenant context helper, and PostgreSQL-backed RLS integration test. GitHub Actions passed migration, RLS integration, typecheck, build, and tests.
4. **In progress:** database connection/configuration module, active-membership tenant resolution, transaction-aware audit service, and unit tests. Await the dedicated CI run before claiming this increment verified.
5. **Next:** implement authentication foundations (password hashing, session/refresh-token storage and rotation, CSRF, and sign-in flows) plus authorization guards before accounting workflows.

## Acceptance gates

- A feature is not marked complete merely because source files exist.
- Accounting posting acceptance: a posted invoice creates balanced journal lines in one database transaction; failed posting leaves no partial state.
- Reconciliation acceptance: matches below the configured threshold remain suggestions and never post automatically.
- Reminder acceptance: reminders execute from the server scheduler while the web app is closed, with idempotency and test coverage.
- Security acceptance: tenant isolation is tested against the database, not inferred from service filters alone.
- Release acceptance: migrations, seed, docs, environment template, Docker setup, CI, and demo scripts are present; all claimed checks have actual recorded results.

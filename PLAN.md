# LedgerLoop Implementation Plan

## Repository baseline

- Repository: `naveeth06/LedgerLoop`
- Default branch: `main`
- Inspection date: 2026-10-15
- Observed state: GitHub repository metadata is accessible, but the repository reports size 0 and the Contents API returns 404 with "This repository is empty."
- Consequence: there is no existing source code, dependency manifest, migration history, CI, or test suite to preserve or baseline. This is a greenfield implementation, not a refactor.
- Verification limitation: the current session can read and write repository content through GitHub, but has no working local clone/runtime and direct Git network access failed. Code execution, database integration, browser tests, and CI results must not be described as passing until actually run in an execution environment.

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
- PostgreSQL with migrations and `pgvector`; Redis/BullMQ; S3-compatible object storage.
- Claude integration isolated behind a server-side provider adapter, structured JSON parsing/schema validation, company quotas, and approval workflows.

## Phased delivery

### Phase 0 — Repository foundation
- [x] Inspect repository metadata and root contents.
- [x] Record baseline and implementation plan.
- [x] Establish initial npm workspace conventions and API startup environment validation. Formatting/linting configuration remains pending.
- [x] Add Docker Compose for PostgreSQL (including pgvector), Redis, and local S3-compatible storage.
- [x] Add starter CI workflow for type-checking, API build, and unit tests. Lint, API integration tests, and Playwright e2e remain pending.
- [x] Add setup README and a development environment template. Validate and finalize the full variable inventory as services are implemented.

### Phase 1 — Tenant and identity foundation
- [ ] Initial PostgreSQL migrations, extensions, company/user/membership/branch schema.
- [ ] Company-scoped RLS policies and transaction-scoped tenant context.
- [ ] Argon2 password hashing, email/password sign-in, Google sign-in adapter, rotating refresh tokens in HttpOnly cookies, CSRF, rate limits.
- [ ] RBAC permission guard on every protected route; input validation and audit log.
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

1. **Completed — initial repository foundation:** plan, npm workspace, integer-paise utility and tests, Docker Compose dependencies, `.env.example`, README, and starter CI.
2. **In progress — API foundation:** NestJS app module, health endpoint, startup environment validation, API build/typecheck/test scripts. Verify via GitHub Actions before marking this increment complete.
3. **Next — tenant/database foundation:** add migration tooling and initial users, companies, memberships, branches, and audit schema; implement transaction-scoped tenant context and PostgreSQL RLS policies with integration tests.

Keep accounting and authentication claims out of scope until their database and runtime tests exist.

## Acceptance gates

- A feature is not marked complete merely because source files exist.
- Accounting posting acceptance: a posted invoice creates balanced journal lines in one database transaction; failed posting leaves no partial state.
- Reconciliation acceptance: matches below the configured threshold remain suggestions and never post automatically.
- Reminder acceptance: reminders execute from the server scheduler while the web app is closed, with idempotency and test coverage.
- Security acceptance: tenant isolation is tested against the database, not inferred from service filters alone.
- Release acceptance: migrations, seed, docs, environment template, Docker setup, CI, and demo scripts are present; all claimed checks have actual recorded results.

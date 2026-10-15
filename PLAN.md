# LedgerLoop Implementation Plan

## Repository baseline

- Repository: `naveeth06/LedgerLoop`
- Default branch: `main`
- Inspection date: 2026-10-16
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

## Phase 3 — Sales and purchases
- [x] Sales quotations and sales invoice draft schemas with tenant-scoped lines, automatic numbering, GST totals and audit events.
- [x] Invoice issue/posting to receivables, sales and output GST with weighted-average inventory COGS for tracked goods.
- [x] Customer receipts, automatic receipt numbering, bank/cash account selection, atomic receipt posting, multi-invoice/partial allocation, outstanding balance checks, forced RLS, immutability and audit events.
- [x] Purchase orders and bills with supplier validation, GST-aware deterministic totals, automatic numbering, tenant-scoped lines, draft audit events, forced RLS and bill immutability.
- [x] Purchase bill posting to payables, inventory asset for tracked goods, purchase expense for non-inventory lines and input GST with atomic balanced journal posting.
- [x] Supplier payments with automatic numbering, supplier-to-bill allocation, outstanding balance checks, atomic payable/bank journal posting, forced RLS, immutability and audit events.
- [ ] Expenses and debit notes.
- [ ] Invoice-to-payment demo and Playwright e2e.
- [x] GST-aware sales numbering, validation and audit trail foundation.

## Phase 4 — Banking and reporting
- [x] Tenant-scoped bank accounts and statement imports with duplicate external-id protection.
- [x] Bank reconciliation against posted journal lines with tenant-safe matching and immutable reconciled state.
- [x] Deterministic reconciliation confidence bands; low-confidence matches remain explicit user-approved suggestions and never auto-post.
- [ ] Secure statement import with size/type limits and scanning.
- [x] Trial balance from posted journal entries with tenant-scoped as-of-date reporting and deterministic paise balances.
- [x] Profit & Loss and Balance Sheet from posted journal entries with deterministic date boundaries and paise balances.
- [x] Receivables ageing and GST summary from posted journals.
- [x] Inventory valuation and stock-value reporting from tenant-scoped weighted-average balances.
- [ ] Statement-import demo and Playwright e2e.

## Phase 5 — Reminders and AI
- [ ] BullMQ overdue reminders with retries, idempotency and audit.
- [ ] Claude-backed categorisation scoped to current-company ledger candidates.
- [ ] Receipt extraction/reconciliation suggestions with validation and human approval.
- [ ] Quotas, prompt-injection defense, redaction and AI audit metadata.
- [ ] Tests for isolation, malformed output, quotas, approval and confidence thresholds.

## Phase 6 — Hardening
- [ ] WCAG 2.2 AA and keyboard/screen-reader review.
- [ ] Responsive checks at 640/1024/1440px; loading/empty/error/offline states and Ctrl+K.
- [ ] OpenAPI, seed data, Dockerfiles, docs, CI and demo scripts.
- [ ] Run lint, unit, API integration and Playwright suites in a real runtime.

## Implementation increments

1–14. **Completed:** foundation, auth, tenant RLS, company/branch context, chart of accounts, company settings/GST, parties, items/warehouses, journal posting and opening balances/inventory.
15. **Completed:** sales quotation/invoice draft foundation, deterministic GST engine, automatic numbering, tenant-scoped lines, invoice immutability guard and audit events.
16. **Completed:** sales invoice issue workflow with tenant-configured receivables, revenue and output GST accounts; balanced atomic journal posting and audit events. Inventory deduction was intentionally deferred.
17. **Completed:** customer receipts, automatic receipt numbering, bank/cash account selection, atomic receipt journal posting, multi-invoice/partial receivable allocation, outstanding balance checks, forced RLS, immutability and audit events.
18. **Completed:** purchase orders and purchase bills with supplier validation, GST-aware deterministic totals, automatic numbering, tenant-scoped lines, draft audit events, forced RLS and bill immutability.
19. **Completed:** purchase bill posting to payables, purchase expense and input GST with tenant-configured accounts, atomic journal posting and audit events.
20. **Completed:** supplier payments with automatic numbering, supplier-to-bill allocation, outstanding balance checks, atomic payable/bank journal posting, forced RLS, immutability and audit events.
21. **Completed:** inventory movement foundation with tenant-scoped immutable movement records and accounting linkage.
22. **Completed:** tenant-scoped bank accounts and statement import batches/transactions with external-id deduplication.
23. **Completed:** bank statement reconciliation against posted journal lines, tenant-safe composite matching, one-match-per-journal-line protection, audit events and reconciled immutability.
24. **Completed:** reconciliation hardening with transaction update timestamps and deterministic confidence bands for user-facing suggestions; no low-confidence auto-posting.
25. **Completed:** reporting foundation with tenant-scoped Trial Balance endpoint derived only from posted journal entries and an explicit as-of date.
26. **Completed:** Profit & Loss and Balance Sheet endpoints derived from posted journal entries with deterministic period/as-of boundaries and integer-paise balances.
27. **Completed:** receivables ageing with posted receipt allocation cut-off and deterministic ageing buckets; GST summary for posted sales invoices and purchase bills with CGST/SGST/IGST totals and net GST payable.
28. **In progress:** weighted-average inventory valuation balances, default stock warehouse/account configuration, stock valuation reporting, purchase receipt inventory capitalization, and sales COGS/inventory relief in the same atomic posting transaction.

## Acceptance gates

- Never mark work complete merely because source files exist.
- Posting: balanced journal lines and voucher in one transaction; failed posting leaves no partial state.
- Inventory: tracked goods use weighted-average cost, never permit negative stock, and inventory movement plus journal posting commit atomically.
- Reconciliation: low-confidence matches remain suggestions.
- Reports: derive balances from posted journals, respect tenant RLS, use integer paise and deterministic date boundaries.
- Reminders: server-side scheduling, idempotency and tests.
- Tenant isolation is tested against PostgreSQL, not inferred from service filters.
- Report only checks that actually ran.

# LedgerLoop Application Plan

## Purpose
LedgerLoop is a multi-tenant accounting application for Indian businesses. The web application exposes accounting APIs through coherent browser workflows while preserving tenant isolation, auditability, integer-paise money, balanced journals, and immutable posted accounting history.

## Implemented foundation

### Platform and identity
- Angular standalone web application with responsive dark application shell.
- NestJS/Express API, PostgreSQL 16, Redis/BullMQ infrastructure.
- Company/membership context, authorization guards, tenant-scoped audit logging, validation, CSRF/origin, CORS and throttling foundations.
- Global Angular bearer-token attachment for authenticated API requests.

### Accounting
- Chart of Accounts, opening balances and opening inventory.
- Deterministic CGST/SGST/IGST calculation and integer-paise rounding.
- Balanced journal entries, atomic posting, posted-entry immutability and reversal workflow.
- Tenant-boundary and accounting-integrity tests.

### Master data
- Customers, suppliers and combined parties.
- GST/contact/address party data and credit limits.
- Items/services, HSN/SAC, GST rates, prices and inventory tracking.
- Warehouses.

### Sales
- Sales invoice creation, numbering, GST totals and posting.
- Customer receipts with bank/cash selection and partial/multi-invoice allocation.
- Outstanding-balance validation and receipt immutability.

### Purchases
- Purchase-order API foundation.
- Purchase bills, deterministic GST, payables posting, inventory capitalization/expense posting and input GST.
- Supplier payments with partial/multi-bill allocation and explicit bank/cash posting.
- Supplier debit-note and expense API foundations.

### Inventory
- Immutable inventory movements and weighted-average valuation.
- Warehouse/account configuration.
- Purchase capitalization and sales COGS/inventory relief.
- Tenant-scoped stock adjustments and reversal-safe corrections.
- Responsive inventory tables, tabs, forms and action controls.

### Banking and reconciliation
- Tenant-scoped bank accounts and statement imports.
- External-ID duplicate protection and secure JSON import validation.
- Reconciliation suggestions, confidence bands and explicit user-approved matching.
- One-match-per-journal-line protection and immutable reconciled state.

### Reporting
- Trial Balance, Profit & Loss, Balance Sheet, receivables/payables ageing, GST summary and inventory valuation.
- Dashboard KPIs/charts and financial period filtering.
- Report-specific data-backed visual comparisons and accounting-flow explanations.

### Reminders and email
- Overdue reminder settings and idempotent events.
- BullMQ scheduling and tenant-scoped delivery records.
- Party reminder opt-out.
- Provider-neutral email delivery abstraction with retry/backoff and audit metadata.

### Web application
- Dashboard, Chart of Accounts, Customers & Suppliers, Items & Warehouses.
- Sales Invoices and Sales Receipts.
- Purchase Bills and Supplier Payments.
- Banking & Reconciliation.
- Inventory and Reports workspaces.
- Reminders workspace with policy controls, overdue event monitoring, acknowledgement and delivery-status monitoring.
- Shared GSAP motion system with route transitions, ScrollTrigger reveals, micro-interactions, reduced-motion handling and lifecycle cleanup.

## Current application plan

1. **Chart of Accounts — implemented**
2. **Parties — implemented foundation**
3. **Items & Warehouses — implemented foundation**
4. **Sales — implemented foundation**
   - Invoices and receipts with partial/multi-invoice allocation.
5. **Purchases — implemented foundation**
   - Bills and supplier payments with explicit posting.
6. **Frontend motion — implemented foundation**
7. **Banking — implemented foundation**
8. **Inventory — implemented foundation**
9. **Reports — implemented foundation**
10. **Supplier payments — implemented**
11. **Reminders — implemented foundation**
   - Reminder policy settings.
   - Overdue event browser and acknowledgement.
   - Delivery status summary.
   - Provider-neutral monitoring only; no invented provider integration.

## Next priorities

12. **Sales completion**
   - Invoice detail/view workflow backed by existing APIs.
   - Sales posting-account setup UX where configuration is required.
   - Remaining sales document workflows.
13. **Purchase completion**
   - Purchase-order browser/create workflow using the existing API foundation.
   - Supplier payment history/detail workflow.
   - Remaining supplier adjustment workflows.
14. **Application hardening**
   - Consistent loading, empty, error and offline states.
   - Responsive validation at 640/1024/1440px.
   - Keyboard and screen-reader review.
   - Ctrl+K/application command experience.
   - End-to-end browser coverage.
   - Motion regression testing across supported breakpoints and reduced-motion settings.

## Future plans

### Security and compliance
- Email verification.
- Password reset.
- Optional Google sign-in if product scope requires it.
- Distributed rate limiting and security monitoring.
- Full authentication integration coverage.
- WCAG 2.2 AA review.

### AI capabilities
AI remains advisory rather than authoritative:
- Transaction categorisation suggestions.
- Receipt extraction and reconciliation suggestions.
- Explicit validation and human approval before accounting mutation.
- Prompt-injection defenses, sensitive-data redaction, quotas, confidence thresholds and AI audit metadata.

### Provider-specific integrations
Provider-specific email webhooks/bounce handling will only be implemented after a provider/API is explicitly selected. The existing provider-neutral foundation must not be replaced with an invented external contract.

### Release readiness
- Final environment validation.
- Lockfile/linting policy.
- Seed/demo tooling where appropriate.
- Docker/deployment artifacts when requirements are finalized.
- OpenAPI documentation.
- Full CI, API integration and Playwright coverage.
- Production operational documentation.

## Engineering rules
- CI is the source of truth; never claim a check passed unless CI reports it passed.
- Build one focused increment per PR.
- Preserve forced RLS and tenant transaction context.
- Never bypass accounting constraints or manually alter migration history.
- Store money as integer paise.
- Post vouchers atomically.
- Posted accounting documents remain immutable; corrections use explicit reversals.
- Never fabricate dashboard/report metrics in the frontend.
- AI output is untrusted until explicitly approved.
- Avoid unselected external providers/APIs.
- Motion is presentation-only and must not change accounting state.
- Respect reduced motion and clean up GSAP contexts, ScrollTriggers, observers and listeners.

## Definition of application completeness
A normal browser workflow should be possible end-to-end:

**Company setup → Masters → Quote/Order → Invoice/Bill → Posting → Receipt/Payment → Bank reconciliation → Inventory → Reports → Reminders**

with tenant isolation, auditability, accounting integrity, responsive UX, accessible motion and automated verification preserved throughout.

# LedgerLoop Application Plan

## Purpose
LedgerLoop is a multi-tenant accounting application for Indian businesses. The web application exposes the accounting APIs through coherent browser workflows while preserving tenant isolation, auditability, integer-paise money, balanced journals, and immutable posted accounting history.

## Implemented foundation

### Platform
- Angular standalone web application.
- NestJS/Express API.
- PostgreSQL 16 with forced RLS and tenant transaction context.
- Redis/BullMQ worker infrastructure.
- Shared TypeScript contracts/utilities.
- CI verification for migrations, typechecking, builds, and tests.

### Identity and tenancy
- Registration/sign-in and refresh-session rotation.
- Company and membership context.
- Company roles and authorization guards.
- Branch/company APIs.
- Tenant-scoped audit logging.
- CSRF/origin, CORS, throttling, and validation foundations.
- Global Angular bearer-token attachment for authenticated API requests.

### Accounting
- Chart of Accounts and account creation.
- Opening balances and opening inventory.
- Deterministic CGST/SGST/IGST calculation and integer-paise rounding.
- Balanced journal entries and atomic posting.
- Posted journal immutability and reversal workflow.
- Tenant-boundary and accounting-integrity tests.

### Master data
- Customers, suppliers, and combined parties.
- GST/contact/address party data and credit limits.
- Items/services, HSN/SAC, GST rates, prices, and inventory tracking.
- Warehouses.

### Sales
- Sales invoice creation, numbering, GST totals, and posting.
- Customer receipts.
- Bank/cash account selection.
- Partial and multi-invoice allocation.
- Outstanding-balance validation and receipt immutability.

### Purchases
- Purchase orders.
- Purchase bills and deterministic GST totals.
- Payables posting.
- Inventory capitalization and expense posting.
- Input GST.
- Supplier payments and allocation.
- Supplier debit notes and expense workflows.

### Inventory
- Consistent inventory action, tab, search, and form-control styling with keyboard-visible focus states.
- Immutable inventory movements.
- Weighted-average valuation.
- Stock warehouse/account configuration.
- Purchase capitalization and sales COGS/inventory relief.
- Tenant-scoped adjustments and reversal-safe corrections.

### Banking and reconciliation
- Tenant-scoped bank accounts.
- Statement import batches and transactions.
- External-ID duplicate protection.
- Secure JSON statement import validation.
- Reconciliation suggestions against posted journal lines.
- User-approved reconciliation with account, amount, and date-window checks.
- One-match-per-journal-line protection.
- Immutable reconciled state and confidence bands.
- Low-confidence suggestions are never auto-posted.

### Reporting
- Trial Balance.
- Profit & Loss.
- Balance Sheet.
- Receivables/payables ageing.
- GST summary.
- Inventory valuation.
- Dashboard KPIs/charts and financial period filtering.

### Reminders and email
- Overdue reminder settings and idempotent events.
- BullMQ scheduling.
- Tenant-scoped delivery records.
- Party reminder opt-out.
- SMTP/provider-neutral delivery abstraction with retry/backoff and audit metadata.

### Web application
- Responsive dark LedgerLoop application shell.
- Live Dashboard.
- Chart of Accounts.
- Customers & Suppliers.
- Items & Warehouses.
- Sales Invoices.
- Sales Receipts.
- Purchase Bills.
- Banking & Reconciliation workspace.
- Inventory workspace with responsive valuation tables, movements, stock adjustments, reversal, and posting-account configuration.
- Reports workspace with Trial Balance, Profit & Loss, Balance Sheet, Receivables ageing, GST summary, and Inventory valuation, plus data-backed visual comparisons and accounting-flow explanations.
- Shared GSAP motion system with route transitions, ScrollTrigger reveals, table-row stagger motion, dialog entrance motion, micro-interactions, restrained background parallax, reduced-motion handling, and lifecycle cleanup.

## Current application plan

1. **Chart of Accounts — implemented**
   - Live list, filtering, account creation, validation, and conflict handling.
2. **Parties — implemented foundation**
   - Customer/supplier directory and creation workflow.
3. **Items & Warehouses — implemented foundation**
   - Item/service and warehouse management.
4. **Sales — implemented foundation**
   - Invoices and customer receipts, including partial/multi-invoice allocation.
5. **Purchases — implemented foundation**
   - Supplier bills and purchase posting configuration.
6. **Frontend motion — implemented foundation**
   - Centralized GSAP motion architecture across the authenticated application.
7. **Banking — implemented foundation**
   - Bank account connection, JSON statement import, transaction listing, suggestion review, and user-approved matching.
8. **Inventory — UI refinement**
   - Improve table readability, responsive behavior, modal scrolling, and focus visibility without changing inventory API or accounting behavior.
9. **Reports — visual explanations**
   - Add data-backed comparison charts and report-specific accounting-flow diagrams to explain existing reports.

## Next priorities

10. **Purchase completion**
    - Purchase orders.
    - Supplier payment workspace.
    - Remaining supplier adjustment workflows.
11. **Sales completion**
    - Invoice detail/edit workflow.
    - Remaining sales document workflows.
    - Sales posting-account setup UX where configuration is required.
12. **Reminders workspace**
    - Reminder settings.
    - Overdue events.
    - Email delivery status.
    - Acknowledgement and monitoring.
13. **Application hardening**
    - Consistent loading, empty, error, and offline states.
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
- Prompt-injection defenses, sensitive-data redaction, quotas, confidence thresholds, and AI audit metadata.

### Provider-specific integrations
Provider-specific email webhooks/bounce handling will only be implemented after the provider/API is explicitly selected. The existing provider-neutral foundation must not be replaced with an invented external contract.

### Release readiness
- Final environment validation.
- Lockfile/linting policy.
- Seed/demo tooling where appropriate.
- Docker/deployment artifacts when requirements are finalized.
- OpenAPI documentation.
- Full CI, API integration, and Playwright coverage.
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
- Respect reduced motion and clean up GSAP contexts, ScrollTriggers, observers, and listeners.

## Definition of application completeness
A normal browser workflow should be possible end-to-end:

**Company setup → Masters → Quote/Order → Invoice/Bill → Posting → Receipt/Payment → Bank reconciliation → Inventory → Reports → Reminders**

with tenant isolation, auditability, accounting integrity, responsive UX, accessible motion, and automated verification preserved throughout.

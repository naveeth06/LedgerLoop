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
- Tenant-scoped audit logging.
- Global Angular bearer-token attachment for authenticated API requests.

### Accounting and master data
- Chart of Accounts, opening balances, opening inventory, balanced journals, atomic posting, reversals, and posted-history immutability.
- Deterministic CGST/SGST/IGST calculation and integer-paise rounding.
- Customers, suppliers, GST/contact/address data, items/services, HSN/SAC, GST rates, prices, inventory tracking, and warehouses.

### Sales and purchases
- Sales invoices and customer receipts, including partial/multi-invoice allocation.
- Purchase bills, posting configuration, payables, inventory capitalization/expense posting, input GST, and supplier payment foundation.

### Banking and inventory
- Tenant-scoped bank accounts, statement imports, duplicate protection, reconciliation suggestions, and user-approved matching.
- Immutable inventory movements, weighted-average valuation, stock warehouse/account configuration, purchase capitalization, sales COGS/inventory relief, controlled adjustments, and reversal-safe corrections.

### Reporting
- Trial Balance.
- Profit & Loss.
- Balance Sheet.
- Receivables ageing.
- GST summary.
- Inventory valuation.
- Existing dashboard KPIs/charts and financial period filtering.

### Web application
- Responsive dark LedgerLoop application shell.
- Live Dashboard.
- Chart of Accounts.
- Customers & Suppliers.
- Items & Warehouses.
- Sales Invoices and Sales Receipts.
- Purchase Bills.
- Banking & Reconciliation.
- Inventory workspace with valuation, movements, adjustments, reversal, and posting-account configuration.
- Reports workspace with live Trial Balance, P&L, Balance Sheet, Receivables ageing, GST, and Inventory valuation views.
- Shared GSAP motion system with route transitions, ScrollTrigger reveals, micro-interactions, reduced-motion handling, and lifecycle cleanup.

## Current application plan

1. **Chart of Accounts — implemented**
2. **Parties — implemented foundation**
3. **Items & Warehouses — implemented foundation**
4. **Sales — implemented foundation**
5. **Purchases — implemented foundation**
6. **Frontend motion — implemented foundation**
7. **Banking — implemented foundation**
8. **Inventory — implemented foundation**
9. **Reports — implemented foundation**
   - Live Trial Balance, Profit & Loss, Balance Sheet, Receivables ageing, GST summary, and Inventory valuation.

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
AI remains advisory rather than authoritative: transaction categorisation suggestions, receipt extraction/reconciliation suggestions, explicit human approval, prompt-injection defenses, sensitive-data redaction, quotas, confidence thresholds, and AI audit metadata.

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

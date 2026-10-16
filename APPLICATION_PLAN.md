# LedgerLoop Application Plan

## 1. Purpose

LedgerLoop is a multi-tenant accounting application for Indian businesses. The application is being built as a real accounting workflow rather than a dashboard-only product: users should be able to configure a company, maintain accounting masters, create business documents, post balanced journals, reconcile banking activity, review reports, and manage reminders from the web application.

Money is represented as integer paise. Company-owned resources are protected by PostgreSQL forced RLS and tenant transaction context. Posted accounting history is immutable and corrected through explicit reversal workflows.

---

## 2. Implemented foundation

### Platform and architecture
- npm workspace monorepo.
- Angular standalone web application in `apps/web`.
- NestJS/Express API in `apps/api`.
- Worker application in `apps/worker` for scheduled/background processing.
- PostgreSQL accounting datastore with tenant isolation and RLS.
- Redis/BullMQ worker infrastructure.
- Shared contracts/utilities under `packages/types`.
- CI verification for migrations, typechecking, builds, and tests.

### Identity and tenancy
- User registration and sign-in.
- Refresh-session rotation/replay protection.
- Argon2id password hashing.
- Access-token authentication and authorization guards.
- Company creation and company membership context.
- Company roles including owner, admin, accountant, staff, and viewer.
- Branch APIs.
- Tenant-scoped company directory.
- Audit logging.
- CSRF/origin protection, CORS, throttling, and validation foundations.

### Accounting core
- Tenant-scoped chart of accounts API.
- Account creation with account code, type, optional parent, description, and audit event.
- Company settings and GST registration APIs.
- Customer/supplier/both party directory.
- GST/contact/address party data.
- Integer-paise credit limits.
- Item and warehouse directories.
- HSN/SAC and GST-rate metadata.
- Inventory flags, prices, and optional branch assignment.
- Opening trial-balance posting.
- Opening inventory snapshots.
- Deterministic CGST/SGST/IGST calculations.
- Integer-paise half-up GST rounding.
- Balanced journal-entry and journal-line model.
- Atomic posting with database balance enforcement.
- Posted journal and opening-inventory immutability.
- Explicit posted-journal reversal workflow.
- Tenant-boundary and accounting-integrity tests.

### Sales
- Sales quotation and invoice draft foundation.
- Tenant-scoped invoice lines.
- Automatic invoice numbering.
- Deterministic GST totals.
- Invoice issue/posting to receivables, revenue, and output GST.
- Customer receipts.
- Automatic receipt numbering.
- Bank/cash account selection.
- Partial and multi-invoice receipt allocation.
- Outstanding-balance validation.
- Receipt immutability and audit events.

### Purchases
- Purchase orders.
- Purchase bills with supplier validation.
- GST-aware deterministic bill totals.
- Purchase bill posting to payables.
- Inventory capitalization for tracked goods.
- Purchase expense posting for non-inventory lines.
- Input GST posting.
- Supplier payments with bill allocation.
- Payable outstanding protection.
- Supplier payment immutability and audit events.
- Supplier debit notes and expense workflows.

### Inventory
- Tenant-scoped immutable inventory movement records.
- Accounting linkage for inventory movements.
- Weighted-average inventory valuation.
- Default stock warehouse/account configuration.
- Purchase receipt inventory capitalization.
- Sales COGS and inventory relief.
- Tenant-scoped inventory adjustments.
- Posted adjustment immutability.
- Reversal-safe inventory corrections.

### Banking and reconciliation
- Tenant-scoped bank accounts.
- Statement import batches and transactions.
- External-ID duplicate protection.
- Secure JSON statement import with a 5 MB request cap.
- Explicit JSON content-type validation.
- Control-character scanning.
- Bank reconciliation against posted journal lines.
- Tenant-safe reconciliation matching.
- One-match-per-journal-line protection.
- Immutable reconciled state.
- Deterministic reconciliation confidence bands.
- Low-confidence matches remain user-approved suggestions and are never auto-posted.

### Reporting
- Trial Balance.
- Profit & Loss.
- Balance Sheet.
- Receivables ageing.
- Payables ageing.
- GST summary.
- Inventory valuation.
- Dashboard reporting API.
- Dashboard KPIs and chart datasets.
- Functional financial-year/quarter/month dashboard period filter.
- Authenticated Angular dashboard consuming live API data.

### Reminders and email delivery
- Tenant-scoped overdue reminder settings.
- Idempotent overdue reminder event generation.
- BullMQ hourly scheduling.
- Reminder acknowledgement APIs.
- Tenant-scoped email delivery records.
- Party reminder opt-out.
- SMTP provider abstraction.
- Retry/backoff for failed delivery.
- Deterministic message IDs.
- Delivery audit events.
- Provider-independent delivery monitoring summary.
- Provider-neutral richer reminder templates with validation and escaping.

### Web application foundation
- Angular standalone application shell.
- Responsive dark LedgerLoop design system.
- Authenticated browser workflow.
- Company workspace context.
- Protected dashboard route.
- Dashboard connected to live accounting reporting.
- Chart of Accounts web page.
- Customers & Suppliers web page.
- Items & Warehouses web page.
- Sales Invoices web page with live invoice listing, customer/item selection, multi-line draft creation, and issue/post action.
- Sales Receipts web page with customer selection, outstanding-invoice loading, partial/multi-invoice allocation, receipt posting, and accounting-state feedback.
- Purchases Bills web page with supplier selection, multi-line bill creation, GST-aware integer-paise conversion, posting-account configuration, and bill posting.
- Shared GSAP motion system with route transitions, ScrollTrigger page/section reveals, table-row stagger reveals, dialog entrance motion, navigation/button micro-interactions, and restrained background parallax.
- Motion respects `prefers-reduced-motion` and keeps animation lifecycle scoped and cleaned up between routes.

---

## 3. Current application plan

The backend already contains the majority of the accounting domain capabilities. The current priority is to expose those capabilities through a complete, coherent web application instead of continuing to populate the dashboard with manually-created demonstration transactions.

### Current priority order

1. **Chart of Accounts — implemented**
   - Live account list.
   - Search and account-type filtering.
   - System/custom and active/inactive indicators.
   - Parent-account display.
   - Authorized account creation.
   - Validation and conflict handling.

2. **Parties — implemented foundation**
   - Customer and supplier list.
   - Create party flow.
   - GSTIN and contact information.
   - Credit limits.
   - Customer/supplier classification.
   - Reminder toggle presentation.

3. **Items and warehouses — implemented foundation**
   - Item/service list and creation form.
   - HSN/SAC and GST configuration.
   - Prices and inventory tracking.
   - Warehouse management.
   - Validation aligned with the API contract.

4. **Sales workspace — implemented foundation**
   - Invoice list.
   - Customer and active-item selection.
   - Multi-line invoice draft creation.
   - GST rate and integer-paise price conversion.
   - Due date, place-of-supply, and notes capture.
   - Draft invoice creation through the existing tenant-scoped API.
   - Invoice issue/post workflow through the existing accounting API.
   - Customer receipt creation and posting.
   - Outstanding-invoice loading by customer.
   - Partial and multi-invoice allocation.
   - Unallocated customer-advance handling.
   - Clear accounting-state and posting feedback.

5. **Purchases workspace — implemented foundation**
   - Supplier bill list.
   - Multi-line purchase bill creation.
   - Supplier invoice number, due date, notes, and state-code capture.
   - GST rate and integer-paise conversion.
   - Purchase posting-account configuration.
   - Draft bill creation through the existing tenant-scoped API.
   - Purchase bill posting through the existing accounting API.
   - Clear draft/received and posting feedback.

6. **Frontend motion system — implemented foundation**
   - Shared GSAP dependency and motion service.
   - Route enter/leave transitions integrated with Angular Router lifecycle.
   - ScrollTrigger reveals for semantic content blocks and accounting tables.
   - Shared button, icon-button, action, and navigation micro-interactions.
   - Dynamic dialog entrance animation.
   - Reduced-motion accessibility handling.
   - Documented animation architecture and cleanup rules.

7. **Banking workspace — next**
   - Bank account management.
   - Statement imports.
   - Reconciliation suggestions.
   - User-approved reconciliation.

8. **Inventory workspace**
   - Warehouses.
   - Stock movements.
   - Inventory adjustments.
   - Valuation views.

9. **Reports workspace**
   - Trial Balance.
   - Profit & Loss.
   - Balance Sheet.
   - Receivables/payables ageing.
   - GST summary.
   - Inventory valuation.

10. **Reminders workspace**
   - Reminder settings.
   - Overdue events.
   - Email delivery status.
   - Acknowledgement and monitoring.

11. **Application hardening**
    - Consistent loading, empty, error, and offline states.
    - Responsive checks at 640/1024/1440px.
    - Keyboard and screen-reader review.
    - Ctrl+K/application command experience.
    - End-to-end browser coverage.
    - Motion regression review across supported breakpoints and reduced-motion settings.

---

## 4. Future plans

### Near-term
- Complete invoice detail/editing and remaining sales document workflows.
- Complete the remaining master-data CRUD workflows supported by the API.
- Connect all existing accounting APIs to the Angular application.
- Add purchase order and supplier payment workflows.
- Add bank statement import and reconciliation screens.
- Add inventory movement and adjustment screens.
- Add reusable tables, filters, forms, drawers/dialogs, status badges, and confirmation patterns.
- Add focused web unit/component tests for critical accounting interactions.
- Add Playwright coverage for invoice-to-payment and statement-import workflows.

### Security and compliance hardening
- Email verification.
- Password reset.
- Google sign-in if required by product scope.
- Distributed rate limiting.
- Security monitoring.
- Full authentication integration coverage.
- WCAG 2.2 AA review.
- Keyboard and screen-reader validation.

### AI capabilities
AI features will remain advisory rather than authoritative:
- Claude-backed transaction categorisation suggestions.
- Receipt extraction and reconciliation suggestions.
- Validation and human approval before any accounting mutation.
- Prompt-injection defenses.
- Sensitive-data redaction.
- Quotas and confidence thresholds.
- AI-specific audit metadata.

### Provider-specific integrations
Provider-specific email bounce/webhook handling will only be implemented after the intended provider/API is explicitly selected and documented. The current SMTP/provider-neutral foundation must not be replaced with an invented provider contract.

### Release readiness
- Final environment validation.
- Linting and lockfile policy.
- Seed/demo data tooling where appropriate.
- Dockerfiles when deployment requirements are finalized.
- OpenAPI documentation.
- Complete CI coverage.
- Full API integration suite.
- Full Playwright suite.
- Production deployment and operational documentation.

---

## 5. Engineering rules for future increments

- Treat the repository and CI as the source of truth.
- Build one focused increment per PR.
- Do not mark work complete merely because source files exist.
- Verify migrations, typecheck, build, unit tests, and integration tests through CI where applicable.
- Do not claim checks passed unless the corresponding CI run actually passed.
- Preserve PostgreSQL forced RLS and tenant transaction context.
- Never bypass accounting constraints by manually editing migration history.
- Store monetary values as integer paise.
- Post vouchers and journal lines atomically.
- Posted accounting documents remain immutable; corrections use explicit reversals.
- Never fabricate dashboard or report metrics in the frontend.
- AI output remains an untrusted suggestion until explicitly approved by an authorized user.
- Avoid introducing external providers or APIs that have not been selected by the project.
- Keep shared UI motion presentation-only; animations must never alter accounting state or business rules.
- Respect reduced-motion preferences and clean up GSAP contexts/ScrollTriggers when routes change.

---

## 6. Definition of application completeness

LedgerLoop should be considered application-complete only when a user can move through the normal accounting lifecycle from the browser:

**Company setup → Masters → Quote/Order → Invoice/Bill → Posting → Receipt/Payment → Bank reconciliation → Inventory → Reports → Reminders**

with tenant isolation, auditability, accounting integrity, responsive UX, accessible motion, and automated verification preserved throughout the workflow.

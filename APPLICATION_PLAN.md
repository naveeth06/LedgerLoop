# LedgerLoop — Application Plan

LedgerLoop is an India-focused, GST-aware accounting platform for small businesses and accountants. The application is being built as a secure multi-tenant accounting system with tenant-scoped data access, auditable financial mutations, integer-paise monetary storage, and a progressively richer web workspace.

## Current scope

### Platform foundation
- npm workspaces with NestJS API and Angular web application.
- PostgreSQL 16 with tenant-scoped tables, forced row-level security and transaction-scoped company/user context.
- Audit logging for sensitive tenant mutations.
- Argon2id password hashing, refresh-session rotation and replay-triggered session-family revocation.
- Signed short-lived access tokens, CSRF/origin protections and credentialed CORS.
- GitHub Actions validation for migrations, typecheck, build, unit tests and PostgreSQL integration.

### Accounting foundation
- Company onboarding, memberships and branch directory.
- Chart of Accounts with tenant-scoped custom accounts and protected system accounts.
- GST registrations and party master data.
- Items/services, HSN/SAC, GST rates, prices and inventory tracking.
- Item create, edit and active/inactive status workflow; item codes remain immutable during edits.
- Warehouses with optional branch assignment and active/inactive state.
- Warehouse edit and active/inactive status workflow; warehouse codes remain immutable during edits.
- Journal entries, opening balances and opening inventory snapshots.
- Sales invoices, receipts, purchase bills, supplier payments, inventory movements, bank imports/reconciliation and reminders foundations.

### Web application
- Dashboard, Chart of Accounts, Customers & Suppliers, Items & Warehouses.
- Sales Invoices and Sales Receipts, including invoice detail/view workflow.
- Purchase Bills and Supplier Payments.
- Banking & Reconciliation.
- Inventory and Reports workspaces.
- Reminders workspace with policy controls, overdue event monitoring, acknowledgement and delivery-status monitoring.
- Shared GSAP motion system with route transitions, ScrollTrigger reveals, micro-interactions, reduced-motion handling and lifecycle cleanup.
- Application-wide theme customization with five persistent dual-color palettes and a shared CSS-variable theme system.
- Customer/supplier edit and active/inactive controls.
- Item edit and active/inactive controls.
- Warehouse edit and active/inactive controls; warehouse codes remain immutable and inactive warehouses remain available for historical references.
- Chart of Accounts edit and active/inactive controls for custom accounts; system accounts are visibly protected.

## Current application plan

1. **Chart of Accounts — implemented**
   - Create custom accounts.
   - Edit custom account name, parent and description.
   - Activate/deactivate custom accounts.
   - System accounts remain protected from edits and deactivation.
2. **Parties — implemented**
   - Create, edit and active/inactive status.
3. **Items & Warehouses — implemented**
   - Items: create, edit and active/inactive status.
   - Warehouses: create, edit and active/inactive status; warehouse codes remain immutable.
4. **Sales — implemented foundation**
   - Invoices and receipts with partial/multi-invoice allocation.
   - Invoice detail/view with line-level tax and posting metadata.
5. **Purchases — implemented foundation**
   - Bills and supplier payments with explicit posting.
6. **Frontend motion — implemented foundation**
7. **Application theming — implemented**
   - Five professional dual-color palettes.
   - Runtime switching without reload.
   - Local persistence of the selected palette.
   - Shared theme mapping for existing Tailwind UI colors and data-visualization bars.
8. **Banking — implemented foundation**
9. **Inventory — implemented foundation**
10. **Reports — implemented foundation**
11. **Supplier payments — implemented**
12. **Reminders — implemented foundation**
   - Reminder policy settings.
   - Overdue event browser and acknowledgement.
   - Delivery status summary.
   - Provider-neutral monitoring only; no invented provider integration.

## Next priorities

13. **Master-data completion**
   - Bank-account edit/deactivation.
   - GST registration management UX.
14. **Sales completion**
   - Sales posting-account setup UX where configuration is required.
   - Remaining sales document workflows.
15. **Purchase completion**
   - Purchase-order browser/create workflow using the existing API foundation.
   - Supplier payment history/detail workflow.
   - Remaining supplier adjustment workflows.
16. **Application hardening**
   - Consistent loading, empty, error and offline states.

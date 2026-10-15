# LedgerLoop

LedgerLoop is an India-focused, GST-aware accounting platform for small businesses and accountants.

## Current status

The project is being built incrementally. See [PLAN.md](./PLAN.md) for delivery phases and acceptance criteria.

Implemented foundation:
- npm workspaces, NestJS health endpoint, startup configuration validation, and CI.
- Integer-paise money parser with unit tests.
- PostgreSQL users, companies, memberships, branches, audit log, and forced row-level security.
- Transaction-scoped tenant and authenticated-user context, active-membership checks, and transaction-aware audit writes.
- Argon2id password hashing, hashed refresh-token storage, refresh rotation and replay-triggered session-family revocation.
- Email/password sign-up, sign-in, refresh and logout endpoints with CSRF/origin protections, credentialed CORS, short-lived signed access tokens and throttling.
- Global access-token authorization guard, current-user endpoint, company onboarding, owner/admin branch creation, company directory and branch listing.
- Tenant-scoped chart of accounts with constraints, forced RLS, and audited account creation.
- Company settings update endpoints and tenant-scoped GST registration APIs with GSTIN/state-code constraints and audit events.
- Tenant-scoped party directory with customer/supplier/both classification, GSTIN/contact/address fields, paise credit limits, forced RLS and audited creation.
- Tenant-scoped item and warehouse directories with GST/HSN-SAC metadata, integer-paise prices, inventory tracking flags, optional branch assignment, forced RLS and audit events.
- GitHub Actions checks for migrations, type-checking, build, unit tests and PostgreSQL integration.

Still not implemented: Angular web app, email verification/password reset, Google sign-in, opening balances, deterministic tax calculation, accounting journals and posting, invoice/payment workflows, reporting, reminders, and AI features. This scaffold is not a production accounting system.

## Requirements and local setup

- Node.js 22 or newer and npm
- Git
- PostgreSQL 16 or newer for local database work
- Docker is optional and can be deferred; CI runs PostgreSQL integration checks on GitHub-hosted runners.

Copy `.env.example` to `.env` and replace `AUTH_TOKEN_SECRET` and `CSRF_SECRET` with unique secrets of at least 32 bytes. Configure `WEB_ORIGIN` to the exact browser origin serving the web app. Keep `COOKIE_SECURE=false` for local HTTP development only; production must use HTTPS and Secure cookies. Never commit real secrets.

From the repository root:

```sh
npm install
npm run typecheck
npm run build
npm test
```

Run the API after building:

```sh
node apps/api/dist/main.js
```

The API health endpoint is `http://localhost:3000/api/health`. It currently confirms only that the HTTP process is running; it does not check database connectivity.

## Authentication

All endpoints are under `/api/auth`. Auth mutation requests must include an `Origin` header exactly matching `WEB_ORIGIN`.

- `POST /api/auth/signup` — JSON `{ "email", "password", "displayName" }`; password must be 12–128 characters.
- `POST /api/auth/signin` — JSON `{ "email", "password" }`; returns a short-lived access token and sets refresh/CSRF cookies.
- `POST /api/auth/refresh` — requires the `ll_refresh` HttpOnly cookie plus `ll_csrf` mirrored in `X-CSRF-Token`.
- `POST /api/auth/logout` — requires the same origin and CSRF checks; revokes the current refresh session and clears both cookies.
- `GET /api/auth/me` — returns the authenticated user's public profile.

Cookies use `SameSite=Strict`, are host-only, and are Secure in production. Rate limiting currently uses the NestJS in-process throttler; configure a Redis-backed store before multiple API replicas. Do not expose this scaffold as a production service before the remaining security review and missing features are complete.

## Company, branch and settings APIs

Protected routes require `Authorization: Bearer <accessToken>`. The global guard verifies the signed token; public routes must be explicitly marked with `@Public()`.

- `GET /api/companies` — list companies where the caller has an active membership and return the caller's role.
- `POST /api/companies` — create a company, initial owner membership and audit event atomically.
- `GET /api/companies/:companyId/branches` — list branches after active membership verification.
- `POST /api/companies/:companyId/branches` — create a branch; requires owner/admin membership.
- `GET /api/companies/:companyId/settings` — retrieve company legal/display names and base currency.
- `PATCH /api/companies/:companyId/settings` — update legal/display names; owner/admin only; audited in the same transaction.

## Chart of accounts

- `GET /api/companies/:companyId/accounts` — lists accounts for an active company member.
- `POST /api/companies/:companyId/accounts` — creates an account; requires owner/admin/accountant role. Account types: `asset`, `liability`, `equity`, `income`, `expense`; optional `parentAccountId` and `description`.
- Account codes are unique per company, case-normalized to uppercase, and parent references cannot cross company boundaries.
- Forced RLS scopes records by company. The runtime role can select and insert but cannot update/delete accounts yet.

## GST registrations

- `GET /api/companies/:companyId/gst-registrations` — list registrations for active members.
- `POST /api/companies/:companyId/gst-registrations` — create a registration; owner/admin/accountant only. Supports `gstin`, `legalName`, optional `tradeName`, `registrationType` and `isPrimary`.
- GSTIN format/state-code consistency, per-company GSTIN uniqueness, and one active primary registration per company are enforced.

## Parties

- `GET /api/companies/:companyId/parties` — list parties for an active company member. Optional query filters: `type=customer|supplier|both` and `active=true|false`. The type filter also includes `both` parties.
- `POST /api/companies/:companyId/parties` — create a party; requires owner/admin/accountant role. Fields: `partyCode`, `name`, `partyType` (`customer`, `supplier`, `both`), optional `gstin`, `email`, `phone`, `billingAddress` object, and `creditLimitPaise` as a decimal string.
- Party codes are unique per company and normalized to uppercase. Credit limits are non-negative PostgreSQL BIGINT values passed as decimal strings to avoid JavaScript precision loss.
- Parties are protected by forced RLS. Creation and `COMPANY_PARTY_CREATED` audit event share a transaction. The runtime role has SELECT/INSERT only; update/deactivation workflows are future work.

## Items and warehouses

- `GET /api/companies/:companyId/items` — list items for active members; optional `type=goods|service` and `active=true|false` filters.
- `POST /api/companies/:companyId/items` — create an item; owner/admin/accountant only. Supports `itemCode`, `name`, `itemType`, optional numeric `hsnSac`, `unitCode`, `gstRateBps`, `sellingPricePaise`, `purchasePricePaise` and `trackInventory`.
- GST rates are stored as integer basis points (`1800` = `18.00%`). Prices are decimal strings of integer paise to avoid JavaScript precision loss. Tax calculation and tax splitting are not implemented by this directory API.
- `GET /api/companies/:companyId/warehouses` — list warehouses; optional `active=true|false`.
- `POST /api/companies/:companyId/warehouses` — create a warehouse; owner/admin/accountant only. Supports `warehouseCode`, `name`, optional `branchId` and JSON `address`.
- Item codes and warehouse codes are unique per company. Warehouses can be company-wide or branch-specific; both the API and composite database foreign key prevent cross-company branch assignment. Both tables use forced RLS and creation audit events. The runtime role has SELECT/INSERT only; update/deactivation and opening stock workflows are future work.

## PostgreSQL migrations

Run migrations from the repository root with an administrative development connection:

```sh
npm run db:migrate --workspace @ledgerloop/api
```

Before the first migration, create the restricted role used by the API and RLS integration tests:

```sql
CREATE ROLE ledgerloop_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE ledgerloop_app_login LOGIN PASSWORD 'replace_with_a_local_password'
  IN ROLE ledgerloop_app NOSUPERUSER NOBYPASSRLS;
```

Request-facing code must use transaction helpers and active-membership verification; never trust a company ID from the request as authorization. CI uses temporary PostgreSQL and does not require Docker on your computer.

## Money representation and security

Persisted monetary amounts must be integer paise. The shared `parseRupeesToPaise` helper uses `BigInt` conversion and rejects floats, negative amounts, exponent notation, separators, and more than two fractional digits.

Values in `.env.example` are development placeholders only. Email verification/password reset, Google sign-in, distributed rate limiting, journal posting, file scanning, complete audit coverage, and AI safeguards remain pending. This scaffold is not production-ready.

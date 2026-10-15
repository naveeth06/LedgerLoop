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
- Tenant-scoped chart of accounts with constrained account types, per-company unique account codes, same-company parent account references, forced RLS, and audited account creation.
- GitHub Actions checks for migrations, type-checking, build, unit tests and PostgreSQL integration.

Still not implemented: Angular web app, email verification/password reset, Google sign-in, company settings/GST registrations, parties/items/warehouses, accounting journals and posting, invoice/payment workflows, reporting, reminders, and AI features. This scaffold is not a production accounting system.

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

## Company and branch context

Protected routes require `Authorization: Bearer <accessToken>`. The global guard verifies the signed token; public routes must be explicitly marked with `@Public()`.

- `GET /api/companies` — list companies where the caller has an active membership and return the caller's role.
- `POST /api/companies` — create a company, initial owner membership and audit event atomically.
- `GET /api/companies/:companyId/branches` — list branches after active membership verification.
- `POST /api/companies/:companyId/branches` — create a branch; requires owner/admin membership.

Membership directory lookup uses transaction-local `app.current_user_id` to expose only the authenticated user's own membership rows. Company and branch details still require active membership and transaction-local `app.current_company_id`.

## Chart of accounts

- `GET /api/companies/:companyId/accounts` — lists accounts for an active member of the company.
- `POST /api/companies/:companyId/accounts` — creates an account; requires an active `owner`, `admin`, or `accountant` role. JSON fields: `accountCode`, `name`, `accountType` (one of `asset`, `liability`, `equity`, `income`, `expense`), optional `parentAccountId`, optional `description`.
- Account codes are unique per company (case-normalized to uppercase). A parent account must belong to the same company. Creation and `LEDGER_ACCOUNT_CREATED` audit write share one transaction.
- Accounts are tenant-scoped by forced RLS. The runtime database role can select and insert accounts but cannot update or delete them yet; editing, deactivation, and seeded standard accounts are future increments.

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

Company-owned tables use forced RLS. Request-facing code must use the transaction helpers and active-membership verification; never trust a company ID from the request as authorization. The CI integration test uses a temporary PostgreSQL database and does not require Docker on your computer.

## Money representation

Persisted monetary amounts must be integer paise. The shared `parseRupeesToPaise` helper uses `BigInt` conversion and rejects floats, negative amounts, exponent notation, separators, and more than two fractional digits.

## Security status

Values in `.env.example` are development placeholders only. No production secrets belong in source control. Email verification/password reset, Google sign-in, distributed rate limiting, journal posting, file scanning, complete audit coverage, and AI safeguards remain pending. This scaffold is not production-ready.

# LedgerLoop

LedgerLoop is an India-focused, GST-aware accounting platform for small businesses and accountants.

## Current status

The project is being built incrementally. See [PLAN.md](./PLAN.md) for the baseline, delivery phases, and acceptance criteria.

Implemented foundation:
- npm workspaces for the NestJS API and shared TypeScript utilities.
- API health endpoint at `GET /api/health` and startup validation for runtime configuration.
- Integer-paise money parser with unit tests.
- PostgreSQL users, companies, memberships, branches, and audit-log schema.
- Forced row-level security (RLS) for company-owned tables, transaction-scoped tenant context helper, and PostgreSQL integration tests.
- PostgreSQL connection pool managed by NestJS lifecycle hooks, membership-gated tenant transactions, and transaction-aware audit writes.
- Argon2id password hashing/verification, hashed opaque refresh-token storage, transactional refresh-token rotation, and token-family revocation on replay.
- HTTP endpoints for email/password sign-up, sign-in, refresh, and logout. Refresh tokens are stored as hashes and sent only in HttpOnly cookies; access tokens are short-lived signed tokens.
- Global access-token guard for protected routes, explicit public-route metadata, and company-scoped role checks based on active database membership (never roles copied from client input or trusted from the token).
- Authenticated current-user endpoint and initial company onboarding that creates the company, owner membership, and audit event atomically; owner/admin-only branch creation uses tenant-scoped transactions and audit writes.
- Exact configured-origin checks for auth mutations, double-submit CSRF token checks for refresh/logout, credentialed CORS restricted to `WEB_ORIGIN`, and endpoint throttling.
- GitHub Actions checks for API build, type-checking, unit tests, and PostgreSQL RLS integration.

Still not implemented: Angular web app, email verification/password reset, Google sign-in, business CRUD APIs beyond initial company/branch creation, accounting posting, invoice/payment workflows, reporting, reminders, and AI features. This scaffold is not a production accounting system.

## Requirements and local setup

- Node.js 22 or newer and npm
- Git
- PostgreSQL 16 or newer for local database work
- Docker is optional and can be deferred; CI runs PostgreSQL integration checks on GitHub-hosted runners.

Copy `.env.example` to `.env` and replace `AUTH_TOKEN_SECRET` with a unique random secret of at least 32 bytes. Configure `WEB_ORIGIN` to the exact browser origin serving the web app. Keep `COOKIE_SECURE=false` for local HTTP development only; production must use HTTPS and Secure cookies. Never commit real secrets.

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

## Authentication API

All endpoints are under `/api/auth`. Auth mutation requests must include an `Origin` header exactly matching `WEB_ORIGIN`.

- `POST /api/auth/signup` — JSON `{ "email", "password", "displayName" }`; password must be 12–128 characters. Creates the user and initial refresh session atomically.
- `POST /api/auth/signin` — JSON `{ "email", "password" }`; returns user details and a short-lived `accessToken`, and sets refresh/CSRF cookies.
- `POST /api/auth/refresh` — requires the `ll_refresh` HttpOnly cookie plus the `ll_csrf` cookie mirrored in the `X-CSRF-Token` header. Rotates the refresh token and returns a new access token.
- `POST /api/auth/logout` — requires the same origin and CSRF checks; revokes the current refresh session and clears both cookies.

Cookies use `SameSite=Strict`, are host-only, and are Secure in production. The frontend must send credentials on refresh/logout requests and read the non-HttpOnly `ll_csrf` cookie to populate `X-CSRF-Token`. The access token is returned in JSON and is not placed in a cookie.

Rate limiting currently uses the NestJS in-process throttler. It is useful for a single API instance but is not a shared distributed limit; configure a Redis-backed throttling store before running multiple API replicas. Accounting routes and most business CRUD APIs are not implemented yet; the authorization foundation currently protects the current-user, company onboarding, and branch-creation routes. Do not expose this scaffold as a production service before the remaining authorization, email verification, monitoring, and security review work is completed.

## Protected API and company onboarding

- Protected routes require `Authorization: Bearer <accessToken>`. The global guard verifies the signed token and attaches the verified subject to the request; public routes must be explicitly marked with `@Public()`.
- `GET /api/auth/me` returns the current user's public profile and requires a valid access token.
- `POST /api/companies` requires a valid access token and JSON `{ "legalName", "displayName" }`. Company creation, the initial active `owner` membership, and the `COMPANY_CREATED` audit event run in one transaction with the new company ID as the transaction-local RLS context.
- `POST /api/companies/:companyId/branches` requires a valid access token and an active `owner` or `admin` membership for that company. The route uses company-scoped RLS and records `BRANCH_CREATED` in the same transaction.
- Role checks query the active membership in PostgreSQL. Do not add roles to access-token claims or accept a role supplied by a request body as authorization.

## PostgreSQL migrations

1. Create a local database and set `DATABASE_URL` to an administrative connection for development migrations.
2. Before the first migration, create a restricted group role and a login role that inherits it. Do not use a superuser as the application's runtime connection:

   ```sql
   CREATE ROLE ledgerloop_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
   CREATE ROLE ledgerloop_app_login LOGIN PASSWORD 'replace_with_a_local_password'
     IN ROLE ledgerloop_app NOSUPERUSER NOBYPASSRLS;
   ```

3. Run the migration from the repository root:

   ```sh
   npm run db:migrate --workspace @ledgerloop/api
   ```

Company-owned tables use forced RLS and depend on transaction-local `app.current_company_id`. Request-facing code must use `TenantAccessService.withCompanyTransaction(authenticatedUserId, requestedCompanyId, work)`, which verifies active membership inside the same transaction. Never trust a request-supplied company ID as authorization. `AuditService.record(client, event)` writes through that transaction; the company ID comes from PostgreSQL tenant context.

The CI integration test uses a temporary PostgreSQL database and does not require Docker on your computer.

## Money representation

Persisted monetary amounts must be integer paise. The shared `parseRupeesToPaise` helper accepts a decimal rupee string and uses `BigInt` for conversion before returning a safe integer. It rejects floating-point inputs, negative amounts, exponent notation, separators, and more than two fractional digits.

## Security status

Values in `.env.example` are development placeholders only. No production secrets belong in source control. Authorization guards, email verification/password reset, Google sign-in, complete audit-write integration, accounting posting, file scanning, and AI safeguards remain pending. This scaffold is not production-ready.

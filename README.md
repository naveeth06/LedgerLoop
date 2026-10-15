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
- Exact configured-origin checks for auth mutations, double-submit CSRF token checks for refresh/logout, credentialed CORS restricted to `WEB_ORIGIN`, and endpoint throttling.
- GitHub Actions checks for API build, type-checking, unit tests, and PostgreSQL RLS integration.

Still not implemented: Angular web app, email verification/password reset, Google sign-in, access-token authorization guards on business endpoints, company onboarding/membership creation, business CRUD APIs, accounting posting, invoice/payment workflows, reporting, reminders, and AI features. This scaffold is not a production accounting system.

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

Rate limiting currently uses the NestJS in-process throttler. It is useful for a single API instance but is not a shared distributed limit; configure a Redis-backed throttling store before running multiple API replicas. The API does not yet have access-token authorization guards or protected accounting routes, so the access token is not yet used to authorize business operations. Do not expose this scaffold as a production service before the remaining authorization, email verification, monitoring, and security review work is completed.

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

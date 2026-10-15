# LedgerLoop

LedgerLoop is an India-focused, GST-aware accounting platform for small businesses and accountants.

## Current status

The project is being built incrementally. See [PLAN.md](./PLAN.md) for the baseline, delivery phases, and acceptance criteria.

Implemented foundation:
- npm workspaces for the NestJS API and shared TypeScript utilities.
- API health endpoint at `GET /api/health` and startup validation for `NODE_ENV` / `API_PORT`.
- Integer-paise money parser with unit tests.
- First PostgreSQL migration for users, companies, memberships, branches, and audit logs.
- Forced row-level security (RLS) for company-owned tables, transaction-scoped tenant context helper, and a PostgreSQL integration test.
- GitHub Actions checks for API build, type-checking, unit tests, and PostgreSQL RLS integration.

Not implemented yet: Angular web app, authentication, authorization guards, business CRUD APIs, accounting posting, invoice/payment workflows, reporting, reminders, and AI features. This scaffold is not a production accounting system.

## Requirements

- Node.js 22 or newer and npm
- Git
- PostgreSQL 16 or newer for local database work
- Docker is optional and can be deferred; CI runs PostgreSQL integration checks on GitHub-hosted runners.

## Install and verify API-only work

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

The health endpoint is `http://localhost:3000/api/health`. It currently confirms only that the HTTP process is running; it does not check a database.

## PostgreSQL migrations (when PostgreSQL is installed locally)

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

The migration grants the restricted role access to its tables. Company-owned tables use forced RLS and depend on transaction-local `app.current_company_id`. Application code must resolve a company through the authenticated user's active membership and set that context through `withTenantTransaction`; never trust a tenant ID supplied directly by a request.

The CI integration test uses a temporary PostgreSQL database and verifies that a runtime role can see only the company matching its transaction-local tenant context. It does not require Docker on your computer.

## Money representation

Persisted monetary amounts must be integer paise. The shared `parseRupeesToPaise` helper accepts a decimal rupee string and uses `BigInt` for conversion before returning a safe integer. It rejects floating-point inputs, negative amounts, exponent notation, separators, and more than two fractional digits.

## Security status

Values in `.env.example` are development placeholders only. No production secrets belong in source control. Authentication, CSRF, application-level RBAC, complete audit-write integration, accounting posting, file scanning, and AI safeguards remain pending until implemented and tested.

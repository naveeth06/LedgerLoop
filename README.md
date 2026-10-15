# LedgerLoop

LedgerLoop is an India-focused, GST-aware accounting platform for small businesses and accountants.

## Current status

This repository is being built incrementally. [PLAN.md](./PLAN.md) records the baseline, architecture, phases, and acceptance criteria.

The current foundation includes:
- An npm workspace with a NestJS API starter and shared TypeScript package.
- A basic API health endpoint at `GET /api/health`.
- Startup validation for `NODE_ENV` and `API_PORT`.
- A shared integer-paise parser and unit tests.
- Local PostgreSQL/pgvector, Redis, and MinIO service definitions.
- A development environment template and GitHub Actions checks.

**Not implemented yet:** Angular web app, database migrations/RLS, authentication and authorization, audit persistence, accounting posting, invoice/payment workflows, reporting, reminders, and AI features. Do not use this scaffold as a production accounting system.

## Requirements

- Node.js 22 or newer and npm
- Docker Engine with Docker Compose

## Local infrastructure

1. Copy `.env.example` to `.env`.
2. Replace development-only values before exposing any service outside your machine.
3. Start dependencies:

   ```sh
   docker compose up -d
   ```

   PostgreSQL is available at `localhost:5432`, Redis at `localhost:6379`, and MinIO at `localhost:9000` (console: `localhost:9001`).

## Install and verify

```sh
npm install
npm run typecheck
npm run build
npm test
```

Run the API locally after installation:

```sh
npm run build
node apps/api/dist/main.js
```

The health endpoint is `http://localhost:3000/api/health`. The API currently has no database connection; the endpoint only indicates that the HTTP process is running.

## Money representation

Persisted monetary amounts must be integer paise. The shared `parseRupeesToPaise` helper accepts a decimal rupee string and uses `BigInt` for conversion before returning a safe integer. It intentionally rejects floating-point inputs, negative amounts, exponent notation, separators, and more than two fractional digits.

## Security status

Values in `.env.example` are development placeholders only. No production secrets belong in source control. RLS, authentication, CSRF, RBAC, audit logging, file scanning, and AI safeguards remain planned work until implemented and tested.

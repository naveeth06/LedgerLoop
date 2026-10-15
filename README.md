# LedgerLoop

LedgerLoop is planned as an India-focused, GST-aware accounting platform for small businesses and accountants.

## Current status

This repository is being built incrementally. The initial commit documents the repository baseline and delivery plan in [PLAN.md](./PLAN.md). The current foundation branch introduces the npm workspace, a shared integer-paise parser with unit tests, local infrastructure for PostgreSQL/pgvector, Redis and MinIO, an environment template, and a starter CI workflow.

The Angular web app, NestJS API, worker, database migrations, authentication and accounting workflows are **not implemented yet**. Do not use this scaffold as a production accounting system.

## Requirements

- Node.js 22 or newer and npm
- Docker Engine with Docker Compose

## Local infrastructure

1. Copy `.env.example` to `.env`.
2. Review and replace local-only values before exposing any service outside your machine.
3. Start dependencies:

   ```sh
   docker compose up -d
   ```

   PostgreSQL is available at `localhost:5432`, Redis at `localhost:6379`, and MinIO at `localhost:9000` (console: `localhost:9001`).

4. Install workspace dependencies and run the shared-types checks:

   ```sh
   npm install
   npm run typecheck
   npm test
   ```

## Money representation

Persisted monetary amounts must be integer paise. The shared `parseRupeesToPaise` helper accepts a decimal rupee **string** and uses `BigInt` for conversion before returning a safe integer. It intentionally rejects floating-point inputs, negative amounts, exponent notation, separators, and more than two fractional digits. Debit/credit sign and direction belong to journal semantics, not this non-negative amount parser.

## Security status

The values in `.env.example` are development placeholders only. No production secrets belong in source control. RLS, authentication, CSRF, RBAC, audit logging, file scanning and AI safeguards remain planned work until implemented and tested.

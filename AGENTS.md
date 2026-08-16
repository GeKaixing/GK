# AGENTS.md - Coding Guidelines for gekaixing

This repository is a TypeScript-only stack:
- Frontend/BFF: Next.js 16 + TypeScript + Tailwind CSS v4
- Auth: Auth.js (JWT, unique user identifier: user.id)
- Database: PostgreSQL via Prisma
- Cache: Redis (Upstash REST)
- Infra: Vercel (Node runtime)

> **Architecture rule: TypeScript only.** Do not introduce other languages
> (Go/Rust/etc.) — every deployer must only install the Node toolchain.

## Core Principles

- Complete migrations in one pass on this branch; avoid compatibility half-states.
- Do not reintroduce Supabase dependencies (auth, storage, realtime, query APIs).
- Keep `user.id` as the canonical identity across JWT claims and DB relations.
- Prefer explicit types, predictable errors, and testable boundaries.

## Tech Stack (Current)

### Web / Frontend
- Next.js 16.1.6 (App Router)
- TypeScript (strict)
- Tailwind CSS v4
- shadcn/ui (new-york)
- Zustand
- React Hook Form + Zod
- next-intl

### Auth
- Auth.js
- JWT session strategy
- HS256 signing/verification for internal JWT helpers

### Data
- PostgreSQL
- Prisma (single source of truth)

### Cache
- Upstash Redis (REST)

### Infra
- Vercel (Node runtime, Fluid Compute)
- docker-compose for local postgres + redis

## Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npx tsc --noEmit
npm run test

# Prisma
npx prisma generate
npx prisma migrate dev
npx prisma db push
```

## Auth and Identity Rules

- Auth must go through Auth.js routes and session APIs.
- JWT payloads must use `user.id` as the stable subject identifier.
- Never use email as primary join key in business logic.
- Any auth/profile update endpoint must validate ownership from session user id.

## Storage Rules

- Use local/object storage API endpoints under `app/api/storage/*`.
- Public URL shape is `/uploads/<bucket>/<path>`.
- Do not use legacy Supabase storage helpers.

## API and Error Handling

- Route handlers must return structured JSON (`success`, `error`, `data` where applicable).
- Use `try/catch` for async boundaries.
- Never swallow errors; log with context.
- Prefer 400/401/403/404/409/500 with clear semantics.
- Modules that read env at import time must not throw when the var is missing
  (construct lazily) — Next.js evaluates imports during build-time page-data
  collection, so a missing env var at module scope breaks the whole build.

## TypeScript Standards

- Strict mode assumptions always on.
- No `any`, no `@ts-ignore`, no `@ts-expect-error`.
- Explicit parameter and return types for exported functions.
- Keep imports grouped: external, internal aliases, local.

## Database Conventions

- PostgreSQL naming: snake_case for tables/columns.
- Keep migration files deterministic and idempotent where possible.

## Testing Requirements

- Add or update tests for all behavior changes.
- Minimum checks before finishing work:
  - `npx tsc --noEmit`
  - `npm run test`
  - `npm run build` (verified locally before pushing)

## File Organization

```text
app/                    # Next.js routes and APIs
components/             # UI components
lib/                    # shared TS libs (auth, prisma, helpers)
utils/                  # compatibility and utility helpers
prisma/                 # Prisma schema and migrations
deploy/                 # docker-compose (local postgres + redis)
```

## Security and Config

- Never commit real secrets (`.env.production.local` / `.env.development.local`
  must NOT be tracked — add them to `.gitignore`).
- Use environment variables for local runtime.
- Required variables must be documented in `.env.example`.
- If package download is blocked, prefer mainland npm mirror as fallback.

## Migration Guardrails

- Remove legacy naming when practical (`supabase`-prefixed helpers, old adapters).
- Keep compatibility shims minimal and clearly temporary.
- Any remaining shim should fail safely and guide callers to the new path.

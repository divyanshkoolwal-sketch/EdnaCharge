---
name: dev-setup
description: Use when getting the EdnaCharge monorepo from a fresh clone to running dev servers (install, .env, redis/supabase, pnpm dev).
---

# Dev Setup

Get from a fresh clone to running dev servers. Authoritative source is
[`docs/RUNBOOK.md`](../../../docs/RUNBOOK.md); this is the fast path.

## Toolchain

- Node 20 (`.nvmrc` pins `20`). Use `nvm use` if you have nvm.
- pnpm `10.28.0` (pinned in root `package.json` `packageManager`). Enable it with
  Corepack rather than a global install:

```bash
corepack enable
```

## Install

```bash
pnpm install
```

`postinstall` runs `pnpm -F @edna/db generate` (Prisma client). The root
`.npmrc` sets `node-linker=hoisted` + `shamefully-hoist=true` and hoists
`expo`/`metro`/`react-native`/`babel` — this is required so Expo CLI can resolve
its toolchain under pnpm. Do not "clean up" `.npmrc`; removing the hoisting
breaks the mobile app.

## Environment

```bash
cp .env.example .env
```

Fill it from [`docs/runbooks/credentials-template.md`](../../../docs/runbooks/credentials-template.md).
Vars that matter locally:

- `DATABASE_URL`, `REDIS_URL` — Postgres (Supabase) + Redis.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — server-side auth verification,
  Storage, Realtime.
- `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` — mobile auth.
- `EXPO_PUBLIC_MAPBOX_TOKEN` — map tiles (blank map without it).
- `STRIPE_SECRET_KEY` (test mode) — payment/booking/session flows.
- `ENABLE_DEV_BYPASS=1` (signed with `AUTH_DEV_SECRET`) — local-only auth bypass.
  Never set this in production.

Auth is Supabase Auth (email+password, Google, Apple). There are no native auth
config files to supply and no secrets to commit.

## Local infra

```bash
redis-server
supabase start
```

Common Supabase local ports: API `54321`, DB `54322`, Studio `54323`,
Inbucket `54324`. Supabase local needs Docker.

## Run

```bash
pnpm dev        # turbo run dev --parallel — all apps
```

Or run one service at a time:

```bash
pnpm -F @edna/api start
pnpm -F @edna/csms start
pnpm -F @edna/worker start
pnpm -F @edna/mobile dev
```

Health lives at `/healthz` (and `/readyz`) on API (`3000`), CSMS (`3100`), and
worker (`3200`). If port `3000` is taken, `/healthz` will 404 — start services on
temporary ports via `API_PORT` / `CSMS_PORT` / `WORKER_PORT`.

See [`docs/RUNBOOK.md`](../../../docs/RUNBOOK.md) for troubleshooting.

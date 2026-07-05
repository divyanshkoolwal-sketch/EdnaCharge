# EdnaCharge

Peer-to-peer EV charging marketplace.

This repo is a pnpm/Turborepo monorepo with:

- `apps/api` - Fastify + tRPC + Prisma. User-facing API.
- `apps/csms` - Fastify + OCPP 1.6 WebSocket server for chargers.
- `apps/worker` - BullMQ workers for booking expiry, settlement, device jobs, and notifications.
- `apps/mobile` - Expo React Native app.
- `packages/db` - Prisma schema, seed data, and DB tests.
- `packages/schemas` - shared Zod schemas and pricing helpers.
- `packages/config` - environment loading/validation.
- `tools/ocpp-simulator` - local charger simulator.

## Start Here

Current docs live in [`docs/`](docs/README.md).

For agent work, read these first:

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/AGENT_CONTEXT.md`](docs/AGENT_CONTEXT.md)
3. [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
4. [`docs/todo.md`](docs/todo.md)

## Quickstart

```bash
corepack enable
pnpm install
cp .env.example .env
redis-server
pnpm dev
```

In another terminal:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm demo:loop
```

`pnpm demo:loop` checks `/healthz` on API, CSMS, and worker. If port `3000` is already occupied, run the services with temporary ports and pass `API_PORT`, `CSMS_PORT`, and `WORKER_PORT` to the command.

## Local Secrets

Never commit real credentials. Use `.env` only:

- `.env` from `.env.example` (Supabase, Stripe, Mapbox, Redis, DB, etc.)
- any EAS/App Store/Google Play keys

Auth is Supabase Auth (email+password, Google, Apple); there are no native auth
config files to supply.

See [`docs/runbooks/credentials-template.md`](docs/runbooks/credentials-template.md).

## Current Rules

- Source files should start with a file docstring.
- TS/TSX/JS files should stay at or under 300 LOC.
- Do not collapse API, CSMS, worker, and mobile into one service.
- Use shared schemas/pricing instead of duplicating contract logic.
- If you cannot verify it, do not claim it works.

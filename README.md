# EdnaCharge

Peer-to-peer EV charging marketplace. See `PRD` (product source of truth) and `CLAUDE.md` (engineering operating manual).

## Quickstart
```bash
nvm use
corepack enable
pnpm install
cp .env.example .env
# (later) supabase start
pnpm dev
```

## Services
- `apps/api` — Fastify + tRPC + Prisma (port 3000)
- `apps/csms` — Fastify + ocpp-rpc (port 3100)
- `apps/worker` — BullMQ workers (port 3200 for /healthz)
- `apps/mobile` — Expo SDK 51 + Expo Router

## Gate scripts
- `pnpm demo:loop` — hits /healthz on every service; must exit 0 between phases.
- `pnpm sentry:smoke` — fires one captureException per service.

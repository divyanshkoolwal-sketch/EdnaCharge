---
name: deploy
description: Use when deploying or reasoning about EdnaCharge deploys — Render backend services, single-instance CSMS, health checks, secrets, mobile via EAS/TestFlight, rollback.
---

# Deploy

Full details in [`docs/DEPLOYMENT.md`](../../../docs/DEPLOYMENT.md). Backend
deploys are driven by [`render.yaml`](../../../render.yaml).

## Backend (Render)

`render.yaml` is a Render Blueprint. Pushing to `main` auto-deploys
(`autoDeploy: true`, `branch: main`) three services:

- **edna-api** — Fastify + tRPC public API. `type: web`, health `/readyz`.
- **edna-csms** — OCPP 1.6 WebSocket central system. `type: web`, health
  `/readyz`, WSS upgrade.
- **edna-worker** — BullMQ jobs (Stripe capture, push). `type: worker`, no
  inbound port.

Each service builds with Corepack + pnpm `10.28.0` + `pnpm --filter @edna/db
generate` (no compile step — services run TS directly via `tsx`) and starts with
`pnpm --filter @edna/<svc> start`.

Postgres is Supabase Cloud and Redis is Upstash — both external, set via secrets.

## CSMS is single-instance — do not scale horizontally

`edna-csms` MUST stay `numInstances: 1`. It holds the charge-point registry in
memory (`apps/csms/src/lib/registry.ts`) and consumes the `ocpp-commands` queue
to route `RemoteStart` to a live WebSocket. A second instance fragments the
registry and steals commands for chargers whose socket it does not hold →
silent RemoteStart failures. Scale **vertically** (bigger plan). Do not enable
autoscaling until a Redis-backed registry exists.

## Health checks

API and CSMS health-check on `/readyz` (readiness). `/healthz` also exists
(liveness / demo-loop probe). A deploy is not healthy until `/readyz` passes.

## Secrets

All `sync: false` vars (and the `edna-shared` env-var group: `DATABASE_URL`,
`REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`STRIPE_SECRET_KEY`, `OCPP_SECRET_ENC_KEY`) are entered ONCE in the Render
dashboard and never committed. Inventory is in
[`docs/runbooks/credentials-template.md`](../../../docs/runbooks/credentials-template.md).
Production must **not** set `ENABLE_DEV_BYPASS=1`.

## Database

Apply migrations from `supabase/migrations/` in order. Confirm RLS hardening,
notification FK / account-deletion cascade, and charger-location trigger
migrations are present. `DATABASE_URL` must be a real production (non-local) URL.

## Post-deploy smoke

```bash
pnpm demo:loop
```

Then manually: sign in; add/view payment method; host onboarding reaches Stripe
Connect; OCPP simulator connects and starts only after driver action; session
settlement produces a receipt + notification. (`pnpm sentry:smoke` only works
where `NODE_ENV !== production`; in prod verify Sentry via a real captured error.)

## Mobile (EAS / TestFlight)

Native builds ship via EAS, then TestFlight. The app reads
`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` for auth — no
native auth config files. See [`docs/runbooks/testflight.md`](../../../docs/runbooks/testflight.md).

## Rollback

Render keeps prior deploys. To roll back, redeploy the previous known-good
commit from the Render dashboard (Deploys → pick the last healthy deploy →
redeploy / rollback). Do not hotfix `main` under pressure without a fix commit.

# Local Runbook

## Requirements

- Node 20+
- pnpm 10+
- Docker, for Supabase local
- Redis
- Supabase CLI, for full local database work

## First Setup

```bash
corepack enable
pnpm install
cp .env.example .env
```

Fill `.env` from [`runbooks/credentials-template.md`](runbooks/credentials-template.md). Local dev can use `ENABLE_DEV_BYPASS=1` (signed with `AUTH_DEV_SECRET`); production must never set it.

Authentication is Supabase Auth (email+password, Google, Apple). It uses the same
Supabase project as Postgres/Realtime/Storage — server-side via `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`, mobile via `EXPO_PUBLIC_SUPABASE_URL` +
`EXPO_PUBLIC_SUPABASE_ANON_KEY`. There are no native auth config files to commit.

## Local Infra

```bash
redis-server
supabase start
```

Common Supabase local ports:

- API: `54321`
- DB: `54322`
- Studio: `54323`
- Inbucket: `54324`

## Run The App

```bash
pnpm dev
```

Or run services separately:

```bash
pnpm -F @edna/api start
pnpm -F @edna/csms start
pnpm -F @edna/worker start
pnpm -F @edna/mobile dev
```

## Verification

```bash
pnpm typecheck
pnpm test
pnpm lint
git diff --check
pnpm demo:loop
```

`pnpm demo:loop` probes:

- `http://localhost:${API_PORT:-3000}/healthz`
- `http://localhost:${CSMS_PORT:-3100}/healthz`
- `http://localhost:${WORKER_PORT:-3200}/healthz`

## E2E (live)

The API e2e and DB RLS suites are the real trust-boundary tests (auth, RLS row
isolation, charger/chat/access flows). They're **gated** — without a live stack
they skip with a reason so `pnpm test` stays green on a bare box. To actually run
them:

```bash
supabase start              # + redis
supabase db reset           # apply all migrations (incl. RLS policies)
pnpm -F @edna/api start &   # API on E2E_API_URL (default :3300 — :3000 is the site)
pnpm test:e2e               # sources .env, sets E2E_LIVE=1, runs api + db e2e
```

Payment/booking/session e2e additionally require a Stripe **test-mode**
`STRIPE_SECRET_KEY` in `.env` (the suites never mock Stripe); without it they skip.

If a local process already owns those ports, run the services with temporary ports:

```bash
API_PORT=3300 pnpm -F @edna/api start
PORT=3301 CSMS_PORT=3301 pnpm -F @edna/csms start
WORKER_PORT=3302 pnpm -F @edna/worker start

API_PORT=3300 CSMS_PORT=3301 WORKER_PORT=3302 pnpm demo:loop
```

### High-risk path coverage & live-gating plan

Three money/safety-critical paths this changeset touches — **account deletion**,
**settle/refund/dispute**, and **review moderation** — are covered in two layers
so the load-bearing logic is verified on every `pnpm test` (bare box), while the
DB/Stripe orchestration is exercised only under the live stack.

**Unit-covered now** (pure helpers, run on every `pnpm test`; also in
`pnpm smoke:product`):

| Path               | Test file                                     | What it pins                                                                                                                                                                           |
| ------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moderation resolve | `apps/api/test/moderation.unit.test.ts`       | `reviewReportResolutionStatus` only ever returns a `ContentReport_status_check`-allowed value (`actioned`/`dismissed`) — the exact CHECK-violating regression that 500'd the moderator |
| Refund / dispute   | `apps/api/test/refund-math.unit.test.ts`      | `refundedPayoutAmounts` full-reverse, proportional-net partials, idempotent recompute-from-original, non-negative clamps; `disputeStatusFor` mapping incl. lost-only reversal          |
| Account deletion   | `apps/api/test/account-deletion.unit.test.ts` | `pi_dev_` skip, active-only blocking, empty-holds no-op, and the `isAlreadyDeleted` idempotent-resume guard                                                                            |

**Live-gated** (real DB/Stripe; `describe.skip` unless `E2E_LIVE=1`, and they
never mock Stripe/DB). Run via the E2E steps above; these additionally need:

- **Moderation** — the atomic review-hide + `ContentReport.status` transaction
  under the real CHECK constraint, plus the `assertModerationAdmin` gate. Needs
  `MODERATION_ADMIN_EMAILS` set to the test moderator's email.
- **Refund / dispute DB writes** — `Booking.refundedAmountCents`, the system
  `ChatMessage`, and the `Payout` reversal keyed on `reversedAt == null` (reverse
  once). Driven by a real Stripe test-mode webhook, so needs `STRIPE_SECRET_KEY`.
- **`settle-session` capture** — the worker job that SETS the immutable
  `capturedAmountCents`/`platformFeeCents` the refund math depends on. Live
  Stripe capture + DB.
- **`deleteAccount` full run** — the `prisma.$transaction` anonymize + open-hold
  cancel + Supabase/Stripe teardown, and the idempotent RETRY resuming to the
  same end state (it must NOT hard-delete the User — that would cascade into
  counterparties' history).

Rationale: a prisma-mock "integration" test for these would only re-assert the
mock's own wiring (it can't enforce a Postgres CHECK, a real transaction, or a
Stripe webhook), so they stay live-gated rather than giving false confidence.

## Useful Commands

```bash
# The sim connects and idles until a booking's RemoteStartTransaction drives a
# session (as in prod). To self-drive a session standalone, add --idTag <tag>:
pnpm sim --charger sim-001 --idTag test-tag --session 30m
pnpm sentry:smoke
pnpm -F @edna/db seed
pnpm -F @edna/db invite:generate -- --role host --campaign fremont-ground-host --count 50
```

## Troubleshooting

- API `/healthz` returns 404: port `3000` is probably another app.
- Worker logs Prisma initialization errors while `/healthz` passes: old Redis jobs may be running without `DATABASE_URL`; clear local Redis or start Supabase/configure DB.
- CSMS cannot accept WebSockets: ensure `CSMS_PUBLIC_URL` matches the host/port the charger sees.
- Mobile sign-in fails: check `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and that the Google/Apple providers are enabled in Supabase Auth (phone/OTP is not supported).
- Map is blank: set `EXPO_PUBLIC_MAPBOX_TOKEN`.

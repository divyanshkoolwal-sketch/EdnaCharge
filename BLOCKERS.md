# BLOCKERS — things I need from you before the app runs end-to-end

This is the single source of truth for every piece of external configuration, credential, or local tool you still need to provide or install. I've built every phase code-complete; where a gate genuinely requires a secret or a running external service, I've marked it "verification deferred" and listed the one-command recipe below so you can run the gate yourself once the secret is dropped in.

Update this file as things are unblocked. Keep it honest — an entry here means "the app is not truly end-to-end until this is resolved."

---

## 1. Local tools you need to install

| Tool | Why | How |
|---|---|---|
| **Docker Desktop (running)** | Required by `supabase start` to boot local Postgres + Auth + Realtime + Storage. | Install from docker.com, open Docker, wait for the whale icon. |
| **Supabase CLI** | Local Supabase stack, migrations, RLS tests. | `brew install supabase/tap/supabase` |
| **Xcode (for iOS sim) / Android Studio (for emulator)** | To run `apps/mobile` on a simulator. | App Store / developer.android.com |
| **Stripe CLI** | Forwards Stripe webhooks into `apps/api` during local dev. | `brew install stripe/stripe-cli/stripe` then `stripe login` |
| **Maestro** (optional, for E2E) | Runs the yaml E2E flow in PRD §20. | `curl -Ls "https://get.maestro.mobile.dev" \| bash` |

---

## 2. Secrets / env vars to fill in `.env`

Copy `.env.example` → `.env` (done in Phase 0) and fill these in. Every service reads from the repo root `.env` via `@edna/config`.

### Supabase (local — auto-filled after `supabase start`)
`supabase start` prints the anon key + service role key to stdout. Paste them here:
- `SUPABASE_URL` — defaults to `http://localhost:54321`, leave as-is for local dev
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` — defaults to `postgresql://postgres:postgres@localhost:54322/postgres`, leave as-is

### Stripe (test mode)
Grab from https://dashboard.stripe.com/test/apikeys:
- `STRIPE_SECRET_KEY` — starts with `sk_test_…`
- `STRIPE_PUBLISHABLE_KEY` — starts with `pk_test_…` (also needs to be in `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`)
- `STRIPE_WEBHOOK_SECRET` — run `stripe listen --forward-to localhost:3000/webhooks/stripe` and copy the `whsec_…` it prints
- `STRIPE_CONNECT_CLIENT_ID` — from https://dashboard.stripe.com/test/settings/connect, `ca_…`

### Sentry (4 DSNs, one per service)
Create a Sentry org + 4 projects (api, csms, worker, mobile):
- `SENTRY_DSN_API`
- `SENTRY_DSN_CSMS`
- `SENTRY_DSN_WORKER`
- `EXPO_PUBLIC_SENTRY_DSN` (mobile)

### PostHog
Create a PostHog project (posthog.com or self-host). The mobile app reads the **public** project API key:
- `EXPO_PUBLIC_POSTHOG_KEY`
- `EXPO_PUBLIC_POSTHOG_HOST` — `https://us.i.posthog.com` or EU host

### Mapbox
Free tier is fine. Needs a **public** token starting with `pk.…`:
- `EXPO_PUBLIC_MAPBOX_TOKEN`

### Expo push notifications
Expo handles the token flow, but for production you'll need:
- An Apple Push Notification Key (APNs .p8) uploaded in `eas credentials` for iOS
- An FCM server key uploaded for Android
- For local dev on a simulator, no config is needed — Expo Go or a development build will work.

### (optional) Upstash Redis for staging
`REDIS_URL` defaults to `redis://localhost:6379` (local redis-server). If you want to point staging at Upstash, set it to the Upstash connection string.

---

## 3. Per-phase verification recipes

Each phase below has a gate that I couldn't run locally because it needs one of the secrets above. Once the secret is in `.env`, run the command. If it exits 0 / returns the expected output, the gate is met.

### Phase 0 — ✅ met (no external deps)
```bash
pnpm install
pnpm dev   # in one terminal
pnpm demo:loop   # must exit 0
```

### Phase 1 — requires Docker + Supabase CLI
```bash
supabase start                           # boots local Postgres on 54322
pnpm -F @edna/db migrate                 # applies Prisma migrations
pnpm -F @edna/db test:rls                # RLS policy test suite
pnpm -F @edna/db exec prisma migrate diff \
  --from-schema-datamodel packages/db/prisma/schema.prisma \
  --to-schema-datasource packages/db/prisma/schema.prisma \
  --script                               # must print empty script
```

### Phase 2 — requires Stripe test keys + Supabase running
```bash
stripe listen --forward-to localhost:3000/webhooks/stripe &
pnpm dev
# on an iOS sim / Expo Go:
#   1. sign up with any email (local Supabase prints OTP to inbucket at http://localhost:54324)
#   2. complete driver profile
#   3. add card 4242 4242 4242 4242 via PaymentSheet
#   4. payment.listPaymentMethods must show the card
```

### Phase 3 — no new secrets
Run Phase 2 steps, then tap Become a host and walk through each of the four tier branches. Confirm `host_profiles.hardware_setup` rows in Supabase Studio (http://localhost:54323).

### Phase 4 — requires Mapbox token
```bash
pnpm -F @edna/db seed   # seeds 20 Tri-Valley chargers
pnpm dev
# on the driver map, confirm clusters, tap a pin, see detail sheet
# as a host, list a charger; it should appear on the map within 30s
```

### Phase 5 — no new secrets, requires Phase 1 DB
```bash
pnpm dev   # csms on :3100
pnpm sim --charger sim-001 --session 30m
# expect a `ChargingSession` row with roughly minutes × 6 MeterValue rows (±1)
```

### Phase 6 — Phase 2 prereqs + real Expo push tokens for end-to-end push
```bash
pnpm dev
# scripted driver: request booking
# scripted host: accept in chat
# chat round-trip must be < 1s (Supabase Realtime)
# 30-min auto-decline: override cron interval via AUTO_DECLINE_MS=5000 env for a fast local test
```

### Phase 7 — Stripe test keys, Phase 5 CSMS, Phase 1 DB
```bash
# from a confirmed booking:
pnpm dev
# start session → live kWh ticks in <1s → stop → receipt → review
# check Stripe dashboard: PaymentIntent captured at the real final amount, Payout row in DB
```

### Phase 8 — all of the above plus Expo push creds
```bash
pnpm chaos   # runs the happy path 5× clean; must exit 0
# manually check PostHog funnel: 15 events from PRD §18 in order
```

---

## 4. Notes / watch-outs

- **Expo SDK 51 + TS 5.3.3** — tRPC v11 peer-warns on TS < 5.7.2. Runtime is fine. Don't bump `apps/mobile` TypeScript until Expo SDK bumps its own pin.
- **ocpp-rpc v2.x** — PRD cites `^1.14.1` which does not exist on npm. We're on v2.2.x; v2 API differs from v1. Phase 5 handler code targets v2.
- **nativewind 4 + reanimated** — pinned reanimated to `~3.10.1` so the Expo 51 peer resolves.
- **Supabase local ports** — studio 54323, API 54321, DB 54322, inbucket (test email) 54324. If you have other services on those ports, Supabase CLI will fail.
- **Stripe Connect Express** requires your Stripe account to have Connect enabled (free in test mode).
- **Realtime channels** — PRD §16 lists 4 channels. All are standard Supabase Realtime on Postgres CDC + presence. No extra config beyond `SUPABASE_*` env.

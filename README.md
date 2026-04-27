# EdnaCharge

Peer-to-peer EV charging marketplace — single React Native (Expo) app, three Node services, one Postgres, one Redis. Hosts list home chargers; drivers find them on a map, book a window, chat, charge, get billed.

> **Status:** functional end-to-end on a developer machine. Several pieces are stubbed for local dev (most prominently Stripe). See [§ What's mocked / not wired](#whats-mocked--not-wired) before you demo.

---

## Repo map

```
apps/
  api/        Fastify + tRPC + Prisma. Every mobile read/write goes here.
  csms/       Fastify + ocpp-rpc. Charger WebSockets at /ocpp/v1.6/:cpId.
  worker/     BullMQ. Auto-decline cron, post-session Stripe capture, push fanout.
  mobile/     Expo SDK 51 + Expo Router. iOS-first; native Mapbox + Stripe.
packages/
  db/         Prisma schema + migrations + RLS SQL + seed.
  schemas/    Zod schemas — single source of truth for input validation.
  config/     Shared env loader (auto-loads root .env).
  ui/         (placeholder) shared UI primitives.
tools/
  ocpp-simulator/  Pretends to be a real OCPP 1.6-J charger. Drives the live-session demo.
scripts/
  demo-loop.ts     Hits /healthz on api/csms/worker. Phase-gate.
  sentry-smoke.ts  Fires captureException on each service to verify DSN wiring.
  chaos.ts         Runs the simulator-driven happy path 5×.
```

Authoritative docs live next to the code:
- **`CLAUDE.md`** — engineering operating manual + phase ledger + decision log
- **PRD** (Anthropic-output dir, not in repo) — product source of truth
- **`DESIGN_SPEC.md`** — every screen, every state, for the designer
- **`AUDIT.md`** — security + correctness findings (28; all addressed)
- **`BLOCKERS.md`** — what you need to run end-to-end
- **`CREDENTIALS.txt`** — tickable checklist of every secret

---

## Quickstart (fresh machine)

Prereqs: macOS, **Node 20+**, **pnpm 10+**, **Docker Desktop running**, **Xcode 26**, **Supabase CLI** (`brew install supabase/tap/supabase`), Redis (`brew install redis`), Stripe CLI (optional).

```bash
git clone https://github.com/divyanshkoolwal-sketch/EdnaCharge.git ednacharge
cd ednacharge
nvm use
corepack enable
pnpm install
cp .env.example .env                  # then fill in per CREDENTIALS.txt

# Infra (one-time per session)
redis-server --daemonize yes
supabase start                        # boots Postgres + Auth + Realtime + Storage + Studio
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
  pnpm -F @edna/db exec prisma db push
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres \
  -f packages/db/sql/rls.sql
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
  pnpm -F @edna/db seed                # 20 Tri-Valley chargers

# Backend (3 dev servers, one terminal each — or all via `pnpm dev`)
pnpm -F @edna/api dev                 # → http://localhost:3000
pnpm -F @edna/csms dev                # → http://localhost:3100
pnpm -F @edna/worker dev              # → http://localhost:3200
pnpm demo:loop                        # all green = ready

# Mobile (one-time iOS native build, then Metro)
cd apps/mobile
pnpm ios                              # first run ≈ 5–10 min, subsequent runs ≈ 30 s
```

The iOS sim launches into the Welcome screen. Sign up with any email — the OTP code lands in **Mailpit** at http://127.0.0.1:54324 (Supabase's local SMTP catcher).

---

## Common operations

```bash
pnpm typecheck                        # all 7 packages
pnpm test                             # vitest across workspaces
pnpm demo:loop                        # /healthz gate
pnpm sentry:smoke                     # fires real Sentry events from each service
pnpm sim --charger sim-001 --session 30s   # simulator → CSMS → live session screen
pnpm chaos                            # 5× scripted happy-path
```

Stop everything:
```bash
pkill -f tsx                          # api / csms / worker
pkill -f 'expo start'                 # Metro
xcrun simctl terminate booted com.ednacharge.app
supabase stop                         # Postgres + Auth + Studio
```

---

## What's mocked / not wired

The app boots and demos end-to-end. The list below is what is **not real** today, when each one matters, and how to swap it for the production version.

### Stripe (entire payments surface) — **dev-bypass active**
- **What** — `apps/api/src/lib/stripe.ts` exposes `devBypassStripe()`. Whenever `NODE_ENV !== 'production'` AND `STRIPE_SECRET_KEY` is missing or `REPLACE_ME`, every Stripe touchpoint is faked:
  - **Host onboarding** (`auth.startHostOnboarding`) — skips the Stripe Connect WebView. Stamps `acct_dev_<userId>` on the host profile, marks `stripeOnboardingComplete=true`, flips the `host` role on the user. Mobile sees `devBypass: true` and routes straight to the success screen.
  - **Driver payment methods** (`payment.setupIntent` + `listPaymentMethods`) — returns one placeholder card (`pm_dev_card`, brand "visa", `**** 4242`) so booking preconditions pass. The Payment Methods screen shows a "DEV MODE" banner; "+ Add card" is disabled.
  - **Booking pre-auth** (`booking.requestBooking`) — synthesizes `pi_dev_<random>` instead of calling `stripe.paymentIntents.create`. Booking row, chat thread, auto-decline timer all behave normally.
  - **Decline / cancel** — `stripe.paymentIntents.cancel` is skipped for any PI prefixed `pi_dev_`.
  - **Settle** (`apps/worker/src/jobs/settle-session.ts`) — `stripe.paymentIntents.capture` is skipped for `pi_dev_*`. The `Booking.status` still flips to `completed`, the `Payout` row still gets created with the right amounts. Drivers see a real receipt; hosts see real earnings totals; nothing actually moves money.
- **When it matters** — anything you ship that touches real money. The 15% platform-fee math, manual-capture flow, application-fee splits, and webhook signature verification are all written and committed; they just never execute under dev-bypass.
- **How to flip on real Stripe** — drop real test keys into `.env`: `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_PUBLISHABLE_KEY=pk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...`, and the Expo-side `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`. Restart the api. `devBypassStripe()` returns false; all branches above take the real path.

### Sentry React Native — **fully stubbed**
- **What** — `apps/mobile/src/lib/sentry.ts` is a no-op shim. `@sentry/react-native` is also excluded from CocoaPods autolinking via `apps/mobile/react-native.config.js`.
- **Why** — Sentry-Cocoa 8.x's profiling code is incompatible with Xcode 26's libc++ + Swift compiler; the available 5.24-line of `@sentry/react-native` references the affected APIs.
- **What still works** — backend services (`apps/api`, `apps/csms`, `apps/worker`) all run real `@sentry/node` with real DSNs. Crash reports land in Sentry from the server side; only the in-app crash reporter is missing.
- **Fix** — upgrade `@sentry/react-native` to a release that ships fixed Sentry-Cocoa (track [getsentry/sentry-cocoa#4400](https://github.com/getsentry/sentry-cocoa/issues/4400)) and undo the autolinking exclusion + delete the shim.

### `expo-device` Swift fix — **patched in node_modules**
- **What** — `apps/mobile/node_modules/expo-device/ios/UIDevice.swift` had a `TARGET_OS_SIMULATOR` reference that fails to compile under Xcode 26's stricter Swift. Replaced with a `#if targetEnvironment(simulator)` block via sed.
- **Why it matters** — gets clobbered by `pnpm install`. Re-run the patch (or pull a fixed `expo-device` release) after dependency installs.
- **Fix** — pin `patch-package` and snapshot the diff so it survives reinstalls. Two-line change.

### Distance + drive-time on charger detail — **client-side heuristic**
- **What** — `apps/mobile/src/lib/distance.ts` uses Haversine for distance and a 30 km/h average for drive time. No routing, no traffic.
- **When it matters** — when the demo audience cares whether "6 min" is real.
- **Fix** — call Mapbox Directions API server-side from `charger.get`, return `durationS`, render that instead.

### Address → lat/lng — **map picker, no geocoding**
- **What** — Add Charger has a draggable Mapbox preview pin. The host enters their address as text but the actual coordinate comes from the pin. No reverse-geocode call links the two.
- **When it matters** — the map pin position is what determines whether the charger appears in driver radius queries; the address text is decorative until the geocoding is wired.
- **Fix** — Mapbox Geocoding API call from `charger.create` to validate that `(addressLine1, city, state, zip)` resolves close to the supplied `(lat, lng)`. Reject if they disagree by >500 m.

### Profile star ratings — **hard-coded `4.8` / `4.9`**
- **What** — `(driver)/profile.tsx` and `(host)/profile.tsx` show static rating numbers.
- **Fix** — add `review.summary({ userId })` server proc returning `{ avg, count }`; render real avg.

### Today's earnings + earnings bar chart — **hard-coded**
- **What** — `(host)/home.tsx` "Today" tile shows `$—`. `(host)/earnings.tsx` bar chart values are `[40, 28, 55, 72, 46, 90, 62]`, not real.
- **Fix** — group `Payout.createdAt` by weekday for last 7 days; sum `capturedAmountCents` for today on the home tile.

### Host calendar — **stub layout, no booking blocks**
- **What** — `(host)/calendar.tsx` doesn't exist as a tab; the host tab bar omits it. Calendar view in PRD §8 is a v1.5 item.

### Account deletion — **sign-out only**
- **What** — `(shared)/settings.tsx` "Delete account" just signs the user out + clears device. No row deletion.
- **Fix** — `auth.deleteAccount` server mutation that cancels open bookings, masks PII, marks user `deletedAt`. Cascade rules need a product call first (refunds? historical bookings still visible to host?).

### Push notifications — **token registers, no real APNs on simulator**
- **What** — Expo push token grabs work; worker fans out to `exp.host/--/api/v2/push/send`. iOS simulator can't receive real pushes — Apple restricts APNs to physical devices.
- **Test path** — install on a real iPhone via `eas build --profile development --platform ios` + an Apple developer account.

### React Native worklets — **excluded from autolinking**
- **What** — installed only to satisfy the NativeWind / reanimated babel resolver. Native side conflicts with the RN 0.74 pin Expo SDK 51 requires.
- **Fix** — wait for Expo SDK 52+ (RN 0.81-line) and reanimated 4 stabilization.

### Mobile tests — **none yet**
- **What** — backend has Vitest e2e (api/test, packages/db/test). Mobile has no Detox / Maestro / RNTL coverage.
- **Fix** — start with a Maestro happy-path yaml per PRD §20.

---

## Real things that ARE wired (so you know what isn't on the list above)

- Supabase email-OTP auth (Mailpit captures the email locally)
- Postgres + Prisma + RLS policies + PostGIS geography for chargers
- Realtime pin updates: a host publishes → driver's map updates within ~1 s
- Mapbox tiles, clustering, user location, recenter
- OCPP 1.6-J protocol over WebSocket (charger ↔ csms ↔ Realtime broadcast → live-session screen)
- Auto-decline cron (BullMQ delayed job, override via `AUTO_DECLINE_MS`)
- Chat with Realtime delivery + read receipts
- Role flipping (driver ↔ host) without re-install
- Charger soft-unlist
- JWT auto-refresh + 401-retry interceptor
- Unified error handling — no more raw zod arrays in dialogs
- Distance display from your live location to a tapped charger
- Map picker for accurate lat/lng on add-charger
- 7 typecheck targets (api / csms / worker / mobile / db / schemas / config) all clean
- 17-finding security audit applied (`AUDIT.md`)

---

## Pre-production checklist

When you're ready to ship:

- [ ] Drop real Stripe test keys → `.env` (kills dev-bypass automatically)
- [ ] Configure Stripe webhook → `stripe listen --forward-to localhost:3000/webhooks/stripe`
- [ ] Add real Sentry DSNs to all 4 services (api / csms / worker / mobile)
- [ ] Restore real `@sentry/react-native` once upstream fixes Xcode 26
- [ ] `patch-package` the `expo-device` Swift fix
- [ ] Wire `auth.deleteAccount` per privacy policy
- [ ] Replace hard-coded ratings with `review.summary`
- [ ] Wire today's earnings + real bar-chart data
- [ ] Add Mapbox Directions API for accurate ETA
- [ ] Maestro yaml E2E + dev-build for real APNs push tests
- [ ] Re-run `AUDIT.md` regression tests against new Stripe live mode

Set `NODE_ENV=production` in the api service. `devBypassStripe()` will return false unconditionally; any missing Stripe key 503s instead of fabricating data.

---

## License

UNLICENSED — internal proof of concept.

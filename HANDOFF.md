# EdnaCharge — TestFlight launch handoff

> **For Claude sessions picking up this project.** Read this top-to-bottom before
> doing anything. The goal is to get this app to a production-quality TestFlight
> build. The product is ~95% functional; what remains is the gap between
> "runs on a simulator pointed at localhost" and "runs on a real device
> against a deployed production stack reviewed by Apple."

---

## TL;DR

EdnaCharge is a peer-to-peer EV charging marketplace. Drivers find nearby
home chargers, book + pay; hosts list their chargers and earn payouts.
Three hardware tiers (smart plug, CT clamp, OCPP-native). Full stack is
built, all core flows work end-to-end in a dev environment with real
Stripe test keys. The blockers between today and TestFlight are mostly
infrastructure decisions, secret rotation, and a paid Apple Developer
account — not code.

---

## Stack at a glance

- **Monorepo**: pnpm 10 + Turborepo 2, Node 20
- **Backend** (3 separate services):
  - `apps/api` — Fastify + tRPC v11 + Prisma. Public-facing API for the mobile app.
  - `apps/csms` — Fastify + `ocpp-rpc`. WebSocket endpoint at `/ocpp/v1.6/:chargerId` that real OCPP chargers connect to.
  - `apps/worker` — BullMQ workers. Stripe capture, push notifications, 30-min auto-decline, Tier 1/2 Shelly drivers, MQTT.
- **Mobile**: `apps/mobile` — Expo SDK 51, Expo Router (file-based), NativeWind, TanStack Query, tRPC client, Zustand, Mapbox, Stripe React Native, Firebase Auth.
- **Data**: Postgres (Supabase) with PostGIS + pgcrypto, Redis (BullMQ), EMQX (MQTT for Tier 1/2).
- **Auth**: Firebase Auth (email/password, Google, Apple, phone OTP). Verified server-side via Firebase Admin SDK.
- **Payments**: Stripe (Payments + Connect Express for hosts + Identity for KYC). Webhook receiver at `/webhooks/stripe`.
- **Hardware**:
  - Tier 1 = Shelly Plus Plug US (smart plug, MQTT)
  - Tier 2 = Shelly Pro 3EM (CT clamp, MQTT, monitoring-only by default)
  - Tier 3 = any OCPP 1.6 charger (ChargePoint, Wallbox, Tesla, etc.)

---

## Code layout

```
apps/
  api/src/
    routers/        # tRPC routers: auth, booking, charger, chat, device, payment, review
    webhooks/       # Stripe webhook handler (idempotent dedup, processedAt)
    lib/            # stripe.ts (with devBypassStripe), firebase.ts, queues.ts, pricing.ts
    trpc.ts         # createContext + protectedProcedure (with emailVerified gate)
    index.ts        # Fastify bootstrap
  csms/src/
    handlers/index.ts  # 7 OCPP 1.6 handlers (BootNotification, Authorize, StartTransaction, MeterValues, StopTransaction, etc.)
    lib/ocpp-queue.ts  # consumes 'ocpp-commands' BullMQ queue for RemoteStart/StopTransaction
  worker/src/
    drivers/        # ChargerDriver interface + Shelly drivers
      base.ts             # ChargerDriver interface (start, stop, getMeter, destroy)
      shelly-plug.ts      # Tier 1 — MQTT JSON-RPC
      shelly-em.ts        # Tier 2 — CT clamp subscriptions
    lib/
      device-registry.ts  # LRU cache: chargerId → driver (1h idle eviction)
      mqtt-client.ts      # EMQX client with topic dispatcher
      queues.ts           # singleton BullMQ Queue
    jobs/
      auto-decline.ts     # 30-min booking auto-decline
      settle-session.ts   # Stripe capture + Payout row
      notifications.ts    # Expo push fanout
      shelly-command.ts   # Tier 1 relay control + meter polling
      device-monitor.ts   # Tier 2 threshold detection (>500W start, <100W stop)
  mobile/app/
    (auth)/         # welcome, sign-in, phone, otp, driver-profile, pick-role
    (driver)/       # map, charger/[id], request/[chargerId], booking/[id], session/[id], receipt/[id], bookings, chats, chat/[bookingId], profile
    (host)/         # home, chargers, charger/[id], add-charger, requests, request/[id], earnings, chats, chat/[bookingId], profile, host-onboarding/*
    (shared)/       # settings (with deleteAccount), payment-methods, notifications, support, identity-verification (Stripe Identity SFSafariViewController)
    firebaseauth/   # phone-auth link callback
    _layout.tsx     # Root layout — AppState token refresh, auth listener, providers
  mobile/src/
    components/ui/  # design system (Card, Button, Chip, Avatar, Stepper, Typography with auto-lineHeight, Row with children fix, etc.)
    components/VerificationBanner.tsx   # yellow nudge on home screens for unverified users
    lib/            # trpc.ts (401-retry fetch wrapper), errors.ts (PII-safe), supabase.ts, firebase.ts, push.ts, analytics.ts, distance.ts, sentry.ts (stubbed — Xcode 26 incompat)
    state/          # auth (Zustand, refreshAuthToken), role, userLocation
    theme/          # tokens + useTheme (locked to light mode)

packages/
  db/
    prisma/schema.prisma   # All models (User, DriverProfile, HostProfile, IdentityVerification, ShellDevice, Charger, Booking, ChargingSession, MeterValue, ChatThread, ChatMessage, Review, Payout, StripeWebhookEvent)
    sql/rls.sql            # Row-level security policies
    seed/                  # dev fixtures
  schemas/src/    # Zod source of truth: auth, booking, charger, chat, device, hardware, payment, review, enums
  config/         # env loader
  ui/             # shared UI copy strings

supabase/migrations/    # Postgis extensions, ShellDevice + IdentityVerification RLS
docker-compose.yml      # EMQX 5 broker (dev MQTT)
HARDWARE_INTEGRATION.md # Tier 1/2/3 hardware spec + procurement
TESTFLIGHT.md           # TestFlight upload playbook
CLAUDE.md               # engineering operating manual
BLOCKERS.md             # phase-gate verification recipes
AUDIT.md                # historical audit findings
.claude/plans/i-notice-that-many-crispy-volcano.md   # most recent pre-App-Store plan
```

---

## What works (don't re-audit; trust the unit tests)

- Auth: Firebase Admin SDK creds wired; email/password sign-in, phone OTP scaffold, Google, Apple Sign In all functional. Email-verification gate in `apps/api/src/trpc.ts` rejects unverified email accounts at every protected procedure (phone-auth accounts bypass since Firebase doesn't issue an email for those).
- Driver flow: profile → identity verification (Stripe Identity hosted page in SFSafariViewController) → map (real Postgis nearby query) → charger detail (real host rating via `review.summary`) → booking request (real Stripe pre-auth with `application_fee_amount` for the 15% platform fee, deterministic dev-bypass `pi_dev_<idempotencyKey>` IDs if no Stripe keys) → booking detail with 4s polling → live session (real per-kWh price from charger) → receipt (30s settle timeout fallback) → review.
- Host flow: identity → ID verification → charger identification (4-tier wizard) → Stripe Connect Express WebView → done → add charger (with map pin + gate code) → requests (real driver name + rating) → request detail (accept/decline with optimistic lock against auto-decline race) → live session monitoring → earnings (real 7-day rollup from `Payout`).
- Online/offline toggle per charger (`charger.setOnline`), with confirmation alert.
- Identity verification gates: `booking.requestBooking` (driver) and `charger.create` (host) throw `PRECONDITION_FAILED` if not verified. Dev-bypass auto-verifies for testing.
- Charger published recheck in `requestBooking` (race-window guard).
- Account deletion (`auth.deleteAccount`) cascades through Prisma + cancels in-flight Stripe PaymentIntents + deletes Stripe customer + rejects Stripe Connect account.
- Hardware integration: Tier 1 (smart plug) + Tier 2 (CT clamp) MQTT drivers, threshold detection for Tier 2, virtual OCPP adapter emits synthetic events into the same pipeline as real Tier 3 chargers. **Never field-tested with real hardware.**
- Settings: account, privacy/policies/terms placeholders, account deletion with double-confirm.
- Tests: 66 unit tests across 4 packages (worker 31, api 29, csms 7, mobile 2). All green.
- Typecheck: 9/9 packages clean.

---

## Current state of Stripe wiring

- **Test mode**, real keys in `.env`:
  - `STRIPE_SECRET_KEY=sk_test_…`
  - `STRIPE_PUBLISHABLE_KEY=pk_test_…`
  - `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`
  - `STRIPE_WEBHOOK_SECRET=whsec_…`
- `ENABLE_DEV_BYPASS=1` is set but **auto-disabled** when real keys are present (gated in `apps/api/src/lib/stripe.ts:devBypassStripe`)
- Webhook handler at `apps/api/src/webhooks/stripe.ts` covers 7 events:
  - `account.updated`, `payment_intent.{succeeded,canceled,amount_capturable_updated}`, `identity.verification_session.{verified,requires_input,canceled}`
  - Race-safe upsert dedup via `StripeWebhookEvent.processedAt`
- `stripe listen --forward-to localhost:3000/webhooks/stripe` for local webhook tunnel
- Stripe Identity is **activated in the dashboard** (Business + Application + Verify all green); branding + verification flows not customized
- Dev artifact recovery: code in `payment.ts ensureStripeCustomer`, `booking.ts requestBooking`, `auth.ts startHostOnboarding`, and `hostOnboardingStatus` all detect `cus_dev_*` / `pm_dev_card` / `acct_dev_*` placeholders left over from earlier dev-bypass sessions and replace them with real Stripe artifacts

---

## What's left to ship to TestFlight — broken down

### Tier A — User-only, blocks any TestFlight upload

| # | What | Where | Cost | Time |
|---|---|---|---|---|
| A1 | Paid Apple Developer Program | https://developer.apple.com/programs/enroll | $99/yr | 24h activation (individual) or 3-7d (LLC w/ D-U-N-S) |
| A2 | Decide individual vs LLC enrollment | — | — | Individual is instant; recommend that for v1 |
| A3 | Long-term Apple ID for App Store Connect | — | — | — |

### Tier B — User-only, blocks TestFlight functionality

| # | What | Recommended choice | Time | Cost |
|---|---|---|---|---|
| B1 | Public domain (ednacharge.com or similar) | Namecheap/Cloudflare | 5 min | $10-15/yr |
| B2 | Hosting for api + csms + worker | **Render** (one-click Node deploy, $0 hobby tier OK to start) | 30 min | $0-25/mo |
| B3 | Managed Postgres | **Supabase Cloud** (we already use Supabase locally — same schema works) | 10 min | $0 free, $25/mo Pro |
| B4 | Managed Redis | **Upstash** (free tier 10k cmds/day) | 5 min | $0 |
| B5 | MQTT broker decision | **Defer Tier 1/2 hardware for v1** — ship Tier 3-only first; HiveMQ Cloud or EMQX VPS later | — | $0 if deferred |
| B6 | Stripe business activation + Connect agreement | https://dashboard.stripe.com/account/onboarding | 1-3 day Stripe review | $0 |
| B7 | Expo account + `eas login` | https://expo.dev | 2 min | $0 |
| B8 | App ID registered at developer.apple.com with bundle ID `com.ednacharge.app` + Push Notifications + Sign in with Apple capabilities | https://developer.apple.com/account/resources/identifiers | 10 min | requires A1 done |
| B9 | App Store Connect app record | https://appstoreconnect.apple.com | 10 min | requires A1 + B8 done |
| B10 | APNs `.p8` auth key, uploaded to Expo via `eas credentials` | https://developer.apple.com/account/resources/authkeys/list | 15 min | requires A1 done |

### Tier C — User-only, blocks App Store submission (not internal TestFlight)

| # | What | Note |
|---|---|---|
| C1 | App icon 1024×1024 PNG | A placeholder exists at `apps/mobile/ios/EdnaCharge/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png`. No transparency, no rounded corners (iOS adds them). |
| C2 | Privacy policy URL on the public domain | Stripe template is a fine starting point |
| C3 | Terms of service URL | — |
| C4 | Support email + URL | — |
| C5 | App Store screenshots (6.7" + 6.5" iPhone sizes, ≥3 per size) | Can use simulator screenshots |
| C6 | Marketing description + keywords + category | Suggest category: Travel or Utilities |
| C7 | Age rating questionnaire (5 min in ASC) | Answer No to violence/sex/gambling questions |

### Tier D — Rotate before any public exposure

| # | What | Why | Time |
|---|---|---|---|
| D1 | Rotate Firebase Admin SDK private key | Current key is in committed `.env` | 5 min |
| D2 | Rotate Mapbox token + add bundle ID restriction | Bundled in IPA, abusable | 5 min |
| D3 | Scrub `.env` from git history | `git filter-repo --invert-paths --path .env` | 15 min |
| D4 | Subscribe Stripe live webhook to all 7 events | Required for live mode | 5 min once Stripe activated |

### Tier E — Developer work still to do (no user input needed)

These are tracked as tasks in the previous session — pick them up and finish:

- **#71 Photo upload (charger + profile)** — wire `expo-image-picker` + Supabase Storage. Adds `Charger.photoUrl` + `User.avatarUrl` UI. **Important for App Store screenshots looking professional**.
- **#72 Booking pagination** — convert booking list screens from `useQuery` to `useInfiniteQuery`. Server already returns cursor. Easy.
- **#73 Reviews UI: host rating driver** — host has no path to rate the driver after a session. Mirror the receipt-screen flow. Schema already supports both directions (`Review.authorId` + `subjectId`).
- **#74 Notifications screen wired to real data** — `(shared)/notifications.tsx` is probably a placeholder. Wire to a new `notification.list` server procedure that joins recent push events from the worker's notifications queue history (or a new `Notification` table).
- **#75 Support screen content** — `(shared)/support.tsx` is static. Add an FAQ, link to terms/privacy URLs (need C2/C3), link to support email (need C4).
- **#77 Sentry React Native upgrade** — current `@sentry/react-native@~5.24.3` is incompatible with Xcode 26 libc++ (Podfile has a profiling-disable patch as workaround). iOS has zero crash reporting. Try upgrading to v6.x or v7.x, remove the Podfile patch, restore real init in `apps/mobile/src/lib/sentry.ts` (currently no-op stubs).
- **#79 Reverse geocoding on add-charger** — Mapbox Geocoding API. Save typing for hosts.
- **#80 Phone number management UI** — settings row to add/edit/verify phone after signup. Firebase phone auth supports linking.
- **#81 Booking modification (edit start/end)** — add `booking.modify` tRPC mutation + UI on driver booking detail. Only allowed before host responds.
- **#85 Account deletion confirmation email** — after `auth.deleteAccount`, send "your account has been deleted" via Supabase Auth or SendGrid.

### Tier F — Known limitations / out of scope for v1

Don't try to "fix" these unless explicitly asked:

- Mobile Sentry — see #77, currently stubbed. Acceptable for v1 if documented in App Review notes.
- Tier 1 + Tier 2 hardware integration code is **complete but never field-tested**. Recommend shipping Tier 3-only for v1, adding Tier 1/2 after at least one real Shelly device is ordered + tested.
- Tier 2 contactor (Phase 3 of HARDWARE_INTEGRATION.md) — not built. Tier 2 is monitoring-only.
- Internationalization — English/USD/US-only.
- Dark mode — locked to light. Dark palette tokens exist but the UI was never tested in dark.
- Refunds / disputes UI — no UI; rely on Stripe dashboard for now.
- Multiple connectors per charger — schema is 1:1.
- Time zone edge cases — UTC ISO strings only; no DST awareness.
- Real-time admin/observability dashboard — none. Use Stripe + Supabase + Sentry dashboards.

---

## Files you'll touch most often

| Job | File |
|---|---|
| Add a tRPC procedure | `apps/api/src/routers/<area>.ts` |
| Add a worker job | `apps/worker/src/jobs/<job>.ts` + register in `apps/worker/src/index.ts` |
| Add a Stripe webhook handler | `apps/api/src/webhooks/stripe.ts` (new switch case) |
| Add a Zod schema | `packages/schemas/src/<area>.ts` + export from `index.ts` |
| Change DB schema | `packages/db/prisma/schema.prisma` then `prisma db push` then regenerate client |
| Add a screen | `apps/mobile/app/<group>/<name>.tsx`, register in nearest `_layout.tsx` if needed |
| Add an error-handler case | `apps/mobile/src/lib/errors.ts` |
| Tune a hardware driver | `apps/worker/src/drivers/shelly-plug.ts` or `shelly-em.ts` |

---

## Local development setup (sanity check before doing anything)

```bash
# Prereqs
brew install pnpm supabase/tap/supabase docker
node -v   # >= 20

# Boot infra
open -a Docker          # Docker desktop must be running
supabase start          # Postgres + auth + storage + realtime locally
docker-compose up emqx -d   # MQTT broker
redis-server --daemonize yes   # or brew services start redis

# Push schema + regenerate client
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres" \
  npx prisma db push --schema=packages/db/prisma/schema.prisma

# Boot services
pnpm --filter @edna/api dev    > /tmp/edna-api.log    2>&1 &
pnpm --filter @edna/csms dev   > /tmp/edna-csms.log   2>&1 &
pnpm --filter @edna/worker dev > /tmp/edna-worker.log 2>&1 &

# Verify
curl -s http://localhost:3000/healthz   # api
curl -s http://localhost:3100/healthz   # csms
curl -s http://localhost:3200/healthz   # worker

# Stripe webhook tunnel (separate terminal, keep running)
stripe listen --forward-to localhost:3000/webhooks/stripe

# iOS simulator
cd apps/mobile && pnpm expo run:ios
```

Common gotchas:
- Docker daemon on dev machine has been **flaky**. If `docker info` hangs, `pkill -9 -f "Docker Desktop"` + `pkill -9 -f "com.docker"` + delete sockets + `open -a Docker`.
- API process PID drift — kill via `lsof -i :3000 -P -sTCP:LISTEN` if needed.
- After any Prisma schema change, regenerate the client: `npx prisma generate --schema=packages/db/prisma/schema.prisma`. The API process must be **restarted** for the new client to load (tsx watch doesn't pick up node_modules changes).

---

## Tasks tracker

The previous session left 20 tracked tasks (most completed). The remaining
ones that still need work are in **Tier E** above. Use `TaskList` and
`TaskGet` in the new session to see the full state if any are still in the
queue.

---

## Recommended order of work for the new session

1. **Ask the user the questions in §Critical questions below** so you can plan around their decisions
2. **Finish Tier E developer tasks** (no user input needed) while waiting on their answers
3. **Hardening pass**: bring up the local stack, run all 66 tests, verify the simulator can complete a full driver flow (sign in → verify → save card → book → start → stop → receipt)
4. **Once user has answered Tier A-D**: deploy the API to their host of choice, wire up the production env in `eas.json`, build a real TestFlight IPA via `eas build --platform ios --profile production`, walk them through TestFlight invitation
5. **App Store listing prep** (Tier C) — write description, draft screenshots, fill the ASC form
6. **Submit for first external TestFlight review** — 24h Apple review for first external build

---

## Critical questions to ask the user first

Pick these up in your first reply. Don't start work without answers — these
shape everything downstream.

1. **Apple Developer Program enrollment**: are you enrolling as an
   individual or LLC? (LLC = need a D-U-N-S number, 1-5 days extra)
2. **Hosting**: do you have a preference between Render / Railway / Fly /
   Vercel for the API + worker + CSMS? If no preference, I'll recommend
   Render (simplest Node deploy story, free tier OK to start).
3. **Domain name**: do you already own a domain? If not, what name do you
   want? (Affects privacy policy URL, support URL, webhook endpoint URL.)
4. **Hardware tier scope for v1 launch**: ship Tier 3 OCPP-only first
   (recommended — no MQTT broker needed) or include Tier 1/2 with the
   smart plug provisioning flow (more user-facing complexity, never
   field-tested)?
5. **Identity verification**: stay with Stripe Identity (already wired,
   $1.50/check) or switch to Persona/Onfido? Default is Stripe Identity.
6. **App icon**: do you have a designed icon, or want me to use the
   current Expo placeholder for the first TestFlight build and swap
   later?
7. **Stripe live mode timing**: TestFlight can ship on test-mode Stripe.
   When do you want to flip to live mode — at TestFlight launch or only
   at public App Store launch?

---

## What I would do if I were you

If you want the fastest path to a reviewable TestFlight build:

**Day 1 (today)** — enroll in Apple Developer Program ($99). Buy a domain.
Sign up for Render + Supabase Cloud + Upstash + Expo. While waiting on
Apple, finish Tier E developer tasks (photo upload, reviews UI,
notifications screen wiring, support screen content, booking
pagination).

**Day 2** — Stripe business activation (submit + wait 1-3d). Deploy
api/worker/csms to Render. Point `EXPO_PUBLIC_API_URL` at the deployed
URL. Configure prod Stripe webhook endpoint. Run end-to-end on the
deployed stack.

**Day 3** — App Store Connect setup. Generate APNs key, upload to EAS.
Add yourself as Internal Tester. `eas build --platform ios --profile
production` → upload via `eas submit`.

**Day 4-5** — Test on a real device via TestFlight. Iterate on bugs.

**Day 6** — Submit to External TestFlight review (24h wait).

**Day 7** — External testers can install. Iterate based on their feedback
before App Store submission.

This puts a fully-working TestFlight build in friendly testers' hands
within a week. App Store full submission is another 1-2 weeks of
hardening after that.

---

## How to verify you understand the codebase

Before you start changing anything, sanity-check by:

1. Run `pnpm typecheck` — should be 9/9 packages clean.
2. Run `pnpm -r --filter @edna/worker --filter @edna/csms --filter @edna/api --filter @edna/mobile test` — should be 66 tests passing.
3. Read `apps/api/src/routers/auth.ts` (the longest router) and trace the
   identity-verification flow from `startIdentityVerification` → webhook
   handler in `apps/api/src/webhooks/stripe.ts` → DB row flip.
4. Read `apps/mobile/app/(shared)/identity-verification.tsx` to see the
   client side of that same flow (SFSafariViewController, polling, status
   transitions).
5. Read `HARDWARE_INTEGRATION.md` if you'll be touching Tier 1/2 code.

If any of those don't make sense, ask before changing code.

---

## Final caveat

The user is **prone to Docker daemon getting stuck**. If you hit
`Cannot connect to the Docker daemon`, hard-restart Docker before
trying anything else. It's a recurring issue on this machine.

Good luck. Make it ship.

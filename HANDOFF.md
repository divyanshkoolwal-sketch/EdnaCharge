# EdnaCharge — Project Handoff

> **For any Claude session / engineer picking up this project. Read top-to-bottom before doing anything.**
> Last updated: **2026-06-15**. The app is **live on iOS TestFlight** (build 9). Current focus: **fixing on-device UX/stability bugs found during real-device testing** (see §9 — this is your work queue).
> Secrets are NOT in this file. They live in gitignored `.env` files, the Render dashboard, and EAS secrets/credentials. Pointers below; never commit secrets.

---

## 0. TL;DR — where we are RIGHT NOW

EdnaCharge is a **peer-to-peer EV charging marketplace**. Drivers find nearby home chargers on a map, book a time, charge, and pay per-kWh; hosts list a charger and earn payouts (we take 15%).

- **v1 scope = OCPP Tier-3 chargers ONLY.** Tier 1/2 (Shelly smart-plug / CT-clamp) code still exists but is **out of the v1 product/UX**. Non-OCPP hosts → waitlist.
- **Backend is DEPLOYED + live on Render** (api + csms + worker), Supabase Postgres, Upstash Redis. Stripe is **LIVE mode** (real charges).
- **iOS is IN TESTFLIGHT.** Build 9 (v0.0.1) passed Apple processing and is `VALID` / installable. App Store Connect app: **"Edna Charge"**, ascAppId `6779337500`, bundle `com.ednacharge.app`.
- **Android**: first production AAB (versionCode 6) was on Google Play internal testing earlier; Android work is paused while iOS/UX is the focus.
- **Mobile is Expo SDK 52 / RN 0.76**, old architecture, **built on the Xcode 26 EAS image** (Apple now mandates the iOS 26 SDK — see §6).
- **NOW**: real-device testing surfaced 5 UX/stability bugs (§9). That is the immediate work. **The app crashes when switching host→driver — root-cause it, don't band-aid it.**

---

## 1. ⚠️ Branch reality (READ THIS — `main` is NOT the source of truth for iOS)

GitHub shows PRs #9 and #10 "merged", but the history is messier than that label implies:

- **`origin/main`** has **Expo SDK 52 / RN 0.76** (PR #9) + backend (anti-theft #6, legal #8) + Android config. It does **NOT** contain any of the iOS/TestFlight work.
- **`ios-testflight-prep`** (local + pushed to origin) = `main` + **8 commits** of all the iOS work that produced the working TestFlight build: config-plugin native setup, static frameworks, Xcode 26 image, icon/usage-string fixes, `eas.json` submit config. It is linear/clean on top of `main`.
- **The working TestFlight build 9 was built from `ios-testflight-prep`.** `main` currently cannot reproduce it.

**→ Do your work on `ios-testflight-prep`** (branch off it). When the dust settles, open a fresh PR `ios-testflight-prep → main` so `main` becomes the real source of truth again (the old #10 merged a stale early version into the already-merged `mobile-sdk52` branch, so it never reached `main`).

```
git checkout ios-testflight-prep && git pull   # this is your base
git checkout -b fix/<thing>                      # small PRs off it, reviewed by the owner
```

---

## 2. The live stack (deployed)

| Service | What | URL / location |
|---|---|---|
| `edna-api` | Fastify + tRPC public API | https://edna-api-mg34.onrender.com (`/healthz`, `/trpc`, `/webhooks/stripe`, `/privacy`, `/terms`, `/stripe/onboarding/*`) |
| `edna-csms` | OCPP 1.6 WebSocket central system | https://edna-csms.onrender.com (`/healthz`, `wss://…/ocpp/v1.6/:chargePointId`) |
| `edna-worker` | BullMQ workers (Stripe capture, push, auto-decline) | no inbound port |
| Postgres | Supabase Cloud | project `mrjadsvmibkhqyfqhkvh` |
| Redis | Upstash (TLS, `rediss://`) | via `REDIS_URL` |

- Deploy model: **`render.yaml` Blueprint, branch `main`, `autoDeploy: true`.** Push to `main` → Render redeploys. **Backend changes on a branch are NOT live until merged to `main`.**
- The mobile app's `EXPO_PUBLIC_API_URL` points at the Render API in all build profiles — so a local dev build talks to the **production** backend by default (handy for reproducing the §9 bugs without the full local stack).

---

## 3. Stack at a glance

- **Monorepo:** pnpm 10 + Turborepo 2, Node 20.
- **`apps/api`** — Fastify 4 + tRPC v11 + Prisma 5 + Zod. All user-facing reads/writes. tRPC `protectedProcedure` enforces an email-verified gate.
- **`apps/csms`** — Fastify + `ocpp-rpc`. Chargers connect via WSS `/ocpp/v1.6/:chargePointId` (HTTP Basic, bcrypt). Consumes `ocpp-commands` BullMQ queue.
- **`apps/worker`** — BullMQ: Stripe capture (`settle_session`), Expo push, 30-min auto-decline. (Tier 1/2 Shelly/MQTT drivers exist but are dormant in v1.)
- **`apps/mobile`** — **Expo SDK 52 / RN 0.76**, Expo Router (route groups `(auth)/(driver)/(host)/(shared)`), TanStack Query + tRPC client, Zustand, `@rnmapbox/maps@10.2.10` (pinned), `@stripe/stripe-react-native`, `@react-native-firebase/{app,auth}` + `firebase` JS SDK. **Styling is inline styles via a `src/components/ui` design system + `src/theme` tokens (NOT NativeWind, despite older docs).** Light mode only. **Mobile Sentry is STUBBED — no crash reporting (see §6, §9).**
- **Data/auth:** Supabase Postgres (PostGIS + pgcrypto + RLS) · Upstash Redis · **Firebase Auth** (server-verified via Firebase Admin) · **Stripe** (manual-capture PaymentIntents + Connect Express + Identity, LIVE mode).

---

## 4. Code layout (the parts you'll touch for §9)

```
apps/mobile/
  app/
    (auth)/      welcome, sign-in, phone, otp, driver-profile, pick-role
    (driver)/    map, charger/[id], request/[chargerId], booking/[id], session/[id], receipt/[id], bookings, chats, chat/[bookingId], profile
    (host)/      home, chargers, charger/[id], add-charger, requests, request/[id], earnings, chats, profile, host-onboarding/* (incl. the "Get Started" entry + Stripe Connect step)
    (shared)/    settings, payment-methods, notifications, support, identity-verification
    _layout.tsx  Root layout — auth listener, AppState token refresh, providers, role routing
  src/
    components/ui/   design system (Card, Button, Stepper, Typography, Row, …) — inline styles
    lib/             trpc.ts (401-retry fetch), errors.ts (PII-safe), supabase.ts, firebase.ts, push.ts, analytics.ts, sentry.ts (STUBBED no-op), distance.ts
    state/           auth (Zustand, refreshAuthToken), role (driver/host switch), userLocation
    theme/           tokens + useTheme (light only)
  app.json         static config (plugins incl. @react-native-firebase/app + expo-build-properties useFrameworks:static; ios.entitlements; infoPlist usage strings; expo.icon)
  app.config.js    dynamic overlay (Mapbox download token, googleServicesFile, Apple Sign In)
  eas.json         build/submit profiles; ios.image=macos-sequoia-15.5-xcode-26.0; submit has ASC API key + ascAppId
  GoogleService-Info.plist / google-services.json   Firebase native configs (committed at mobile root)
  credentials/AuthKey_*.p8   ASC API key (GITIGNORED)
apps/api/src/routers/   auth, booking, charger, chat, device, payment (Stripe Connect onboarding lives here), review
packages/db/prisma/schema.prisma   models (User, DriverProfile, HostProfile, Charger, Booking, ChargingSession, Payout, …)
```
> `apps/mobile/ios/` and `android/` are **gitignored** — EAS (and local `expo prebuild`) regenerate them from app config + config plugins. Never commit them; that's what stopped the iOS folder from going stale.

---

## 5. How the core flows work

- **OCPP connection:** Tier-3 hosts paste server URL + charge-point ID + password into their OCPP 1.6 charger; it opens a WSS to the CSMS, authenticates (bcrypt vs `Charger.ocppAuthHash`); CSMS stamps `Charger.ocppConnectedAt` ("Connected"). Credentials stored reversibly (pgcrypto). Only OCPP-configurable chargers work; cloud-locked consumer chargers → waitlist.
- **Anti-theft start:** driver taps **Start** → `booking.startSession` mints a one-time `Booking.ocppStartToken` (idTag) → enqueues `RemoteStartTransaction`. CSMS authorizes ONLY that token within a 15-min window. Unknown idTag → refused, nothing billed.
- **Metered billing:** charger `StartTransaction(meterStart)` → live `MeterValues` (Supabase broadcast to driver screen) → `StopTransaction(meterStop)`. Worker bills real kWh × price + 15% fee, captures `min(actual, pre-auth hold)` via Connect, writes a `Payout`. Plausibility cap guards rogue kWh; settle hard-fails in prod if Stripe unconfigured.
- **Chat** uses polling (anon Supabase client can't get RLS `postgres_changes`); **live meter** uses broadcast (bypasses RLS).
- **Payments:** manual-capture PaymentIntents + Connect Express (host payouts) + Identity (KYC). Webhook `/webhooks/stripe` (dual-secret, idempotent).

---

## 6. iOS build + release playbook (this all works now)

**Credentials live on EAS servers** (distribution cert, provisioning profile WITH Push + Apple-Sign-In capabilities, APNs push key). So routine builds/submits run **non-interactively from any shell**:

```bash
cd apps/mobile
# Build (Xcode 26 image is pinned in eas.json):
npx eas-cli build --platform ios --profile production --non-interactive --no-wait
# Submit a finished build to TestFlight (ASC API key + ascAppId are in eas.json):
npx eas-cli submit --platform ios --profile production --id <BUILD_ID> --non-interactive
```

Hard-won facts (do not regress these — full detail in project memory `ednacharge-ios-build.md`):
- **Apple mandates the iOS 26 SDK / Xcode 26** for all uploads (ITMS-90725). Fixed by `eas.json` → `build.production.ios.image = "macos-sequoia-15.5-xcode-26.0"`. **Expo SDK 52 / RN 0.76 compiles fine on Xcode 26 — no SDK upgrade needed.**
- **Firebase + RNMapbox linking:** uses `expo-build-properties` `ios.useFrameworks:"static"` (NOT global `use_modular_headers!`, which breaks RN 0.76 with "Redefinition of module ReactCommon"). `@react-native-firebase/app` config plugin injects `[FIRApp configure]`.
- **App icon must be opaque** (no alpha) or Apple rejects it. `expo.icon = ./assets/icon.png` is a flattened **placeholder** — swap before public App Store.
- **`NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription`** are set (Stripe Identity uses the camera).
- **Capability sync needs Apple-ID (cookie) auth, not the API key** — if you ever recreate the provisioning profile and it's missing entitlements, re-run `eas build` WITHOUT the `EXPO_ASC_*` env vars (uses the Keychain Apple ID `admin@ednacharge.com`).
- **Diagnosing Apple processing failures:** the ASC API does NOT expose rejection reasons. Read them from the Apple email (ITMS code) or App Store Connect → TestFlight → Build Uploads → click "Failed". A build that PASSED appears in `/v1/builds`; failed ones don't. (There's a working ASC-API JWT script pattern in memory: ES256 over the `.p8`, `dsaEncoding:'ieee-p1363'`.)
- **Apple account:** team `L5876Z5F62`, holder **"Gabrielle Jade Siy Wong (Individual)"** — owner has not explicitly confirmed this is the intended business account; flag before public launch.
- **Mobile Sentry is stubbed** (`src/lib/sentry.ts` is a no-op; `@sentry/react-native@5.x` had an Xcode-26 libc++ incompatibility). **There is currently NO crash reporting in the build** — this matters for §9's crash bug.

Add testers: App Store Connect → Users and Access (add the person) → TestFlight → Internal Testing group → add tester + assign build. Internal testing is instant (no review). Export compliance is pre-cleared (`ITSAppUsesNonExemptEncryption=false`).

---

## 7. Commands

```bash
pnpm typecheck     # 9 packages — keep 9/9 green
pnpm test          # vitest (api/csms/worker/mobile/db); db + api e2e skip without Supabase env (environmental, not a regression)
# Mobile dev build to reproduce on-device bugs (talks to the deployed Render API by default):
cd apps/mobile && npx expo run:ios       # or: npx expo start  (needs apps/mobile/.env with EXPO_PUBLIC_* — see eas.json env block for the values)
# Backend: push to main → Render autodeploys. curl https://edna-api-mg34.onrender.com/healthz
```

---

## 8. Known gotchas

- **Branch reality (§1).** Work on `ios-testflight-prep`.
- **`main` only redeploys backend** — mobile bug fixes don't need a backend deploy unless you change `apps/api`/`apps/csms`/`apps/worker`.
- **Native folders are gitignored** (EAS prebuilds them). To inspect generated native code locally: `npx expo prebuild -p ios --clean --no-install`.
- **EAS build logs are brotli-compressed** — decode with `zlib.brotliDecompressSync`.
- **`@rnmapbox/maps` pinned to 10.2.10** (10.1 fails RN 0.76; 10.3 needs RN ≥0.79).
- **DB password contains `@`** → URL-encode as `%40` in connection strings.
- **No mobile crash reporting** (Sentry stubbed) — to debug crashes you must reproduce on a dev build and read the Metro/Xcode console (§9).

---

## 9. ⭐ CURRENT WORK QUEUE — on-device bugs found in TestFlight (your job)

Found during real-device testing of build 9. **The owner's explicit instruction: go deep and fix the ROOT CAUSE / bottleneck of each — especially the crash — not the surface symptom, so these classes of bug don't recur.** Reproduce each on a real device or simulator first (a dev build pointed at the Render backend), capture the actual evidence, then fix and add a guard/test. Small PRs off `ios-testflight-prep`, owner reviews.

1. **Keyboard covers inputs/buttons → dead-end forms.** When typing, the keyboard hides the submit/continue button and there's no way to scroll to it or dismiss the keyboard → the user is stuck and can't proceed. **Root-cause fix:** a single reusable keyboard-aware screen/form wrapper (e.g. `KeyboardAvoidingView` + `ScrollView` with `keyboardShouldPersistTaps="handled"` + tap-to-dismiss) applied consistently to **every** input screen (auth, host-onboarding, add-charger, profile, chat) — not a one-off patch on the screen that happened to be reported. Verify on a real device (the simulator's hardware keyboard masks this).

2. **Mapbox map not working.** Reproduce and capture the exact symptom (blank tiles / crash / error). Likely root causes to check in order: `Mapbox.setAccessToken(EXPO_PUBLIC_MAPBOX_TOKEN)` is actually called before any `MapView` renders; the token is present in the build's env; the rnmapbox impl is initialized; iOS-specific framework loading under `useFrameworks:static`. Don't stop at "added the token" — confirm the map renders tiles on-device.

3. **Payout / Stripe Connect setup error.** The owner hit an error setting up payouts (host Connect onboarding). **The screenshot was not captured in this session — get the exact error text/screenshot from the owner OR reproduce the host payout-setup flow yourself.** Then trace it through `apps/api/src/routers/payment.ts` (Stripe Connect Express account + account links, the `/stripe/onboarding/return|refresh` routes) and the Render API logs. Watch for leftover `acct_dev_*` dev-artifact recovery paths and live-mode Connect agreement/capability issues.

4. **Host onboarding completion isn't persisted in the entry gate.** After completing host onboarding, switching to the driver side and tapping **"Become a Host"** again shows the "Get Started" page as if onboarding never happened. **Root-cause fix:** the host-entry gate must derive completion from **server truth** (e.g. `auth.hostOnboardingStatus` / HostProfile / active Connect account / has a Charger), not transient local state, and route a completed host straight to the host home. Make the check consistent across role switches.

5. **🔴 CRITICAL: app CRASHES when navigating Host page → Driver page.** Find the exact bottleneck — do **not** band-aid. There is **no crash reporting** (Sentry stubbed, §6), so: reproduce on a dev build (`expo run:ios`), capture the **actual stack trace** from the Metro red-box / Xcode console / device logs, identify the precise failing line (likely a null/undefined deref or bad assumption during the role/context switch, a query/hook, or router-group transition), fix the root cause, and add a guard + a regression test. **Mandate: after your fix, the app must not crash at any point during role switching.** Strongly consider un-stubbing mobile Sentry (was `@sentry/react-native` 5.x Xcode-26 incompat — try v6/v7) so future crashes are actually captured.

> General mandate for all 5: reproduce → capture real evidence → find the underlying cause → fix it at the root → prevent recurrence (shared component / server-derived state / guard + test). Be brutally honest about what you verified vs. assumed.

---

## 10. Remaining beyond §9 (not blocking, context)

- Merge `ios-testflight-prep → main` (fresh PR) so `main` is build-ready again.
- **Field-test the OCPP + anti-theft flow on the owner's real OCPP 1.6 charger** — still never validated on hardware.
- Swap the placeholder app icon before public App Store submission.
- External TestFlight / App Store review will need a **demo login account** (app is auth-gated + live Stripe) and store listing assets.
- Pre-public security: rotate Supabase + Firebase keys exposed during setup; swap dev Firebase (`ednacharge-a13d8`) for a prod project; custom domains (`endacharges.com` — note spelling vs `ednacharge.com`, unresolved); move Render off free tier (cold starts).

---

## 11. Working style for this project

Move fast and decisively — do the work now rather than deferring — but surface genuinely consequential or hard-to-reverse decisions before acting. **Be brutally honest: never claim something works unless you verified it; don't invent problems that aren't there.** Prefer small PRs off `ios-testflight-prep` that the owner reviews. Keep secrets out of committed files. Project memory lives at `/Users/divyanshkoolwal/.claude/projects/-Users-divyanshkoolwal/memory/` (`MEMORY.md` + `ednacharge-*.md`) — read it for launch decisions, stack facts, and the full iOS build history.

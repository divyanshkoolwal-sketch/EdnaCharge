# EdnaCharge — Project Handoff

> **For any agent/engineer picking up this project. Read top-to-bottom before doing anything.**
> Last updated: **2026-06-06**. Current focus: **Google Play Store launch (Android first)**, then Apple TestFlight (iOS).
> Secrets are NOT in this file (it's committed). They live in gitignored `.env` files, the Render dashboard, and EAS secrets — pointers below.

---

## 0. TL;DR — where we are RIGHT NOW

EdnaCharge is a **peer-to-peer EV charging marketplace**. Drivers find nearby home chargers on a map, book a time, charge, and pay per-kWh; hosts list their charger and earn payouts (we take 15%).

- **v1 scope = OCPP Tier-3 chargers ONLY.** Tier 1/2 (Shelly smart-plug / CT-clamp) code still exists in the repo but is **out of the v1 product/UX**. Non-OCPP hosts go to a waitlist.
- **Backend is DEPLOYED and live** on Render (api + csms + worker), verified healthy end-to-end (auth, Stripe live webhooks, OCPP encrypted credentials).
- **Mobile is on Expo SDK 52 / RN 0.76** (just upgraded from 51 — see §7). Old architecture (`newArchEnabled: false`).
- **First production Android AAB built green** via EAS and **uploaded to Google Play → Internal testing** (versionCode 6, targets API 35). AAB also saved at `~/Downloads/EdnaCharge.aab`.
- **Immediate state:** user is installing/smoke-testing the internal build on a real Android device. Next is App content + store listing → **Closed testing (≥12 testers, 14 days)** → apply for **Production**.
- **iOS/TestFlight:** still fully compatible, BUT the committed `apps/mobile/ios/` folder is **stale SDK 51** and must be regenerated for SDK 52 before any iOS build (see §11).
- **Never tested on real OCPP hardware** — the user HAS a real OCPP 1.6 charger to field-test with (incl. the new anti-theft flow).

---

## 1. Workspace + accounts

- **Repo root:** `/Users/divyanshkoolwal/Desktop/ednacharge`
- **GitHub:** `divyanshkoolwal-sketch/EdnaCharge` (use `gh`). Default branch `main`, `autoDeploy` to Render.
- **Expo/EAS:** account `divyansh.koolwal@berkeley.edu`, project `@divyanshkoolwal/ednacharge`, **projectId `d89941c0-17c0-48d4-8298-a7fd4a02a32d`** (in `apps/mobile/app.json` → `extra.eas.projectId`). EAS CLI is logged in on this Mac (via `npx eas-cli`).
- **Google Play Console:** app "Edna Charge" created; package **`com.ednacharge.app`**; an Internal testing release exists.
- **Firebase project:** `ednacharge-a13d8` (this is the **dev** project — must swap to a prod project before public launch). Android app `com.ednacharge.app` and an iOS app are both registered.
- **Supabase project ref:** `mrjadsvmibkhqyfqhkvh` (Postgres + PostGIS + pgcrypto).
- **Stripe:** **LIVE mode** (real charges). Connect Express + Identity + Payments.
- **Mapbox:** account `divyanshkoolwal` (the public `pk.` token in `eas.json` is theirs; a secret `Downloads:Read` token is an EAS secret — see §6).
- **Domain:** user wants **`endacharges.com`** (NOTE the spelling — codebase + the user's email use `ednacharge.com`; this discrepancy is unresolved). Custom domains are **NOT set up yet**; everything uses the onrender URLs below.

---

## 2. The live stack (deployed)

| Service | What | URL / location |
|---|---|---|
| `edna-api` | Fastify + tRPC public API | https://edna-api-mg34.onrender.com (`/healthz`, `/trpc`, `/webhooks/stripe`, `/privacy`, `/terms`, `/stripe/onboarding/*`) |
| `edna-csms` | OCPP 1.6 WebSocket central system | https://edna-csms.onrender.com (`/healthz`, `wss://…/ocpp/v1.6/:chargePointId`) |
| `edna-worker` | BullMQ workers (Stripe capture, push, auto-decline) | no inbound port |
| Postgres | Supabase Cloud | project `mrjadsvmibkhqyfqhkvh` |
| Redis | Upstash (TLS, `rediss://`) | via `REDIS_URL` |

- Deploy model: **`render.yaml` Blueprint**, branch `main`, `autoDeploy: true`. **Push to `main` → Render redeploys.** Build runs `pnpm install --frozen-lockfile && pnpm --filter @edna/db generate`; services run TS directly with `tsx` (no compile).
- Env: a shared group `edna-shared` (DATABASE_URL, REDIS_URL, SUPABASE_*, STRIPE_SECRET_KEY, OCPP_SECRET_ENC_KEY) + per-service vars. **All secrets are set in the Render dashboard (`sync: false`), not committed.** See `render.yaml` for the full list of keys.

---

## 3. Stack at a glance

- **Monorepo:** pnpm 10 + Turborepo 2, Node 20.
- **`apps/api`** — Fastify **4** (note: `@fastify/helmet@11`, `@fastify/rate-limit@9` — Fastify-5 versions break) + tRPC v11 + Prisma 5 + Zod. All user-facing reads/writes.
- **`apps/csms`** — Fastify + `ocpp-rpc`. Chargers connect via WSS at `/ocpp/v1.6/:chargePointId` (HTTP Basic auth, bcrypt). Consumes the `ocpp-commands` BullMQ queue for RemoteStart/Stop.
- **`apps/worker`** — BullMQ: Stripe capture (`settle_session`), Expo push, 30-min auto-decline. (Tier 1/2 Shelly/MQTT drivers exist but are dormant in v1.)
- **`apps/mobile`** — **Expo SDK 52 / RN 0.76**, Expo Router (file-based, route groups `(auth)/(driver)/(host)/(shared)`), TanStack Query + tRPC client, Zustand, `@rnmapbox/maps@10.2.10` (pinned), `@stripe/stripe-react-native`, `@react-native-firebase/{app,auth}` (native) **and** `firebase` (JS SDK). NativeWind is NOT used (inline styles). Old architecture.
- **Data/auth:** Supabase Postgres (PostGIS + pgcrypto + RLS) · Upstash Redis · **Firebase Auth** (server-verified via Firebase Admin) · **Stripe** (manual-capture PaymentIntents + Connect Express + Identity).

---

## 4. Code layout

```
apps/
  api/src/
    routers/      auth, booking, charger, chat, device, payment, review (tRPC)
    webhooks/stripe.ts   dual-secret verify (STRIPE_WEBHOOK_SECRET + _CONNECT), idempotent
    legal.ts      GET /privacy + /terms (static HTML) — store-required pages
    lib/          stripe.ts, firebase.ts, queues.ts, pricing.ts
    trpc.ts       createContext + protectedProcedure (emailVerified gate)
    index.ts      Fastify bootstrap (registers webhooks, legal pages, tRPC)
  csms/src/
    handlers/index.ts   OCPP 1.6 handlers + anti-theft authorizedBookingFor() (see §5)
    lib/ocpp-queue.ts   consumes 'ocpp-commands' → RemoteStart/Stop/Reset
    index.ts            WSS server + bcrypt auth + connection tracking (ocppConnectedAt)
  worker/src/jobs/settle-session.ts   metered billing + Stripe capture (clamps + plausibility cap)
  mobile/
    app/            Expo Router screens ((auth)/(driver)/(host)/(shared))
    app.json        static config (package, plugins, extra.eas.projectId, expo-build-properties→SDK35)
    app.config.js   dynamic overlay (spreads app.json; injects Mapbox download token; iOS googleServicesFile)
    eas.json        build/submit profiles + EXPO_PUBLIC_* env (committed; see §6)
    google-services.json   Firebase Android config (has com.ednacharge.app + legacy edna.charge)
    ios/            COMMITTED, STALE SDK 51 — regenerate before iOS build (§11)
packages/
  db/prisma/schema.prisma   Prisma schema (see §5 for Booking anti-theft fields)
  schemas/         Zod source of truth
supabase/migrations/        SQL migrations (apply via psql or prisma db push)
```

---

## 5. How the core flows work (accurate — a new agent should know these)

### OCPP connection (charger ↔ us)
Tier-3 hosts paste **server URL + charge-point ID + password** (shown in the app's "Connect your charger" card) into their OCPP 1.6 charger. The charger opens a **persistent WebSocket** to `wss://edna-csms.onrender.com/ocpp/v1.6/<id>` and authenticates via HTTP Basic (password → bcrypt-compared to `Charger.ocppAuthHash`). On connect the CSMS stamps `Charger.ocppConnectedAt` (app shows "Connected"). Credentials are stored **reversibly** (`Charger.ocppSecretEnc`, pgcrypto `pgp_sym_encrypt` keyed by `OCPP_SECRET_ENC_KEY`) so the host can re-view them without rotating; an explicit `charger.regenerateOcppCredentials` rotates them. **Compatibility:** only OCPP-1.6-configurable chargers (custom CSMS URL) — most consumer "app" chargers (Tesla, ChargePoint Home, Emporia) are cloud-locked and can't connect → waitlist.

### Anti-theft start authorization (added 2026-06-05 — energy only flows on an explicit tap)
1. Driver books → host accepts (`confirmed`).
2. Driver taps **Start** → `booking.startSession` (tier_3) **mints a one-time `Booking.ocppStartToken`** + stamps `Booking.ocppAuthorizedAt`, THEN enqueues `RemoteStartTransaction` with that token as the OCPP `idTag`.
3. CSMS `Authorize` + `StartTransaction` call **`authorizedBookingFor(chargerId, idTag)`** — accept ONLY if the token matches a booking on that charger within a **15-min window**; bind the session to that exact booking. Unknown/stale/replayed idTag → `Invalid` + `transactionId 0` (a compliant charger won't energize, nothing is billed). One session per booking (idempotent re-send; replay-after-end refused). `BootNotification` also pushes `ChangeConfiguration AuthorizeRemoteTxRequests=true` best-effort. This replaced the old "earliest confirmed booking" matching.

### Metered billing
Charger sends `StartTransaction(meterStart)` → `MeterValues` (live kWh broadcast to the driver screen via Supabase **broadcast**, which bypasses RLS) → `StopTransaction(meterStop)`. CSMS computes `finalKwh = meterStop − meterStart` (guarded ≥0) and enqueues `settle_session`. The worker bills **real kWh × host's per-kWh price + 15% fee**, **captures `min(actual, pre-auth hold)`** from the manual-capture PaymentIntent (estimate was pre-authorized at booking), splits 85% host / 15% platform via Connect, writes a `Payout`. A plausibility cap (powerKw × hours × 1.25 + 2) stops a rogue charger inflating kWh; settle hard-fails in prod if Stripe is unconfigured (no silent fund loss).

### `Booking` anti-theft schema fields (in `packages/db/prisma/schema.prisma`)
`ocppStartToken String? @unique` + `ocppAuthorizedAt DateTime?`. Migration `supabase/migrations/20260605000000_booking_ocpp_start_auth.sql` is **already applied to the prod DB**.

---

## 6. Mobile build config (eas.json / app config)

- `eas.json` build profiles `preview` (internal, apk) + `production` (store, app-bundle) carry **committed** `EXPO_PUBLIC_*` env (Supabase URL/anon, Firebase web config, Google client IDs, Sentry/PostHog, **Mapbox public `pk.` token**, `EXPO_PUBLIC_API_URL=https://edna-api-mg34.onrender.com`, **Stripe `pk_live_…`**). These are client-public values — OK to commit.
- Each profile has `"environment": "production"|"preview"` so **EAS environment variables** inject at build time. The **`RNMAPBOX_DOWNLOAD_TOKEN`** (secret Mapbox `sk.` token, `Downloads:Read`) is an **EAS secret** for `production`+`preview` (NOT in eas.json) — Android gradle needs it to fetch the Mapbox SDK. `app.config.js` injects it into the `@rnmapbox/maps` plugin.
- `app.json` plugin `expo-build-properties` pins **compileSdkVersion/targetSdkVersion 35** (Play requires API 35).
- `submit.production.ios` still has **placeholder** Apple values (`YOUR_APPLE_ID` etc.) — fill before `eas submit -p ios`. `submit.production.android` points at `./google-play-service-account.json` (gitignored; user must provide it from Play Console → Setup → API access) for `eas submit -p android`.
- **`apps/mobile/android/` is NOT git-committed** → EAS runs prebuild for Android, so all config-plugin changes apply. **`apps/mobile/ios/` IS committed** (stale SDK 51).

---

## 7. What changed this session (changelog)

- **Final pre-launch review fixes** (merged PR #5): receipt-screen blank (session→booking id), chat live-update via polling (anon Supabase can't get RLS postgres_changes), host "Open chat" route, **reversible OCPP credentials**, settle hard-fail in prod, modify-cancel idempotency key, logger over console.
- **Anti-theft OCPP start authorization** (PR #6, open) — §5.
- **Backend deployed to Render** + verified (auth, Stripe live, OCPP encrypted creds E2E, `CSMS_PUBLIC_URL` correct).
- **Android Play Store wiring** (PR #7, open): own Mapbox token; `RNMAPBOX_DOWNLOAD_TOKEN` EAS secret; eas.json android build/submit blocks; **EAS project created**; registered Firebase Android app `com.ednacharge.app` + new `google-services.json`; **Expo SDK 51 → 52 upgrade** (RN 0.76, old arch): removed stray `react-native-worklets`, removed SDK-51 pnpm patches + metro 0.80 overrides, `metro.config` dropped `disableHierarchicalLookup`, `useSegments() as string[]` fixes, **`@rnmapbox/maps` 10.1.31 → 10.2.10** (10.1 fails RN 0.76; 10.3 needs RN ≥0.79). Targets API 35 via `expo-build-properties`. First green AAB (versionCode 6).
- **Legal pages** (PR #8, open): `GET /privacy` + `/terms` served from the API (`apps/api/src/legal.ts`).

---

## 8. Branches & PRs

- **Current local branch: `android-play-config`** — HEAD has ALL the SDK 52 upgrade + Android config + Mapbox + google-services + projectId work. The latest green AAB was built from here. **You must be on a branch with a valid `eas.json` to run `eas` commands** (plain `main` still has the empty-string `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` that eas-cli v20 rejects, until PR #7 merges).
- **Open PRs (all should be merged into `main`):**
  - **#6 `ocpp-start-authorization`** — anti-theft (api/csms/schema). Prod DB columns already applied.
  - **#7 `android-play-config`** — Android config + SDK 52 upgrade (large). Merging makes `main` build-ready.
  - **#8 `legal-pages`** — `/privacy` + `/terms`. Merge → Render redeploys → privacy URL live (needed for Play "App content").
- **Already merged:** #3 `eas-build-config` (client env), #5 `final-review-fixes`.

---

## 9. Commands

```bash
# --- Android build (must be on android-play-config or after PR#7 merged) ---
cd apps/mobile && npx eas-cli build --platform android --profile production --non-interactive --no-wait
# Watch a build (status):
npx eas-cli build:view <BUILD_ID> --json
# EAS build LOGS are brotli-compressed. Get logFiles[0] from build:view --json, curl it, then:
#   node -e 'const z=require("zlib"),fs=require("fs");console.log(z.brotliDecompressSync(fs.readFileSync("log")).toString())'
# Submit to Play (needs apps/mobile/google-play-service-account.json):
npx eas-cli submit --platform android --profile production --latest

# --- Backend ---
git push origin main          # → Render autoDeploys api/csms/worker
curl -s https://edna-api-mg34.onrender.com/healthz
curl -s https://edna-csms.onrender.com/healthz
# DB migration: psql "$DATABASE_URL" -f supabase/migrations/<file>.sql   (DATABASE_URL in .env; @ in pw must be %40)
pnpm --filter @edna/db generate

# --- Quality gates ---
pnpm typecheck     # 9 packages
pnpm test          # vitest (api/csms/worker/mobile/db); e2e tests skip without Supabase env
```

---

## 10. TODO — path to launch

### Google Play (current focus)
1. **Smoke-test** the internal build on a real Android device (opt-in link in Play → Internal testing → Testers). Verify launch, Firebase sign-in, **Mapbox map** (token + rnmapbox changed), a booking, live session.
2. **Merge PR #8** → privacy URL live at `…onrender.com/privacy`.
3. **App content** (Monitor & improve → App content): privacy policy URL; **App access** (login-gated → give reviewers a test account); Ads = No; **Data safety** (declare location, name/email, financial via Stripe, app activity); content rating (Utility → Everyone); target audience **18+**; financial features = not a regulated product (payments for a real-world service, Play-Billing-exempt).
4. **Main store listing** (Grow users → store presence): name, short + full description (drafts were prepared in chat), 512 icon, feature graphic, screenshots.
5. **Closed testing** → add **≥12 testers**, runs **14 continuous days** (required for new personal accounts before production). Promote the internal build.
6. **Apply for production** → review → live.

### Apple TestFlight (after Android, or in parallel)
1. **Regenerate `apps/mobile/ios/` for SDK 52** (it's committed + stale SDK 51): delete `ios/` and `npx expo prebuild -p ios` (re-applies config plugins), or update natively. CocoaPods needs disk space (history of "no space left"); clear Xcode DerivedData if needed.
2. Fill `eas.json` → `submit.production.ios` with Apple Team ID + App Store Connect app id + Apple ID.
3. `eas build -p ios --profile production` → `eas submit -p ios` → TestFlight.

### Pre-public-launch (security/ops — do NOT skip before going public)
- **Rotate** the Supabase DB password + service_role key (pasted in chat during setup) and any other exposed secrets.
- **Swap dev Firebase (`ednacharge-a13d8`) → a prod Firebase project.**
- Set up **custom domains** (api/csms.endacharges.com) + DNS + TLS; then update `EXPO_PUBLIC_API_URL`, `CSMS_PUBLIC_URL`, in-app legal links.
- **Un-stub mobile Sentry** (no iOS/Android crash reporting currently).
- Consider moving Render off free/starter (cold starts).
- **Field-test the full OCPP + anti-theft flow on the user's real OCPP 1.6 charger** — never validated on hardware.

---

## 11. Known gotchas (read before debugging)

- **iOS folder is committed + stale.** `apps/mobile/ios/` is SDK 51; `apps/mobile/android/` is NOT committed (EAS prebuilds it). iOS builds will use stale native code until regenerated (§10).
- **EAS build logs are brotli-compressed** (not gzip/zstd) — decode with `zlib.brotliDecompressSync`.
- **eas-cli v20 rejects empty env values** in eas.json (that's why `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` was removed; Google Sign-In on Android is therefore OFF — email/password works).
- **Google Play requires targetSdk 35** → drove the SDK 52 upgrade (SDK 51's AGP 8.2.1 can't compile against 35).
- **Mobile uses native `@react-native-firebase` AND `firebase` JS SDK.** Native firebase needs `google-services.json` (Android) / `GoogleService-Info.plist` (iOS) matching `com.ednacharge.app`.
- **Mobile Supabase client is anon** (auth is Firebase, no Supabase session) → RLS-gated `postgres_changes` never deliver. Chat uses **polling** (`refetchInterval`); live meter uses **broadcast** (bypasses RLS).
- **`@rnmapbox/maps` is pinned exactly to 10.2.10** — do not let it drift to 10.3+ (needs RN ≥0.79).
- **pnpm patches + metro overrides were removed** during the SDK 52 upgrade (were SDK-51 workarounds; patch files still sit unused in `patches/`).
- **`StartTransaction` now requires the minted idTag** (anti-theft) — the OCPP simulator must send `RemoteStartTransaction`'s idTag back, or use the booking's `ocppStartToken`.
- **DB password contains `@`** → must be URL-encoded as `%40` in connection strings.
- **Render builds from `main`.** Backend changes on a branch aren't live until merged.

---

## 12. How to verify you understand the codebase

- `pnpm typecheck` → 9/9 clean. `pnpm test` → csms/worker/api/mobile pass (db + api e2e skip without Supabase env).
- `curl https://edna-api-mg34.onrender.com/healthz` and `…/privacy` (after PR #8 merged) respond.
- You can explain: how a charging session is authorized + metered + billed (§5), why chat polls instead of subscribes, and why the iOS folder needs regenerating but Android doesn't.

---

## 13. Working style for this project

The owner moves fast and wants decisive execution — do the work now rather than deferring, but surface genuinely consequential decisions (e.g., framework upgrades, anything hard to reverse or with real cost). Be brutally honest: never claim something works if it wasn't verified; flag real risks plainly; don't invent problems that don't exist. Prefer small PRs off `main` that the owner reviews. Keep secrets out of committed files.

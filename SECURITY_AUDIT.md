# EdnaCharge — Pre-Production Security & DevOps Audit

Date: 2026-05-29. Method: code/config verified directly (file:line), git history scanned, `pnpm audit` run, three independent code traces, all findings re-verified by hand. Brutally honest — overstated agent findings were corrected (noted inline).

Baseline after fixes: **typecheck 9/9**, tests **csms 7 / worker 31 / mobile 2 / api 29** pass (the one red api test is `session.e2e.test.ts`, which needs a running Supabase Postgres — environmental, not a code defect).

---

## PHASE 0 — Architecture map

**Stack:** pnpm 10 + Turborepo monorepo, Node 20, TypeScript.
- `apps/api` — Fastify + tRPC v11 + Prisma 5. Public API for the mobile app. Auth via Firebase Admin (Bearer ID token). Stripe (Payments + Connect Express + Identity) + webhook receiver.
- `apps/csms` — Fastify + `ocpp-rpc`. WebSocket `wss://…/ocpp/v1.6/:chargePointId` for OCPP 1.6 chargers; HTTP Basic auth (bcrypt). Consumes `ocpp-commands` queue.
- `apps/worker` — BullMQ jobs: Stripe capture/settle, push fanout, 30-min auto-decline, (Tier 1/2 Shelly/MQTT — not in v1 UX).
- `apps/mobile` — Expo SDK 51, Expo Router, tRPC client, Firebase Auth, Stripe RN, Mapbox.
- **Data:** Postgres (Supabase) + PostGIS + RLS; Redis (BullMQ).
- **Entry points:** tRPC procedures (7 routers: auth, booking, charger, chat, device, payment, review — all behind `protectedProcedure` except `/healthz`); `POST /webhooks/stripe`; `GET /stripe/onboarding/{return,refresh}`; CSMS websocket upgrade + 7 OCPP handlers.
- **Secrets loaded from:** `process.env` only (see `LAUNCH_REQUIREMENTS.md` for the full inventory). Client (Expo) gets only `EXPO_PUBLIC_*`.

**Unexpected during recon (flagged, not silently changed):**
1. Domain mismatch — you said `endacharges.com`; the codebase + `eas.json` use **`ednacharge.com`** everywhere.
2. Mobile hardcoded the **dev** Firebase project as a fallback (fixed).

---

## 1. CRITICAL — fixed

### C1 · `charger.get` leaked the OCPP auth secret + gate code, and returned delisted chargers (IDOR)
`apps/api/src/routers/charger.ts` `get` returned `{ ...c }` — the **full** Charger row — to any authenticated user for any charger id. That included `ocppAuthHash` (the bcrypt secret a charger authenticates with) and `gateCode` (the property access code), and had **no published/owner check**, so a delisted charger's details leaked to anyone with the id.
**Fix:** strip `ocppAuthHash`/`ocppConnectedAt`/`gateCode`; throw `NOT_FOUND` for an unpublished charger unless the caller is the owner. (charger.ts `get`)

### C2 · Mobile shipped the DEV Firebase project as a hardcoded fallback
`apps/mobile/src/lib/firebase.ts:25` defaulted `apiKey`/`projectId`/… to the dev project `ednacharge-a13d8`. Because the fallback was non-empty, the "missing config" guard never fired — a production build missing `EXPO_PUBLIC_FIREBASE_*` would **silently authenticate against the dev Firebase project**.
**Fix:** removed all hardcoded fallbacks; `firebaseConfigError()` now fails loudly at boot if env is missing.

### C3 · Production binary defaulted the API base to `http://localhost:3000`
`apps/mobile/src/lib/trpc.ts` and `src/lib/push.ts` fell back to `http://localhost:3000` if `EXPO_PUBLIC_API_URL` was unset — a misbuilt prod IPA would hit the device itself over cleartext and every call would fail.
**Fix:** localhost fallback is now `__DEV__`-only; production throws (trpc) / no-ops (push) instead of silently misrouting.

---

## 2. HIGH — fixed

- **H1 · No security headers.** Added `@fastify/helmet` (X-Content-Type-Options, HSTS, X-Frame-Options, …; CSP off — JSON API). `apps/api/src/index.ts`
- **H2 · No rate limiting** (brute-force / scraping / abuse of the PostGIS `nearby` scan). Added `@fastify/rate-limit` 300/min per IP. `apps/api/src/index.ts`
- **H3 · Dev-auth bypass forgeable on misconfig.** `apps/api/src/lib/firebase.ts:37` mints `dev.<payload>.<sig>` tokens with a **known default HMAC secret**. Production already hard-disables it (`NODE_ENV==='production'`), so the real risk was *misconfiguration*. **Fix:** the API now **refuses to boot** in production if `ENABLE_DEV_BYPASS`/`FIREBASE_AUTH_DEV_BYPASS` is set. (Kept the default secret so e2e tests still run — see "needs decision" for staging.)
- **H4 · Unused permissions → App Store rejection.** App declared camera, photo-library, photo-add, user-tracking (iOS) and CAMERA + storage (Android) but **no code uses any of them** (Stripe Identity runs in Safari, photo upload #71 isn't built). **Fix:** removed from `app.json` + native `Info.plist`. ⚠️ Re-add camera/photo when photo upload (#71) ships.
- **H5 · Unjustified "Always" location.** App only uses when-in-use. **Fix:** removed `NSLocationAlways*`; `expo-location` plugin set to when-in-use + background disabled.
- **H6 · Expo push fetch had no timeout** → a hung endpoint blocks a worker job slot. **Fix:** 10s `AbortController`. `apps/worker/src/jobs/notifications.ts`

---

## 3. MEDIUM

- **M1 · `chat.getThread` loaded unbounded messages** — FIXED (latest 200, returned ascending). `apps/api/src/routers/chat.ts`
- **M2 · `charger.myChargers` unbounded** — FIXED (`take: 100`).
- **M3 · CORS `origin: true`** (reflects any origin). Lower risk than it looks — the API uses Bearer tokens, **not cookies**, so there's no ambient-credential CSRF. FIXED anyway: env allowlist (`CORS_ORIGINS`), deny cross-origin in production.
- **M4 · Metered kWh is charger-reported and trusted.** A rogue/compromised Tier-3 charger could report inflated energy. Already clamped to the pre-auth; ADDED a physical-plausibility cap (`powerKw × hours × 1.25 + 2`) in `settle-session.ts`. Threshold + a real dispute/refund flow are a **decision** (dispute UI is out of v1 scope per CLAUDE.md §10).
- **M5 · `auth.getSession` over-fetches** — returns the full user + `identityVerification` (verified DOB/address/doc last-4) + `stripeCustomerId` + `expoPushToken` to the client. It's the caller's *own* data (not cross-user), so not an IDOR, but it's more PII than the UI needs. **FLAGGED** (needs a usage trace before trimming the `select`, to avoid breaking the app).

---

## 4. LOW / informational

- **Firebase ID/refresh token stored in `AsyncStorage`** (`apps/mobile/src/lib/firebase.ts:58`, unencrypted) — this is the standard Firebase-JS-SDK RN behavior. Supabase tokens are correctly in `expo-secure-store`. **Decision below.**
- **`StripeWebhookEvent` grows unbounded** — add a nightly prune (>90d). Operational, not security.
- **PaymentIntent metadata** includes `ednaUserId`/`chargerId` — visible only to holders of your Stripe dashboard/keys. Acceptable; could slim to booking id.
- **Committed client config:** `apps/mobile/ios/EdnaCharge/GoogleService-Info.plist` + the Google OAuth client-id URL scheme are the **dev** Firebase/Google project. Firebase web/iOS keys are public-by-design, but you must **swap to the prod project** before submission and restrict the key in console.
- **`CREDENTIALS.txt`** is a blank checklist template (no real values) — safe, but delete before open-sourcing.

### Corrected agent overstatements (verified false / lower):
- **No real `.env` was ever committed** — verified across all of git history (`git log --all --diff-filter=A`); only `.env.example` + the benign `.xcode.env`. The HANDOFF's "key in committed .env" is **not** the current state. (The local dev `.env` is gitignored.)
- **OCPP password is not brute-forceable** — it's 24 random bytes (192-bit). The real CSMS risk is connection-flooding (handle at the load balancer/infra), not credential guessing.
- **`review.forUser`/`review.summary` and `requestBooking` are not IDOR** — reviews are public by design (RLS `reviews_read_any`); any verified driver booking any published charger is the intended flow.

### Dependency audit (`pnpm audit`): 0 critical, 22 high, 21 moderate, 4 low
Nearly all are **build/dev-toolchain**, not shipped at runtime: `esbuild`, `vite`, `postcss`, `@babel/*`, `protobufjs`, `@xmldom/xmldom`, `fast-xml-parser`, `tar`, `turbo`. Runtime-relevant ones to address: **`fastify`** (Content-Type DoS — `pnpm update fastify` to the patched line) and **`ws`** (used via `ocpp-rpc`; moderate memory disclosure — track upstream). None are critical; none block TestFlight. Recommend a `pnpm update` pass + re-audit before public launch.

---

## 5. IDOR matrix (verified by hand, all routers)

All resource-by-id procedures enforce ownership/party checks: `charger.update/unlist/setOnline/connectionStatus/ocppCredentials` (hostId), `booking.modify/respond/cancel/start/stop/get/bySessionId` (party), `chat.*` (thread party), `payment.setDefault` (customer match), `device.*` (hostId), `review.create/mine` (party/author). The **only** gap was `charger.get` (C1) — now fixed. Auth: every procedure except `/healthz` is behind `protectedProcedure`; the email-verification gate is enforced centrally in `trpc.ts`. Passwords: Firebase-managed; OCPP secrets bcrypt(cost 10). Raw SQL: only `charger.nearby`, fully parameterized (verified). No file upload / SSRF / command-exec surface found.

---

## 6. What needs YOUR decision

1. **Domain spelling** — `endacharges.com` vs `ednacharge.com` (codebase uses the latter). I did **not** change configs pending your answer.
2. **Firebase token storage** — accept `AsyncStorage` (low-ish: 1h ID token + refresh token, device-physical-access threat), or switch to `@react-native-firebase` native (Keychain-backed) — a larger change.
3. **Mobile crash reporting** — `@sentry/react-native` is currently **stubbed** (no iOS crash reporting). Ship v1 with it documented in App Review notes, or prioritize the Sentry upgrade (#77)?
4. **Meter-fraud policy** — the plausibility cap + pre-auth clamp bound loss, but there's no dispute/refund UI (out of v1 scope). Confirm that's acceptable for launch.
5. **Photo upload (#71)** — keep it out of v1? (I removed camera/photo permissions; re-add when it lands.)
6. **Prod Firebase + Google OAuth project** — provide prod `GoogleService-Info.plist` + client IDs (see LAUNCH_REQUIREMENTS §4).
7. **Secret rotations** — approve rotating the dev Firebase key + Mapbox token, and standing up the **prod** Stripe live webhook (LAUNCH_REQUIREMENTS §9).

---

## 7. Pre-launch checklist

**Code (done):**
- [x] No secret leakage in `charger.get`; unpublished-charger IDOR closed
- [x] No hardcoded dev-Firebase / localhost fallbacks in shipped build
- [x] Security headers (helmet) + rate limiting
- [x] Prod boot guard against dev-auth bypass
- [x] Unused permissions removed; when-in-use location only
- [x] Bounded chat history + myChargers; push fetch timeout; meter plausibility cap

**Before TestFlight:**
- [ ] Set `NODE_ENV=production`, real `STRIPE_*`, `FIREBASE_*`, `DATABASE_URL`, `REDIS_URL`, `CSMS_PUBLIC_URL`, `EXPO_PUBLIC_*` on Render/EAS (never `ENABLE_DEV_BYPASS`)
- [ ] Swap to **prod** Firebase + Google OAuth project; restrict the Firebase key + Mapbox token in console
- [ ] Register the **live** Stripe webhook (7 events) + set `STRIPE_WEBHOOK_SECRET`
- [ ] `prisma db push` + apply `supabase/migrations/*` to prod DB
- [ ] Confirm `eas.json` `EXPO_PUBLIC_API_URL` matches the real (confirmed) domain
- [ ] `pnpm update fastify` + re-run `pnpm audit`

**Before public App Store submission:**
- [ ] Real 1024² app icon; screenshots; privacy nutrition label; privacy/terms URLs
- [ ] Decide Sentry (mobile crash reporting) story
- [ ] Confirm meter-fraud / no-dispute-UI posture is acceptable

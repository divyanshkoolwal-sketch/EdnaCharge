# What I need from you — EdnaCharge launch

Everything blocking the production deploy + App Store submission, grouped. Tick the box when done.
🔒 = a secret: put it in Render's env / a local `.env` you control. **Do not paste secret keys into chat.** Non‑secret values (publishable keys, project IDs, domain) are fine to send.

---

## 0. Confirmations (1 minute)
- [ ] **Domain spelling**: `endacharges.com` or `ednacharge.com`? (Bundle id is `com.ednacharge.app`.) Drives API/CSMS/webhook/privacy/support URLs + Apple Associated Domains.
- [ ] **Legal seller name** for the App Store (your individual name, since enrolling as individual).
- [ ] **Support email** (e.g. support@<domain>) — required by Apple + shown in‑app.

## 1. Apple (Tier A/B) — needed for any TestFlight build
- [ ] Apple Developer Program **individual enrollment** active (24h after paying $99).
- [ ] **Apple Team ID** (App Store Connect → Membership). *(non‑secret)*
- [ ] App Store Connect API key (Issuer ID + Key ID + `.p8`) **or** an app‑specific password, for `eas submit`. 🔒
- [ ] **APNs auth key**: create at developer.apple.com → Keys → enable Apple Push Notifications, download the `.p8` (note Key ID). 🔒 — needed for push.
- [ ] Confirm bundle id `com.ednacharge.app` (or tell me the one you want).

## 2. Stripe — LIVE mode (you chose full live)
- [ ] **Business activation complete** at dashboard.stripe.com/account/onboarding (charges + payouts enabled). Stripe review is 1–3 days.
- [ ] **Connect Express** enabled in **live** mode.
- [ ] **Stripe Identity** enabled in **live** mode (≈$1.50/verification).
- [ ] `pk_live_…` publishable key — *(safe to send)*.
- [ ] `sk_live_…` secret key 🔒 → set as `STRIPE_SECRET_KEY` in Render.
- [ ] Webhook: I'll register `https://api.<domain>/webhooks/stripe` with the 7 events; you copy the **signing secret** `whsec_…` 🔒 → `STRIPE_WEBHOOK_SECRET` in Render.

## 3. Hosting / infrastructure (Render path)
- [ ] Is this repo on **GitHub**? Render deploys from a repo — give me the remote, or I'll help you push it.
- [ ] **Render** account (free tier OK to start). I author `render.yaml`; you connect the repo.
- [ ] **Supabase Cloud** prod project. Send: project URL *(non‑secret)*, `anon` key *(client‑safe)*, `service_role` key 🔒, and the **pooled** + **direct** `DATABASE_URL` 🔒.
- [ ] **Upstash Redis** (free tier). Send `REDIS_URL` 🔒.
- [ ] **DNS access** for the domain (or add records I specify): `api.` and `csms.` subdomains.

## 4. Firebase (auth) — prod project
- [ ] New **service‑account JSON** 🔒 (Firebase console → Project settings → Service accounts → Generate key). I'll **rotate** the currently‑committed key as part of this.
- [ ] Web/app config for mobile *(client‑safe, but I'll restrict in console)*: `EXPO_PUBLIC_FIREBASE_` apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId.
- [ ] **Google OAuth** client IDs (web + iOS) + iOS URL scheme → `EXPO_PUBLIC_GOOGLE_*`.
- [ ] Enable sign‑in providers: Email/Password, Google, Apple, Phone.

## 5. Mapbox
- [ ] A Mapbox token → `EXPO_PUBLIC_MAPBOX_TOKEN`. I'll add a bundle‑id restriction (current token should be rotated — it's bundled in the IPA).

## 6. Error tracking (strongly recommended before public launch)
- [ ] Sentry DSNs for `api`, `csms`, `worker` 🔒 (server) + the mobile DSN. Or say "skip for v1" and I'll document it in App Review notes. *(Mobile Sentry is currently stubbed — see audit #77.)*

## 7. Analytics (optional)
- [ ] PostHog `EXPO_PUBLIC_POSTHOG_KEY` + host, or "skip".

## 8. App Store listing assets (Tier C — needed for public submission, not internal TestFlight)
- [ ] App icon 1024×1024 PNG (using placeholder for first build; provide before public submission).
- [ ] Screenshots — I can generate these from the simulator; confirm that's OK.
- [ ] Marketing **description**, **keywords**, **category** (suggest Travel or Utilities).
- [ ] **Privacy policy URL** + **Terms URL** (I can host on the domain; Stripe template is a fine base).
- [ ] Age‑rating questionnaire answers (all "No" for violence/sex/gambling).
- [ ] App Store **privacy nutrition label** data: confirm we collect — email, name, ID‑verification data (via Stripe), location (for map), payment (via Stripe). I'll draft; you confirm.

## 9. Security rotations — please approve (I'll do the work)
- [ ] Rotate the **committed Firebase private key** (it's in git history).
- [ ] Rotate the **Mapbox token** + add bundle‑id restriction.
- [ ] Scrub `.env` from **git history** (`git filter-repo`).
- [ ] Subscribe the **live** Stripe webhook to all 7 events.

---

### Fastest unblock order
1. §0 (domain) + §1 (Apple enrollment + Team ID).
2. §2 (Stripe live activation + keys) — gates real payments.
3. §3 (GitHub + Render + Supabase + Upstash) — gates deploy.
4. §4–§5 (Firebase + Mapbox prod config + rotations).
5. §8 listing assets — for the public App Store step after TestFlight.

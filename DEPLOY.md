# EdnaCharge — Production deploy runbook

End-to-end: provision infra → set secrets → deploy backend (Render) → build + ship iOS (EAS/TestFlight). Secret *sources* are in `LAUNCH_REQUIREMENTS.md`; this is the *how*.

> Domain is **`endacharges.com`** (confirmed). `<domain>` = `endacharges.com` throughout. Bundle id stays `com.ednacharge.app`.

## 0. Prerequisites
- Repo on GitHub: `github.com/divyanshkoolwal-sketch/EdnaCharge` ✓
- Accounts: Render, Supabase, Upstash, Stripe (live-activated), Firebase (prod project), Mapbox, Apple Developer (individual), Expo.

## 1. Provision data stores
1. **Supabase Cloud** → new project. Copy: Project URL, `anon` key, `service_role` key, and the **pooled** connection string (`DATABASE_URL`, `...pooler...:6543`) + the **direct** one (for migrations).
2. **Upstash Redis** → new database → copy the `rediss://` URL (`REDIS_URL`).

## 2. One-time DB setup (run locally against prod, using the DIRECT DATABASE_URL)
```bash
# schema (additive; no migrations dir — we use db push)
DATABASE_URL="<supabase DIRECT url>" pnpm -F @edna/db push
# extensions + RLS + the OCPP/waitlist migration:
#   easiest: link the Supabase project and push the SQL migrations
supabase link --project-ref <ref> && supabase db push
#   (or apply packages/db/sql/rls.sql + supabase/migrations/*.sql manually)
# optional demo data:
DATABASE_URL="<supabase DIRECT url>" pnpm -F @edna/db seed
```

## 3. Deploy backend (Render Blueprint)
1. Render → **New → Blueprint** → connect the GitHub repo → it reads `render.yaml` and creates `edna-api`, `edna-csms`, `edna-worker` + the `edna-shared` env group.
2. Fill the **`edna-shared`** group (entered once): `DATABASE_URL` (pooled), `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY` (`sk_live_…`).
3. Fill the per-service `sync:false` vars:
   - **edna-api**: `FIREBASE_SERVICE_ACCOUNT_JSON` (one-line JSON), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `API_URL=https://api.<domain>`, `CSMS_PUBLIC_URL=wss://csms.<domain>`, `SENTRY_DSN_API` (or blank), `CORS_ORIGINS` (blank = deny cross-origin).
   - **edna-csms**: `SENTRY_DSN_CSMS` (or blank).
   - **edna-worker**: `STRIPE_WEBHOOK_SECRET`, `SENTRY_DSN_WORKER` (or blank).
   - **NEVER set `ENABLE_DEV_BYPASS` / `FIREBASE_AUTH_DEV_BYPASS`** — the API refuses to boot in prod if they're set.
4. Deploy. Verify: `curl https://edna-api.onrender.com/healthz` and `…edna-csms…/healthz` return `{status:"ok"}`.

## 4. Custom domains + DNS
- Render → edna-api → Settings → Custom Domain → `api.<domain>` → add the CNAME it shows.
- Render → edna-csms → Custom Domain → `csms.<domain>` → add CNAME.
- After DNS verifies (TLS auto), set `API_URL`/`CSMS_PUBLIC_URL` (above) to the custom domains and redeploy api.

## 5. Stripe (live)
1. Activate the account; enable **Connect Express** + **Identity** in live mode.
2. Webhooks → Add endpoint `https://api.<domain>/webhooks/stripe` → select the 7 events: `account.updated`, `payment_intent.{succeeded,canceled,amount_capturable_updated}`, `identity.verification_session.{verified,requires_input,canceled}`. Copy the signing secret → set `STRIPE_WEBHOOK_SECRET` on api + worker.
3. Send a test event → confirm a 200.

## 6. Mobile build + TestFlight (EAS)
1. `EXPO_PUBLIC_API_URL` is set per profile in `eas.json` (preview→staging, production→`https://api.<domain>`). Confirm it matches your domain.
2. Set the remaining **client-public** build vars as EAS environment variables (or in `eas.json` `env`): `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_live_…`), `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_FIREBASE_*` (apiKey/authDomain/projectId/storageBucket/messagingSenderId/appId — from the **prod** Firebase project), `EXPO_PUBLIC_GOOGLE_*`, `EXPO_PUBLIC_MAPBOX_TOKEN`. (No hardcoded fallbacks remain, so a missing var now fails the build loudly — by design.)
3. Replace `apps/mobile/ios/EdnaCharge/GoogleService-Info.plist` + the Google OAuth URL-scheme in `Info.plist`/`app.config.js` with the **prod** project's values; run `npx expo prebuild --clean` if you change native config.
4. Fill `eas.json` → `submit.production.ios`: `appleId`, `ascAppId`, `appleTeamId`.
5. Credentials: `eas login`; `eas credentials` → add the APNs `.p8` key for push.
6. Build + submit:
   ```bash
   cd apps/mobile
   eas build --platform ios --profile production
   eas submit --platform ios --profile production --latest
   ```
7. App Store Connect → TestFlight → add yourself as Internal Tester → install. (External testing needs a one-time ~24h Apple review.)

## 7. Live OCPP charger (your real unit)
In the charger's OCPP settings: protocol **OCPP 1.6J (WebSocket)**, Central System URL = the `Server URL` shown in the app's "Connect your charger" card (`wss://csms.<domain>/ocpp/v1.6/<id>`), Charge Point ID + password from the same card. The card flips to **Connected** within a few seconds of the charger dialing in.

## 8. Smoke test (prod)
Sign up (email) → verify email → save a card → book a charger → (host) accept → start session (RemoteStart to the charger) → see live kWh → stop → receipt shows captured amount → Stripe dashboard shows the PaymentIntent captured + a Connect transfer to the host.

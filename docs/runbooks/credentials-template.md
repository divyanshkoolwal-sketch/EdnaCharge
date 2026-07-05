# Credentials Template

This is a sanitized checklist. Do not paste real values into this file.

Copy `.env.example` to `.env` for local development and fill real values there.

## Local

- `DATABASE_URL`
- `REDIS_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OCPP_SECRET_ENC_KEY`
- `CSMS_PUBLIC_URL`

## Auth (Supabase)

Authentication uses the existing Supabase project — no separate auth credentials.

- Server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already listed under Local;
  used for Auth token verification plus Storage/Realtime).
- Mobile: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Local dev bypass: `ENABLE_DEV_BYPASS=1` signed with `AUTH_DEV_SECRET`.

## Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_WEBHOOK_SECRET_CONNECT`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## Mobile / Push / Analytics

- `EXPO_PUBLIC_MAPBOX_TOKEN`
- `MAPBOX_TOKEN`
- `POSTHOG_KEY`
- `EXPO_PUBLIC_POSTHOG_KEY`
- Expo push credentials
- Apple APNs key for push notifications
- EAS/App Store Connect credentials

## Sentry

- `SENTRY_DSN_API`
- `SENTRY_DSN_CSMS`
- `SENTRY_DSN_WORKER`
- `SENTRY_DSN_MOBILE`
- `EXPO_PUBLIC_SENTRY_DSN`

## Rules

- Real values go in local secret stores, `.env`, EAS secrets, Render/Supabase/Stripe dashboards, or vaults.
- Do not commit `CREDENTIALS.txt`.
- Do not commit downloaded `.p8`, `.p12`, `.mobileprovision`, keystore, or other credential files.

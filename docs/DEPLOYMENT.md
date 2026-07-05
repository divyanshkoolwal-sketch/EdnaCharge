# Deployment Runbook

## Prerequisites

- Production Supabase project with migrations applied.
- Production Redis.
- Stripe live account with Connect enabled.
- Supabase Auth configured with Google and Apple sign-in providers.
- Apple APNs key uploaded for push notifications.
- Mapbox token.
- Expo/EAS project access and Apple Developer account.
- Sentry/PostHog projects if telemetry is enabled.

## Database

Apply migrations in order from `supabase/migrations/`.

Important production checks:

- `DATABASE_URL` must be a real non-local production DB URL.
- RLS hardening migrations must be present.
- Notification FK and account deletion cascade migrations must be present.
- Charger location trigger migration must be present.

## Backend

Deploy API, CSMS, and worker as separate services.

Required service env:

- API: Supabase (URL + service role key, used for Auth token verification plus Storage/Realtime), Stripe, DB, Redis, OCPP public URL, Sentry optional.
- CSMS: DB, Redis, OCPP config, Sentry optional.
- Worker: DB, Redis, Stripe, Expo push, Sentry optional.

Production must not set:

```text
ENABLE_DEV_BYPASS=1
```

## Mobile

Use EAS for native builds. The mobile app reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` for auth; there are no native auth config files to supply.

See [`runbooks/testflight.md`](runbooks/testflight.md).

## Smoke

After deploy:

```bash
pnpm demo:loop
```

Note: `pnpm sentry:smoke` probes the `/_sentry-test` route, which is only
registered when `NODE_ENV !== 'production'`. Run it against a staging/dev
deployment; in production, verify Sentry via a real captured error instead.

Then manually verify:

- Sign in.
- Add/view payment method in Stripe test/live mode as appropriate.
- Host onboarding reaches Stripe Connect.
- OCPP simulator can connect and start only after driver action.
- Session settlement produces receipt and notification.

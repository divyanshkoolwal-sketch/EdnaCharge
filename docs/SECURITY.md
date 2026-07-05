# Security Notes

## Secrets

Do not commit real secrets or local credential files.

Ignored local inputs include:

- `.env`, `.env.*`, except `.env.example`
- `CREDENTIALS.txt`
- EAS/App Store/Google Play keys
- private keys, provisioning profiles, keystores, and generated native folders

Use [`runbooks/credentials-template.md`](runbooks/credentials-template.md) for the secret inventory.

## Authentication

- Mobile uses Supabase Auth (email+password, Google, Apple).
- API verifies Supabase access tokens (`supabase.auth.getUser`); `User.id` is the Supabase `auth.users.id`.
- tRPC client refreshes tokens and retries once on auth expiry.
- Unauthorized app state should sign out via Supabase.

## Data Boundaries

- API uses the server DB connection for trusted writes.
- RLS still matters for Supabase Realtime and direct local policy tests.
- Do not expose charger credential hashes, OCPP passwords, gate codes, or host-only access data through public payloads.
- OCPP start must stay bound to explicit driver action and the booking token.

## Payments

- Stripe PaymentIntents use manual capture.
- Booking create/modify must be idempotent and avoid duplicate holds.
- Capture amount, platform fee, and transfer destination must reconcile with the final session.
- Dev bypass is allowed only in local development and must never boot in production.

## Review Checklist

- No new secrets in tracked files.
- No new raw SQL interpolation without parameterization.
- No user-controlled role elevation.
- No public API payload leaks of credentials/access data.
- No double-capture or double-settlement path.
- No account deletion FK constraints that prevent the intended flow.

# Privacy

EdnaCharge's data-protection posture (GDPR / CCPA) and the mechanics that back it.
The user-facing legal text lives at the app's `/privacy` page (served by
`apps/api/src/legal.ts`); this doc is the engineering companion.

## PII we collect

- **Email** — account identity (Supabase Auth).
- **Name** — profile display.
- **Avatar** — optional profile image.
- **Coarse location** — approximate location for map/search, not precise tracking.
- **Payment** — handled by **Stripe**. Card data never touches our servers; we
  store Stripe customer/PaymentIntent identifiers only.

We do not support phone/OTP auth and do not collect phone numbers as an identity
factor.

## Data-subject rights

**Export.** The `privacy.exportMyData` tRPC procedure returns the requesting user's
core personal data as JSON — their profile, the chargers they own, and the bookings
they made — the machine-readable "access / portability" response. It intentionally
omits credentials and internal payment identifiers, and does not include chat
messages or reviews (those are available via a support-assisted full archive).

**Delete.** Account deletion runs through
`apps/api/src/routers/auth/account-deletion.ts` (`deleteAccount`). It anonymizes
the `User` in a `prisma.$transaction`, cancels active Stripe payment holds, and
tears down the Supabase auth identity. It is idempotent — `isAlreadyDeleted`
short-circuits a retried deletion — and it does **not** hard-delete the row, so a
counterparty's booking/chat history stays intact. Users reach this in-app
(Settings → Delete account) or via the `/delete-account` web page / support email
if they've lost app access.

## PII minimization & scrubbing

Defense in depth, so PII does not end up in logs or crash reports:

- **Server logs** — pino `REDACT_PATHS` masks email, phone, password, token,
  secret, authorization (`packages/server-utils/src/logger.ts`).
- **Server error tracking** — `scrubSentryValue` masks emails, phones, `Bearer`
  tokens, JWT-like values, and Stripe keys in Sentry events
  (`packages/server-utils/src/sentry.ts`); `sendDefaultPii` is off.
- **Mobile** — `apps/mobile/src/lib/logger.ts` and the mobile Sentry
  value-level scrubber strip emails, JWTs, and `Bearer` tokens before anything is
  logged or reported.

Collect the minimum needed for a feature; never log raw request bodies or auth
headers.

## Data retention

- Active account data is retained for the life of the account.
- On deletion the profile is anonymized rather than purged, to preserve
  counterparties' transaction/chat history.
- Limited records may be retained where required for legal, tax, accounting,
  fraud-prevention, chargeback/dispute, safety, or security obligations, and only
  for those purposes (as stated on `/delete-account`).
- Stripe retains payment records under its own retention policy; we hold only the
  identifiers that link a user to those records.

## References

- `/privacy` and `/delete-account` legal pages — `apps/api/src/legal.ts`.
- Deletion flow — `apps/api/src/routers/auth/account-deletion.ts`.
- Scrubbing — `packages/server-utils/src/{logger,sentry}.ts`,
  `apps/mobile/src/lib/logger.ts`.

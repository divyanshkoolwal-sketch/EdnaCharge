# App Surface

## Driver

- Welcome/sign in/sign up/profile completion.
- Map of nearby chargers with empty/error states.
- Charger detail with host info, connector, power, reviews, pricing, and booking CTA.
- Booking request with payment pre-auth language.
- Booking list/detail, modify pending booking, cancel with confirmation.
- Chat with host, including moderation actions.
- Live session and receipt/review flow.
- Notifications, payment methods, settings, support, legal pages, profile editing.

## Host

- Host onboarding: identity verification, OCPP charger identification, Stripe Connect payouts.
- Add charger: readiness gate, address metadata, connector/power, map pin, gate code.
- Charger detail: visibility toggle, demand pricing display, OCPP connection details/status.
- Requests and booking detail, accept/decline, chat, review.
- Host home, charger list, earnings, profile/settings.

## Backend Flows

- Supabase access tokens are verified in API context.
- Booking create/modify creates or reuses Stripe manual-capture intents and stores the locked rate.
- Host accept confirms booking; auto-decline handles stale pending requests.
- `booking.startSession` mints/uses the OCPP start token for Tier 3 chargers.
- CSMS authorizes/starts only matching booking tokens and writes meter values.
- Worker settles completed sessions and persists/sends notifications.

## Not Product Truth Anymore

- Host-set per-kWh pricing.
- Firebase Auth as the app sign-in system (now Supabase Auth).
- Phone/OTP sign-in.
- Non-OCPP chargers as the main v1 listing path.
- Root-level legacy audits as current docs.

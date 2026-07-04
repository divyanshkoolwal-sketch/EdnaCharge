# Scoped Todo

This is the only repo doc for open work. Keep items scoped, actionable, and verifiable. Do not add todo-style language to source comments or other docs.

## Environment Verification

- Scope: Supabase local/prod verification.
  Task: run the full migration/RLS stack with Docker and Supabase CLI.
  Acceptance: migrations apply from scratch, RLS tests pass live, and `prisma migrate diff` is empty.

- Scope: Stripe end-to-end.
  Task: verify booking request, modify, capture, Connect fee, webhook, and receipt with Stripe test keys.
  Acceptance: manual-capture PaymentIntent reaches the expected final captured amount and DB payout/receipt rows reconcile.

- Scope: Push notifications.
  Task: verify Expo push and the APNs key on a physical iPhone.
  Acceptance: a real push notification completes on device.

- Scope: Mapbox runtime.
  Task: verify map rendering with `EXPO_PUBLIC_MAPBOX_TOKEN`.
  Acceptance: driver map renders pins/clusters and no-token fallback does not appear.

## Product Hardening

- Scope: Charger edit.
  Task: build a real host charger edit surface for title, power, connector, address/gate metadata, and visibility-safe updates.
  Acceptance: no dead edit controls; server authorization and validation reuse `charger.update`.

- Scope: Address accuracy.
  Task: validate host-entered address against charger pin coordinates with Mapbox Geocoding.
  Acceptance: API rejects address/pin pairs that disagree beyond the chosen distance threshold.

- Scope: Mobile end-to-end coverage.
  Task: add a Maestro happy path for auth, map, booking request, chat, session, receipt, and review.
  Acceptance: the E2E command runs from a clean simulator with documented env prerequisites.

- Scope: Dispute/refund policy.
  Task: define the v1 policy and decide which app/API surfaces are required.
  Acceptance: product decision is documented and any required code paths are tracked as implementation work.

- Scope: Legacy hardware paths.
  Task: decide whether Shelly/Tier 1/Tier 2 support remains in v1 or moves behind an internal flag.
  Acceptance: code, docs, and onboarding copy all describe one consistent hardware surface.

## Polish

- Scope: Brand typography.
  Task: decide whether to bundle Plus Jakarta Sans through `expo-font`.
  Acceptance: `fontFamily` tokens point at the loaded family or the system-font decision remains documented here.

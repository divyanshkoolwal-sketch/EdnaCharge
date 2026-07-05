# Agent Context

EdnaCharge is a peer-to-peer EV charging marketplace. Drivers find chargers, request bookings, chat with hosts, start charging, pay by captured energy, and leave reviews. Hosts onboard, verify identity, connect an OCPP-capable charger, accept bookings, and receive payouts.

## Architecture

Keep the four runtime surfaces separate:

- `apps/api`: Fastify, tRPC v11, Prisma. Owns user-facing reads/writes, Stripe, Supabase access-token verification, avatar upload, legal pages, and router composition.
- `apps/csms`: Fastify plus `ocpp-rpc`. Owns OCPP 1.6 WebSocket connections at `/ocpp/v1.6/:chargerId`, charger auth, meter values, and outbound OCPP command consumption.
- `apps/worker`: BullMQ workers. Owns auto-decline, settlement/capture, notification fanout, Shelly legacy jobs, device monitor jobs, and queue cleanup.
- `apps/mobile`: Expo React Native app with Expo Router, NativeWind-style UI components, tRPC client, Zustand state, Supabase Auth, Mapbox, Stripe, and Supabase Realtime.

Shared packages:

- `packages/db`: Prisma schema/client, seed, and DB tests.
- `packages/schemas`: Zod contracts and shared pricing helpers. Use these for API/mobile contracts.
- `packages/config`: environment loading/validation.
- `tools/ocpp-simulator`: local charger simulator.

## Current Product Truth

- Authentication is Supabase Auth (email+password, Google, Apple sign-in; phone/OTP was dropped). `User.id` is the Supabase `auth.users.id`. Supabase also provides Postgres, Realtime, Storage, and local dev tooling.
- Driver/host roles are on one account. A user is a driver by default and can become a host after identity and payout setup.
- v1 host listing is OCPP-first. Non-OCPP chargers go to waitlist UX. Legacy Shelly/Tier 1/Tier 2 worker paths still exist but are not the primary listing flow.
- Demand pricing is the current model. Hosts do not set rates. The rate is computed from shared schemas and locked on `Booking.ratePerKwhCents` at request/modify time.
- Tier 3 OCPP starts are driver-authorized with a one-time OCPP idTag/token. Unknown local RFID / unsolicited starts must be refused.
- Notifications are persisted in Postgres and also fanned out via Expo push.
- Account deletion must clean or null child rows without breaking marketplace history more than intended.

## Code Conventions

- TS/TSX/JS files start with a top file docstring.
- TS/TSX/JS files stay at or under 300 LOC. Split by behavior, not by random line count.
- Prefer existing local helpers and shared schemas over new abstractions.
- Keep mobile route files small: orchestration in routes, repeated UI in `apps/mobile/src/features/*`.
- Keep routers focused: procedure composition at router root, complex behavior in nearby modules.
- No committed secrets, no real credentials, no generated native build output.
- Avoid `any`, commented-out code, and debug logs.

## Validation

Default handoff stack:

```bash
pnpm typecheck
pnpm test
pnpm lint
git diff --check
pnpm demo:loop
```

`pnpm demo:loop` requires API, CSMS, and worker health endpoints to be reachable. If another process owns port `3000`, run services on temporary ports and pass those vars into `pnpm demo:loop`.

## High-Risk Areas

- Stripe manual capture and Connect transfer math.
- Booking idempotency and slot races.
- OCPP start authorization and replay prevention.
- Notification and moderation references during account deletion.
- RLS and system inserts. API uses a DB role that bypasses RLS for trusted server operations.
- Mobile auth token refresh and forced sign-out paths.
- Push notification (Expo push) and APNs setup.

## Open Work

Do not leave open-work language in comments or scattered docs. Put explicit open work in [`todo.md`](todo.md).

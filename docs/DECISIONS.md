# Decisions

## Active Decisions

- Keep API, CSMS, worker, and mobile as separate services.
- Use Supabase Auth for app authentication (email+password, Google, Apple; phone/OTP is not supported).
- Use Supabase for Auth, Postgres, Realtime, Storage, local tooling, and RLS. `User.id` is the Supabase `auth.users.id` so RLS `auth.uid()` lines up.
- Use Prisma types directly. Shared Zod schemas in `packages/schemas` are the app/API contract.
- Use `ocpp-rpc` for OCPP 1.6.
- Use BullMQ/ioredis for background jobs.
- Use demand pricing. The shared pricing helper computes rates; bookings store the locked rate.
- Use Stripe manual capture and Connect Express for payments/payouts.
- Store notifications in Postgres, then push via Expo.

## Source Layout Decisions

- Keep route/screens thin when they grow. Shared mobile UI belongs under `apps/mobile/src/features/*`.
- Keep routers as composition points; split behavior into nearby modules.
- Keep all TS/TSX/JS source files at or under 300 LOC.
- Keep one top file docstring in every TS/TSX/JS source file.

## Superseded Decisions

- Host-set pricing is superseded by demand pricing.
- Firebase Auth is superseded by Supabase Auth in mobile.
- Phone/OTP sign-in is superseded by email+password, Google, and Apple sign-in.
- "Earliest confirmed booking" OCPP matching is superseded by per-booking OCPP start tokens.
- Legacy hardware onboarding docs are superseded by the OCPP-first host flow.

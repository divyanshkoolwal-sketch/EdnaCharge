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

## Agent-Readiness Tooling (2026-07-04)

Added CI/CD, linting, security-scanning, and observability scaffolding to raise the
Factory agent-readiness level. New dependencies, justified per the AGENTS.md rule:

- **ESLint flat config + `typescript-eslint` + `eslint-plugin-react-hooks`** — real
  linting beyond `tsc` (naming, complexity, unused code, RN hooks rules). Seeded at
  `warn` so it never blocks the build; wired into `pnpm lint`.
- **`knip` / `jscpd` / `dependency-cruiser` / `syncpack` / `size-limit`** — dead-code,
  duplicate-code, module-boundary, version-drift, and code-size scanning. Dev-only,
  run as informational `pnpm` scripts + CI jobs; none block `pnpm lint`.
- **`husky` + `lint-staged` + `@commitlint/*`** — staged-file format/lint on
  pre-commit and Conventional-Commit enforcement (feeds release notes).
- **`@changesets/cli`** — release-notes + release automation for the workspace.
- **`typedoc`** — generated API reference for the shared packages.
- **`@vitest/coverage-v8`** — coverage thresholds/reports (dev-only).
- **`prom-client`** (runtime) — Prometheus `/metrics` on api/csms/worker: standard,
  dependency-light, no vendor lock-in, scrape model fits Render.
- **`opossum`** (runtime) — circuit breaker around external HTTP (Mapbox) so a
  dependency outage fails fast instead of exhausting the event loop.
- **`posthog-node`** (runtime) — server-authoritative product events the client
  can't be trusted to report; gated behind the `BACKEND_ANALYTICS` flag + `POSTHOG_KEY`.
- Request-ID correlation and the feature-flag registry are **custom, zero-dependency**
  modules in `packages/server-utils` / `packages/config`.

Full plan + coverage matrix: `docs/superpowers/specs/2026-07-04-agent-readiness-remediation-design.md`.
Repo settings a repo admin must still apply manually: `docs/runbooks/repo-settings.md`.

## Superseded Decisions

- Host-set pricing is superseded by demand pricing.
- Firebase Auth is superseded by Supabase Auth in mobile.
- Phone/OTP sign-in is superseded by email+password, Google, and Apple sign-in.
- "Earliest confirmed booking" OCPP matching is superseded by per-booking OCPP start tokens.
- Legacy hardware onboarding docs are superseded by the OCPP-first host flow.

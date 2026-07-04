# AGENTS.md

This is the short entry point for agents working in EdnaCharge.

Read [`docs/AGENT_CONTEXT.md`](docs/AGENT_CONTEXT.md) before editing code. It is the current operating manual. Read [`docs/RUNBOOK.md`](docs/RUNBOOK.md) before running or verifying the app. Open work is scoped in [`docs/todo.md`](docs/todo.md).

## Working Style

- Bias toward clear assumptions over silent guessing. If the request has multiple plausible meanings, name them before editing.
- Prefer the smallest change that satisfies the request. Do not add speculative flexibility, new abstractions, or adjacent refactors.
- Every changed line should trace to the requested outcome, cleanup made necessary by that outcome, or verification support.
- If you notice unrelated dead code or cleanup, mention it instead of deleting it unless the request explicitly asks for that sweep.
- Define success in verifiable terms before larger changes: what command, test, smoke path, or manual check proves the work.
- If a simpler approach exists, say so. Push back when a requested path would make the code harder to maintain.

## Non-Negotiables

- Keep the service split: `apps/api`, `apps/csms`, `apps/worker`, and `apps/mobile`.
- Read before writing. Check local package scripts and existing patterns before adding code.
- Do not commit secrets, local native config, generated state, or build outputs.
- Do not add libraries outside the documented stack without a written 3-bullet justification.
- Use shared Zod schemas and Prisma types. Avoid parallel hand-rolled contracts.
- Every TS/TSX/JS file starts with a top file docstring and stays at or below 300 LOC.
- No `any` to paper over signatures, no commented-out code, no leftover debug logs.
- If a feature cannot be verified, report the exact reason instead of claiming it works.

## EdnaCharge Rules

- User-facing API writes belong in `apps/api`; charger WebSocket/OCPP behavior belongs in `apps/csms`; background capture, expiry, device, and push work belongs in `apps/worker`.
- Mobile route files should orchestrate. Reusable UI and flow logic belong under `apps/mobile/src/components` or `apps/mobile/src/features`.
- Pricing must use the shared demand-pricing path and lock the rate on `Booking.ratePerKwhCents`; hosts do not set rates.
- OCPP starts must stay bound to the driver-authorized one-time token. Do not reintroduce earliest-booking or plug-and-charge fallback authorization.
- Stripe work must preserve manual capture, Connect transfer math, idempotency keys, and test-mode integration coverage.
- Supabase RLS, Realtime, Storage, and Prisma server access have different trust boundaries. Do not swap service-role/server access for anon/client access.
- Authentication is Supabase Auth (email+password, Google, Apple). There are no native auth config files. Never commit generated native credentials or secret keys.
- Explicit open work belongs only in [`docs/todo.md`](docs/todo.md); do not scatter todo-style comments through source or docs.

## Required Checks

Run the relevant subset while working. Before handoff, prefer:

```bash
pnpm typecheck
pnpm test
pnpm lint
git diff --check
pnpm demo:loop
```

`pnpm demo:loop` needs API, CSMS, and worker reachable on the configured ports.

## Quality Tooling & CI

Beyond the required checks, these run in CI (`.github/workflows/`) and are available locally:

- `pnpm lint:eslint` — ESLint (flat config; naming, complexity, unused-code rules, seeded at `warn`).
- `pnpm deadcode` / `pnpm deps:check` / `pnpm dupcheck` / `pnpm depcruise` / `pnpm size` — knip, syncpack, jscpd, dependency-cruiser, size-limit (informational).
- `pnpm test:coverage` — Vitest coverage with per-app thresholds; `pnpm test:perf` — verbose timing.
- `pnpm openapi:check` — keeps `docs/openapi.yaml` in sync with the tRPC router; `pnpm todos` — technical-debt scan.
- `pnpm changeset` — add a release note for user-facing changes; `pnpm docs:typedoc` — API reference.

Observability: services expose `/metrics` (Prometheus) and propagate `x-request-id`; see `docs/OBSERVABILITY.md`. Feature flags: `docs/FEATURE_FLAGS.md`. Some GitHub settings (branch protection, secret scanning) are admin-only — see `docs/runbooks/repo-settings.md`.

## Second-Model Review

When Claude Code is available, use it as an advisory reviewer for meaningful code changes. Do not send secrets or large credential/config files to Claude. If Claude is unavailable or its secret guard refuses the prompt, continue locally and say so.

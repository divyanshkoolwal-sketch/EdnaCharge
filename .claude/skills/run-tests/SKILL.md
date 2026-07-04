---
name: run-tests
description: Use when running or verifying the EdnaCharge test suite (unit + live e2e) across api/csms/worker/mobile/db.
---

# Run Tests

EdnaCharge uses Vitest, orchestrated by Turborepo. Live e2e/RLS suites are
**gated** so a bare box stays green.

## Repo-wide

```bash
pnpm test        # turbo run test — every workspace's `vitest run`
```

## Per app / package

Each workspace's `test` script is `vitest run`. Target one with `-F`:

```bash
pnpm -F @edna/api test
pnpm -F @edna/mobile test
pnpm -F @edna/db test
```

Run a single file or filter within a workspace:

```bash
pnpm -F @edna/api exec vitest run test/refund-math.unit.test.ts
pnpm -F @edna/api exec vitest run -t "refund"
```

## Test file naming

- `*.unit.test.ts` — pure/helper logic; runs on every `pnpm test`, no live
  stack needed. Prefer these for money/safety helpers (e.g.
  `apps/api/test/refund-math.unit.test.ts`, `moderation.unit.test.ts`).
- `*.e2e.test.ts` — real trust-boundary tests (auth, RLS row isolation,
  charger/chat/access, Stripe). `describe.skip` unless `E2E_LIVE=1`; they never
  mock Stripe/DB, so without a live stack they skip with a printed reason.

## Live e2e

The e2e/RLS suites are the real auth + RLS + payment tests. Run them against a
live local stack:

```bash
supabase start                     # + redis-server, both running
supabase db reset                  # apply all migrations incl. RLS policies
API_PORT=3300 pnpm -F @edna/api start &   # default E2E_API_URL is :3300
pnpm test:e2e                      # scripts/e2e.sh: sets E2E_LIVE=1, runs api + db e2e
```

Payment/booking/session e2e additionally need a Stripe **test-mode**
`STRIPE_SECRET_KEY` in `.env`; moderation e2e needs `MODERATION_ADMIN_EMAILS`.
Without them, those suites skip.

## Product smoke

```bash
pnpm smoke:product   # curated unit subset across api + mobile
```

## Coverage

```bash
pnpm test:coverage                # turbo run test:coverage across all workspaces
pnpm -F @edna/api test:coverage   # coverage for one workspace
```

Coverage uses the `@vitest/coverage-v8` provider (root devDependency); each app's
`test:coverage` runs `vitest run --coverage` against per-app thresholds defined in
its `vitest.config.ts`. CI runs `pnpm test:coverage` in the `verify` job
(`.github/workflows/ci.yml`) and uploads results to Codecov.

## Pre-handoff checks

Before claiming a change is done, run the relevant subset (see the
`verify-change` skill and AGENTS.md "Required Checks"):

```bash
pnpm typecheck
pnpm test
pnpm lint            # lint:conventions (docstring + ≤300 LOC) then eslint + turbo lint
git diff --check     # no whitespace errors / conflict markers
pnpm demo:loop       # needs API + CSMS + worker reachable
```

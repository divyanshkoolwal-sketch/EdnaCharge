---
name: verify-change
description: Use before claiming any EdnaCharge change is done — run the relevant checks and report exact command output, or state exactly why verification is impossible.
---

# Verify Change

House rule: **prove it before claiming it.** If you cannot verify a change, say
exactly why instead of asserting it works. This mirrors AGENTS.md "Required
Checks".

## The checks

Run the subset relevant to what you touched (all of them before handoff):

```bash
pnpm typecheck        # turbo run typecheck — tsc across all workspaces
pnpm test             # turbo run test — vitest (live e2e stays gated/skipped)
pnpm lint             # lint:conventions THEN eslint + turbo run lint
pnpm lint:conventions # tsx scripts/check-source-conventions.ts on its own
git diff --check      # no trailing whitespace / conflict markers
pnpm demo:loop        # health probe: API + CSMS + worker must be reachable
```

`pnpm lint:conventions` enforces the two non-negotiables: every TS/TSX/JS source
file starts with a top `/** ... */` docstring and stays at or under 300 LOC.
Run it whenever you add or split a file.

## Scope the run

- Logic / helper change → `pnpm typecheck` + the relevant `*.unit.test.ts`
  (`pnpm -F @edna/<app> exec vitest run <file>`), then `pnpm lint`.
- New / split source file → always `pnpm lint:conventions` (docstring + LOC).
- Auth / RLS / Stripe / OCPP change → the unit tests plus the **live** e2e suite
  (see the `run-tests` skill: `supabase start` + `supabase db reset` +
  API on `:3300` + `pnpm test:e2e`). These are the real trust-boundary tests.
- Runtime / wiring change → `pnpm demo:loop` (needs API `3000`, CSMS `3100`,
  worker `3200` up; pass `API_PORT`/`CSMS_PORT`/`WORKER_PORT` if ports differ).

## Report the evidence

- Show the exact command(s) run and their real output (pass/fail, counts, skip
  reasons) — do not paraphrase "tests pass".
- If a suite **skipped** (e.g. e2e gated without `E2E_LIVE=1`, Supabase, or a
  Stripe test key), say so and name the missing prerequisite.
- If a path genuinely cannot be verified locally (needs live Stripe webhook,
  APNs, production DB, etc.), state that precisely and what would be needed —
  never claim unverified behavior works.

## Optional second-model review

For meaningful changes, use Claude Code as an advisory reviewer. Do not send
secrets or large credential/config files. If it is unavailable or its secret
guard refuses, continue locally and say so.

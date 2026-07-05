# Testing & Flaky-Test Policy

How the suites run, and how EdnaCharge keeps them deterministic.

## Running tests

```bash
pnpm test              # all workspaces (turbo), the blocking CI gate
pnpm test:coverage     # + coverage thresholds (see each app's vitest.config.ts)
pnpm -F @edna/api test # a single workspace
```

Every suite runs isolated and parallel (`pool: 'threads'`, `isolate: true`) so
shared singletons (Prisma, queues) never leak state between files.

## Flaky tests

A test is **flaky** when it passes on some runs and fails on others with no code
change. Flaky tests erode trust in CI, so we handle them with three mechanisms.

### 1. Retry (auto-heal transient flakes in CI)

Each `vitest.config.ts` sets `retry: process.env.CI ? 2 : 0`. In CI a failing test
is retried up to twice before the run fails; **locally there is no retry** — a
flake should surface so it can be fixed, not hidden. Retries only paper over
_transient_ infra hiccups; a test that fails deterministically still fails.

### 2. Quarantine (isolate a known flake from the blocking gate)

When a test is flaky and can't be fixed immediately, rename it to
`*.flaky.test.ts`. Those files are **excluded from the blocking suite** (see the
`exclude` in each `vitest.config.ts`), so they can no longer redden PRs — but
they still get exercised by the nightly scan below.

Quarantining is a stop-gap, not a resting place:

- Open a tracking issue when you quarantine, and reference it in the test.
- The nightly scan reports quarantined tests so they aren't forgotten.
- Un-quarantine (rename back to `*.test.ts`) once the root cause is fixed.

### 3. Detection (surface new flakes nightly)

```bash
pnpm detect-flaky --runs=5     # re-run every suite N times, retries disabled
pnpm detect-flaky --runs=5 --strict   # exit non-zero if any flake is found
```

`scripts/detect-flaky.ts` runs each workspace suite N times with retries **off**
and reports any test whose pass/fail outcome isn't identical across all runs. The
`Flaky test scan` workflow (`.github/workflows/flaky.yml`) runs it nightly and
on-demand (`workflow_dispatch`), writing results to the job summary. It is
non-blocking — its job is visibility, so a real flake gets triaged and
quarantined rather than randomly failing unrelated PRs.

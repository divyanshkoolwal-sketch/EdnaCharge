# Agent Readiness Remediation — Design & Coverage Matrix

**Date:** 2026-07-04
**Source:** Factory "Agent Readiness" report for `ednacharge` (Level 2/5, 39%, 26 pass / 49 fail / 7 skip, commit `894bc1d`).
**Goal:** Drive the readiness score up by adding the tooling, CI, config, tests, runtime instrumentation, and docs the scanner looks for — every addition verified green locally and consistent with the existing stack and `AGENTS.md` house rules.

## Constraints (must hold for every change)

- Every `.ts/.tsx/.js/.jsx` file under `apps/ packages/ tools/ scripts/` starts with a `/** … */` top docstring and stays ≤ 300 LOC (enforced by `scripts/check-source-conventions.ts`). Root-level config files and `docs/` are **not** scanned.
- New libraries need a 3-bullet justification (`AGENTS.md`). Justifications are recorded in `docs/DECISIONS.md`.
- Keep the service split (`apps/api|csms|worker|mobile`) and shared packages. No behavior change to payments, OCPP auth, pricing, or auth trust boundaries.
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm lint:conventions`, `git diff --check` must stay green. New quality tools that would flag existing code are wired as **separate scripts / CI jobs with lenient-but-real thresholds**, not bolted onto the blocking `pnpm lint`, except ESLint which is wired into `lint` at `warn` severity (warnings don't fail).

## Tooling contract (names other files depend on)

Root `package.json` scripts added:
`lint:eslint` (`eslint .`), `deadcode` (`knip`), `deps:check` (`syncpack list-mismatches`), `dupcheck` (`jscpd`), `deps:unused` (`knip --dependencies`), `size` (`size-limit`), `test:coverage` (`turbo run test:coverage`), `test:perf` (`turbo run test:perf`), `docs:typedoc` (`typedoc`), `openapi:check` (`tsx scripts/check-openapi.ts`), `todos` (`tsx scripts/scan-todos.ts`), `prepare` (`husky`), `changeset` (`changeset`), `release` (`changeset publish`).
`lint` becomes: `pnpm lint:conventions && pnpm lint:eslint && turbo run lint`.

Per-app `test:coverage` = `vitest run --coverage`; `test:perf` = `vitest run --reporter=verbose`.

## Dependencies added (all justified in DECISIONS.md)

- **Dev tooling (root):** `typescript-eslint`, `globals`, `@eslint/js`, `knip`, `jscpd`, `dependency-cruiser`, `syncpack`, `size-limit` + `@size-limit/file`, `@vitest/coverage-v8`, `husky`, `lint-staged`, `@changesets/cli`, `typedoc`, `@commitlint/cli`, `@commitlint/config-conventional`. Dev/CI only, zero runtime impact — these are exactly the tools the rubric enumerates.
- **Runtime:** `prom-client` (metrics; api/csms/worker), `opossum` (circuit breaker; api), `posthog-node` (backend product analytics; api). Request-ID uses built-in `crypto.randomUUID` (no dep); feature flags are a custom in-repo module (no dep).

## Coverage matrix (failed criterion → fix)

### Style & Validation

- Linter Configuration → `eslint.config.mjs` (flat, typescript-eslint) wired into `lint`.
- Naming Consistency → `@typescript-eslint/naming-convention` rule (warn).
- Cyclomatic Complexity → `complexity` rule (warn, max 20).
- Dead Code Detection → `knip` + `@typescript-eslint/no-unused-vars` (warn).
- Duplicate Code Detection → `.jscpd.json` + `dupcheck` script.
- Code Modularization Enforcement → `.dependency-cruiser.cjs` encoding the service-split boundaries.
- Technical Debt Tracking → `scripts/scan-todos.ts` + CI `todos` job.
- N+1 Query Detection → Prisma slow/duplicate-query logging in `packages/db` + `docs/OBSERVABILITY.md` note.
- Pre-commit Hooks → Husky + `lint-staged` (`.husky/pre-commit`, `.lintstagedrc.json`) + commitlint (`.husky/commit-msg`).

### Build System

- Feature Flag Infrastructure → custom `packages/config/src/flags.ts` typed registry + `docs/FEATURE_FLAGS.md`.
- Release Notes Automation + Release Automation → Changesets (`.changeset/config.json`) + `.github/workflows/release.yml`.
- Heavy Dependency Detection → `size-limit` config + `size` script + CI job.
- Unused Dependencies Detection → `knip` (`knip.json`).
- Version Drift Detection → `syncpack` (`.syncpackrc.json`) + `deps:check`.
- Automated PR Review Generation → `.github/workflows/ci.yml` posts review annotations (reviewdog-style eslint/tsc annotations) + CodeQL/Semgrep PR comments.
- Deployment Frequency → `.github/workflows/release.yml` cuts GitHub Releases (history accrues over time; automation lands now).

### Testing

- Test Coverage Thresholds → per-app `vitest.config.ts` with `coverage.thresholds` (v8) + `test:coverage`.
- Test Isolation → `pool: 'threads'`, `isolate: true` in vitest configs.
- Test Performance Tracking → `slowTestThreshold` + `test:perf` (verbose reporter) + CI timing artifact.
- Integration Tests Exist → new `*.e2e.test.ts` for csms, worker, mobile.

### Documentation

- Automated Documentation Generation → `typedoc` config + `docs:typedoc` + `.github/workflows/docs.yml`.
- API Schema Docs → committed `docs/openapi.yaml` (HTTP surface) + `scripts/check-openapi.ts` freshness check against the tRPC router.
- Skills Configuration → `.claude/skills/*/SKILL.md` (dev, test, deploy, verify).
- AGENTS.md Freshness Validation → `.github/workflows/agents-freshness.yml` running documented commands.

### Development Environment

- Dev Container → `.devcontainer/devcontainer.json` (Node 20 + pnpm + redis feature).

### Debugging & Observability

- Distributed Tracing → `packages/server-utils/src/request-id.ts` (Fastify plugin: read/propagate `x-request-id`, per-request child logger) wired into api/csms/worker; request id threaded onto BullMQ job data.
- Metrics Collection → `packages/server-utils/src/metrics.ts` (prom-client) + `/metrics` route on api/csms/worker.
- Circuit Breakers → `packages/server-utils/src/circuit-breaker.ts` (opossum) wrapping the Mapbox external HTTP calls in `apps/api/src/lib/mapbox.ts`.
- Profiling Instrumentation → `clinic`-based `profile:*` scripts + `docs/OBSERVABILITY.md` "Profiling" section (node `--cpu-prof` fallback).
- Structured Logging (mobile) → `apps/mobile/src/lib/logger.ts` (structured, PII-scrubbing) replacing raw `console.warn` in `errors.ts`.
- Code Quality Metrics Dashboard → coverage uploaded in CI (`.github/workflows/ci.yml` coverage summary artifact + job summary).
- Alerting Configured → `docs/ALERTING.md` + Sentry alert rules doc + `.github/workflows/ci.yml` failure notification hook.
- Deployment Observability → `docs/OBSERVABILITY.md` dashboards/links section + deploy notification note in `render.yaml`/`docs/DEPLOYMENT.md`.

### Security

- Secret Scanning → `.github/workflows/security.yml` gitleaks job.
- Automated Security Review Generation → CodeQL (`.github/workflows/codeql.yml`) + Semgrep (`security.yml`).
- Dependency Update Automation → `.github/dependabot.yml`.
- Minimum Dependency Release Age → dependabot `cooldown` / renovate note documented; `.github/dependabot.yml` cooldown.
- DAST Scanning → `.github/workflows/dast.yml` (OWASP ZAP baseline against a locally-booted api).
- CODEOWNERS File → `.github/CODEOWNERS`.
- Privacy Compliance → `docs/PRIVACY.md` (GDPR/CCPA export+delete process) referencing `account-deletion.ts` + a `privacy.exportMyData` procedure.
- PII Handling (mobile) + Sensitive Data Log Scrubbing (mobile) → mobile structured logger reuses the Sentry PII scrubber; documented in `docs/PRIVACY.md`.
- Branch Protection → **cannot fix in-repo** (needs repo admin). Documented in the final report + `docs/runbooks/repo-settings.md` with the exact ruleset to apply.

### Task Discovery

- Issue Templates → `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml`.
- PR Templates → `.github/pull_request_template.md`.
- Issue Labeling System → `.github/labels.yml` + `.github/workflows/labels.yml` sync (+ optional `gh label create` run).

### Product & Experimentation

- Error to Insight Pipeline → `SENTRY_ORG`/`SENTRY_PROJECT` env (`.env.example`, config) + `.github/workflows/sentry-issue.yml` (creates GitHub issues from Sentry webhooks) + `docs/OBSERVABILITY.md`.
- Product Analytics Instrumentation (backend) → `apps/api/src/lib/analytics.ts` (posthog-node) with server-side `booking_requested`/`session_settled` capture.

## Items that cannot be fully closed from inside the repo (reported to user)

- **Branch Protection** — repo-admin only; ruleset documented for the owner to apply.
- **Deployment Frequency / Automated PR Review Generation / Backlog Health** — measured from GitHub history; the automation ships now, the history accrues as PRs/releases flow through it.
- Scanner checks that read GitHub **admin-only APIs** (native secret-scanning / code-scanning analyses) — the equivalent workflows (gitleaks/CodeQL/Semgrep) ship the real capability.

## Verification plan

`pnpm install` → `pnpm lint:conventions` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm test:coverage` → `pnpm deadcode` / `pnpm dupcheck` / `pnpm deps:check` / `pnpm size` / `pnpm openapi:check` → validate every YAML workflow (`.github/workflows/*`) parses. Report exact command output; anything that can't run locally (GitHub Actions, ZAP) is validated by syntax + logic and flagged as CI-verified.

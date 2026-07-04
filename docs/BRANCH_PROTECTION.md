# Branch Protection

`main` is protected by a **repository ruleset**, kept as code in
[`.github/rulesets/main.json`](../.github/rulesets/main.json) so the policy is
reviewable and reproducible.

## Policy

- **Pull request required** — no direct pushes to `main`; ≥1 approving review;
  stale approvals dismissed on new pushes; CODEOWNERS review required.
- **Required status checks** (must pass before merge, branch must be up to date —
  `strict` policy):
  - `Typecheck · Lint · Test · Coverage` (CI) — includes the now-blocking
    `depcruise` module-boundary gate and `flags:check` dead-flag gate.
  - `Secret scanning (gitleaks)` (Security)
- **No branch deletion** and **no force-pushes** (`non_fast_forward`).

Only checks that report on **every** PR are required. Two otherwise-useful checks
are intentionally left **advisory** because they don't always report — making them
required would deadlock legitimate PRs:

- `SAST (semgrep)` — its job is skipped on Dependabot PRs
  (`if: github.actor != 'dependabot[bot]'`), so a required semgrep check would
  never satisfy dependency-update PRs.
- `verify-documented-commands` (AGENTS.md freshness) — its workflow only triggers
  on `paths: [AGENTS.md, docs/**, package.json, **/package.json]`, so code-only
  PRs would never report it (and it re-runs `typecheck`/`test`/`lint`, which the
  required CI check already enforces).

`ESLint PR review` and `Quality scans (informational)` are advisory for the same
reason (they surface signal without blocking).

## Applying it

Branch protection can only be set by a repo **admin/owner**; the GitHub Actions
default token is read-only here, so this cannot be applied from CI. Run once:

```bash
gh auth login          # as an admin/owner
bash scripts/apply-branch-protection.sh            # infers owner/repo
# or: bash scripts/apply-branch-protection.sh divyanshkoolwal-sketch/EdnaCharge
```

The script is idempotent (updates the ruleset by name if it already exists).

## Changing the policy

Edit `.github/rulesets/main.json`, open a PR, and re-run the apply script after
merge. If a required check is renamed, update its `context` here to match the new
check-run name exactly (including the `·` separators) or merges will block on a
check that never reports.

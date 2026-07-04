# Repo Settings Runbook

GitHub settings a repo **admin** must apply manually. These live in GitHub, not the
repo, so they can't be set from a PR — do them once per repository and re-check
after any org migration. Commands assume `gh` is authenticated with admin scope and
`OWNER/REPO` is the repository.

## Branch protection on `main`

Branch protection is **config-as-code** in
[`.github/rulesets/main.json`](../../.github/rulesets/main.json) — required PR +
1 approval, CODEOWNERS review, required status checks (strict), and no
force-push / deletion. Apply or update it once, with an admin-authenticated `gh`:

```bash
bash scripts/apply-branch-protection.sh            # infers OWNER/REPO
```

The required status checks are the **check-run names exactly as CI reports them** —
`Typecheck · Lint · Test · Coverage` and `Secret scanning (gitleaks)`. (Note: the
required context is the _job_ name, not the workflow name — `ci`/`codeql` would
never match.) Only checks that report on **every** PR are required: `SAST
(semgrep)` (skipped on Dependabot PRs), `verify-documented-commands` (path-filtered
workflow), and `codeql` (needs GHAS enabled first) are intentionally **not**
required, since a required check that doesn't always report would deadlock merges.
See [`docs/BRANCH_PROTECTION.md`](../BRANCH_PROTECTION.md) for the full policy and
how to change it.

## Secret scanning + push protection

Settings → Code security → enable:

- **Secret scanning.**
- **Push protection** (blocks commits that contain detected secrets).

Via API:

```bash
gh api -X PATCH repos/OWNER/REPO \
  -F 'security_and_analysis[secret_scanning][status]=enabled' \
  -F 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

## Dependabot

Settings → Code security → enable:

- **Dependabot alerts.**
- **Dependabot security updates.**

Via API:

```bash
gh api -X PUT repos/OWNER/REPO/vulnerability-alerts        # alerts
gh api -X PUT repos/OWNER/REPO/automated-security-fixes    # security updates
```

## CodeQL

Enable code scanning one of two ways:

- **Default setup** — Settings → Code security → Code scanning → Set up → Default.
  GitHub manages the analysis; no workflow file needed.
- **Committed workflow** — if `.github/workflows/codeql.yml` is present, leave code
  scanning on _Advanced_ so it runs the committed workflow. Don't enable both;
  default setup will refuse to run alongside an advanced config.

Once code scanning is enabled and CodeQL reports reliably, add its check to
`.github/rulesets/main.json` (`required_status_checks`) and re-run
`scripts/apply-branch-protection.sh` to make it a required gate. Until then it is
deliberately left out so it can't block merges (see the branch-protection note
above).

## Verify

```bash
gh api repos/OWNER/REPO --jq '.security_and_analysis'
gh api repos/OWNER/REPO/branches/main/protection --jq '.required_status_checks.contexts'
```

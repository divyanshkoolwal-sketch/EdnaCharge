# Repo Settings Runbook

GitHub settings a repo **admin** must apply manually. These live in GitHub, not the
repo, so they can't be set from a PR — do them once per repository and re-check
after any org migration. Commands assume `gh` is authenticated with admin scope and
`OWNER/REPO` is the repository.

## Branch protection on `main`

Protect `main` with a ruleset (Settings → Rules → Rulesets → New branch ruleset,
target `main`):

- **Require a pull request before merging** — 1 approval.
- **Require review from Code Owners** — enforces `CODEOWNERS`.
- **Require status checks to pass** — add `ci` and `codeql`.
- **Require branches to be up to date before merging.**
- **Require linear history** (no merge commits).
- **Block force pushes** and **restrict deletions**.

Equivalent classic branch protection via API:

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=ci' \
  -f 'required_status_checks[contexts][]=codeql' \
  -F 'enforce_admins=true' \
  -F 'required_pull_request_reviews[required_approving_review_count]=1' \
  -F 'required_pull_request_reviews[require_code_owner_reviews]=true' \
  -F 'required_linear_history=true' \
  -F 'allow_force_pushes=false' \
  -F 'allow_deletions=false' \
  -F 'restrictions=' 2>/dev/null || true
```

(`-F 'restrictions='` sends the required `null`.)

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

The branch ruleset above lists `codeql` as a required check — make sure whichever
option you pick publishes a check named `codeql`.

## Verify

```bash
gh api repos/OWNER/REPO --jq '.security_and_analysis'
gh api repos/OWNER/REPO/branches/main/protection --jq '.required_status_checks.contexts'
```

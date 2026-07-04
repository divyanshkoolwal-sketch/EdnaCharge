#!/usr/bin/env bash
#
# Applies (or updates) the default-branch ruleset in .github/rulesets/main.json.
#
# REQUIRES REPO-ADMIN ACCESS. The GitHub Actions default token is read-only on
# this repo, so branch protection cannot be applied from CI — run this once
# locally as an admin/owner (`gh auth login`). It is idempotent: it updates the
# existing ruleset by name if present, otherwise creates it.
#
# Usage:
#   bash scripts/apply-branch-protection.sh [owner/repo]
set -euo pipefail

RULESET_FILE="$(dirname "$0")/../.github/rulesets/main.json"
RULESET_NAME="$(jq -r .name "$RULESET_FILE")"
REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

echo "Repo:    $REPO"
echo "Ruleset: $RULESET_NAME"
echo "Source:  $RULESET_FILE"

existing_id="$(gh api "repos/$REPO/rulesets" --jq \
  ".[] | select(.name==\"$RULESET_NAME\") | .id" 2>/dev/null || true)"

if [ -n "$existing_id" ]; then
  echo "Updating existing ruleset #$existing_id ..."
  gh api --method PUT "repos/$REPO/rulesets/$existing_id" \
    --input "$RULESET_FILE" -H "Accept: application/vnd.github+json" >/dev/null
else
  echo "Creating ruleset ..."
  gh api --method POST "repos/$REPO/rulesets" \
    --input "$RULESET_FILE" -H "Accept: application/vnd.github+json" >/dev/null
fi

echo "Done. Current rulesets:"
gh api "repos/$REPO/rulesets" --jq '.[] | "  #\(.id)  \(.name)  [\(.enforcement)]"'

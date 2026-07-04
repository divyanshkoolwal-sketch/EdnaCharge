# Releasing

EdnaCharge cuts releases with [Changesets](https://github.com/changesets/changesets),
driven by [`.github/workflows/release.yml`](../.github/workflows/release.yml).

## The flow

1. **Every user-facing change adds a changeset.** Run `pnpm changeset`, pick the
   affected packages and bump (patch/minor/major), and commit the generated
   `.changeset/*.md` alongside the change.
2. **On merge to `main`**, the Release workflow aggregates all pending changesets
   and opens (or updates) a **"Version Packages"** PR: version bumps + `CHANGELOG`
   entries.
3. **Merging that PR** tags the new versions (`pnpm changeset tag`) and publishes
   **GitHub Releases** with the generated notes (`createGithubReleases: true`).
   Backend packages are `private`, so nothing is published to npm — the tags and
   GitHub Releases are the release record.

## Cadence

Release cadence follows merge-to-`main`: each batch of merged changesets yields a
Version Packages PR, and merging it cuts the release. Keeping changesets small and
per-change keeps release notes accurate and cadence high.

## First release

`.changeset/initial-release.md` seeds the **first** tagged release (backend
services → `0.1.0`). Once #26 merges, the Release workflow opens the first
Version Packages PR; merging it establishes the release history. The mobile app
versions independently via `apps/mobile/app.json` + EAS build numbers (App Store
/ Play releases), not changesets.

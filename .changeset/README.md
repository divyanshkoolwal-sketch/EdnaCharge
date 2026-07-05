# Changesets

This folder holds [Changesets](https://github.com/changesets/changesets) — one
Markdown file per user-facing change, describing what changed and the release
bump. The `.github/workflows/release.yml` workflow consumes them to generate
release notes and cut GitHub Releases.

Add one with `pnpm changeset` and commit it alongside your change.

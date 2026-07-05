<!-- Keep PRs surgical and traceable to a request (see AGENTS.md). -->

## What & why

<!-- One or two sentences. Link the issue: Closes #123 -->

## Service(s) touched

- [ ] api
- [ ] csms
- [ ] worker
- [ ] mobile
- [ ] shared packages (schemas / db / server-utils / config)

## Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes (conventions + eslint)
- [ ] `git diff --check` clean (no trailing whitespace / conflict markers)
- [ ] No secrets, generated native config, or build output committed
- [ ] Shared Zod schemas / Prisma types reused (no parallel hand-rolled contracts)
- [ ] Service boundaries preserved (api / csms / worker / mobile stay separate)
- [ ] Added a Changeset if this is a user-facing change (`pnpm changeset`)

## Verification

<!-- What command, test, smoke path, or manual check proves this works?
     If a change can't be verified, say exactly why. -->

# Feature Flags

A small, typed, env-driven flag system in `packages/config/src/flags.ts`. No
third-party service — flags are evaluated once at boot from environment variables,
so they are cheap, deterministic, and easy to reason about in tests.

## Model

- Every flag is a typed boolean on the exported `flags` object.
- A flag is **default-off** unless enabled, so shipping unfinished code behind a
  flag is safe.
- A flag turns on when its `FLAG_<NAME>=1` env var is set (or when a `NODE_ENV`
  rule for that flag applies — e.g. on in development, off in production).

## Current flags

| Flag                | Env var                    | Purpose                                    |
| ------------------- | -------------------------- | ------------------------------------------ |
| `ROUTE_ESTIMATE_V2` | `FLAG_ROUTE_ESTIMATE_V2=1` | Gate the experimental route-estimate path. |
| `BACKEND_ANALYTICS` | `FLAG_BACKEND_ANALYTICS=1` | Gate server-side PostHog capture.          |

## Reading a flag

```ts
import { flags } from '@edna/config';

if (flags.ROUTE_ESTIMATE_V2) {
  // experimental path
}
```

Read the flag at the decision point; do not cache the boolean in module scope in a
way that outlives the process, since flags are meant to be read from the resolved
`flags` object.

## Adding a flag

1. Add the flag to the definition in `packages/config/src/flags.ts` with its
   default and any `NODE_ENV` rule.
2. Gate the new code path on `flags.<NAME>`.
3. Document the `FLAG_<NAME>` env var alongside the other service env vars
   (`render.yaml` / `docs/runbooks/credentials-template.md`) if it should be
   settable in a deployed environment.
4. Keep the flag **default-off** until the path is proven.

## Removing dead flags

A flag is temporary scaffolding. Once a gated path has fully shipped (flag on
everywhere) or been abandoned (flag off everywhere), delete it: remove the flag
from `flags.ts`, inline or delete the branch it guarded, and drop the `FLAG_<NAME>`
env var from any config. Do not leave permanently-on or permanently-off flags in
the codebase — they rot into dead branches and misleading config.

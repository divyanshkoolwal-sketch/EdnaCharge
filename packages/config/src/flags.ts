/** @file packages/config/src/flags.ts — typed, env-driven feature flags. */
//
// EdnaCharge's custom feature-flag system. Each flag is default-off (unless a
// per-flag default says otherwise) and enabled by setting `FLAG_<NAME>=1`
// (or `true`). Reads are dynamic (env is re-read each access) so flags can be
// toggled per environment without a rebuild. Keep the surface small and delete
// flags once a change is fully rolled out — see docs/FEATURE_FLAGS.md.

// The single source of truth for every defined flag. `scripts/check-feature-flags.ts`
// reads this array to prove each flag is still gated somewhere in the code (and
// that no gate references an undefined flag). Keep it in sync by construction —
// the FlagName type is derived from it.
export const FLAG_NAMES = ['ROUTE_ESTIMATE_V2', 'BACKEND_ANALYTICS'] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

const FLAG_DEFAULTS: Record<FlagName, boolean> = {
  // Experimental driving route-estimate path (off until validated).
  ROUTE_ESTIMATE_V2: false,
  // Server-side PostHog product analytics (on by default; still requires POSTHOG_KEY).
  BACKEND_ANALYTICS: true,
};

function readFlag(name: FlagName): boolean {
  const raw = process.env[`FLAG_${name}`];
  if (raw == null || raw === '') return FLAG_DEFAULTS[name];
  return raw === '1' || raw.toLowerCase() === 'true';
}

/** Read a flag by name. Prefer this (or `flags.X`) over touching process.env. */
export function isFlagEnabled(name: FlagName): boolean {
  return readFlag(name);
}

/** Static accessor: `flags.ROUTE_ESTIMATE_V2`. Each read re-evaluates the env. */
export const flags: { readonly [K in FlagName]: boolean } = {
  get ROUTE_ESTIMATE_V2() {
    return readFlag('ROUTE_ESTIMATE_V2');
  },
  get BACKEND_ANALYTICS() {
    return readFlag('BACKEND_ANALYTICS');
  },
};

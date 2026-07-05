/**
 * dependency-cruiser rules that encode EdnaCharge's service boundaries.
 *
 * The service split (apps/api, apps/csms, apps/worker) is a hard architectural
 * boundary: the three backend services never import each other's source — they
 * communicate only through the DB, Redis/BullMQ queues, and HTTP. Shared code
 * lives in packages/*. These rules make that boundary tool-enforced instead of
 * convention-only. Scoped to the backend + packages (mobile RN resolution is
 * out of scope here).
 */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-service-imports',
      comment:
        'Backend services must not import each other. Share via packages/*, the DB, or queues.',
      severity: 'error',
      from: { path: '^apps/(api|csms|worker)/' },
      // `$1` backreferences the service captured in `from.path`, so same-service
      // imports (api → api) are allowed and only cross-service ones are flagged.
      to: { path: '^apps/(api|csms|worker)/', pathNot: '^apps/$1/' },
    },
    {
      name: 'packages-no-import-apps',
      comment: 'Shared packages must not depend on application code.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies make modules impossible to reason about in isolation.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Unreachable modules are usually dead code.',
      severity: 'warn',
      from: {
        orphan: true,
        // Type decls, package entrypoints, and tooling config files (vitest /
        // eslint / etc.) are legitimately un-imported — they are entry nodes of
        // the graph, not dead code.
        pathNot: ['\\.d\\.ts$', 'index\\.ts$', '\\.config\\.(ts|js|cjs|mjs)$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(node_modules|dist|coverage|\\.turbo|\\.expo|test/)' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
  },
};

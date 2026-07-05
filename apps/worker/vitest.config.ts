/** @file apps/worker/vitest.config.ts — test isolation, timing, and coverage thresholds. */
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    isolate: true,
    fileParallelism: true,
    slowTestThreshold: 300,
    // Auto-heal transient flakes in CI only (locally a flake should surface and
    // be fixed, not hidden). Known-flaky tests are quarantined as *.flaky.test.ts
    // (excluded below) and surfaced by the nightly scan — see docs/TESTING.md.
    retry: process.env.CI ? 2 : 0,
    exclude: [...configDefaults.exclude, '**/*.flaky.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { lines: 10, functions: 10, statements: 10, branches: 10 },
      exclude: ['**/*.test.ts', '**/*.fixture.ts', 'test/**', 'dist/**'],
    },
  },
});

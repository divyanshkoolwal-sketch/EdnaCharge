/** @file apps/api/vitest.config.ts — test isolation, timing, and coverage thresholds. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Isolated, parallel execution: each test file runs in its own worker with a
    // fresh module registry, so shared singletons (prisma, queues) never leak
    // state between files.
    pool: 'threads',
    isolate: true,
    fileParallelism: true,
    // Flag slow tests (ms) so test-time regressions surface in the report.
    slowTestThreshold: 300,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      // Whole-repo floors (v8 counts every source file). Ratchet up over time.
      thresholds: { lines: 10, statements: 10, functions: 20, branches: 50 },
      exclude: ['**/*.test.ts', '**/*.fixture.ts', 'test/**', 'dist/**'],
    },
  },
});

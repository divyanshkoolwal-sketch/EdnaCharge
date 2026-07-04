/** @file apps/mobile/vitest.config.ts — test isolation, timing, and coverage thresholds. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    isolate: true,
    fileParallelism: true,
    slowTestThreshold: 300,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      // Whole-repo floors (v8 counts every screen/component). Ratchet up over time.
      thresholds: { lines: 3, statements: 3, functions: 5, branches: 5 },
      exclude: ['**/*.test.ts', '**/*.fixture.ts', 'test/**', 'dist/**'],
    },
  },
});

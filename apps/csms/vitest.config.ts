/** @file apps/csms/vitest.config.ts — test isolation, timing, and coverage thresholds. */
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
      thresholds: { lines: 10, functions: 10, statements: 10, branches: 10 },
      exclude: ['**/*.test.ts', '**/*.fixture.ts', 'test/**', 'dist/**'],
    },
  },
});

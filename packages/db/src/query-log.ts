/** @file packages/db/src/query-log.ts — dev slow-query + N+1 detection for Prisma. */
import type { Prisma, PrismaClient } from '@prisma/client';

const SLOW_MS = Number(process.env.PRISMA_SLOW_QUERY_MS ?? 100);
const NPLUS1_WINDOW_MS = 1_000;
const NPLUS1_THRESHOLD = 20;

type QueryEmitter = {
  $on: (event: 'query', cb: (e: Prisma.QueryEvent) => void) => void;
};

/**
 * Attach dev-only query instrumentation to the Prisma client: warn on slow
 * queries (> PRISMA_SLOW_QUERY_MS, default 100ms) and flag likely N+1 patterns
 * (the same normalized statement executed NPLUS1_THRESHOLD+ times within one
 * second — the signature of a per-row query inside a loop). Never enabled in
 * production; it adds per-query overhead and is a development aid only.
 */
export function attachQueryLogging(prisma: PrismaClient): void {
  const seen = new Map<string, { count: number; windowStart: number }>();

  (prisma as unknown as QueryEmitter).$on('query', (event) => {
    if (event.duration >= SLOW_MS) {
      console.warn(`[prisma] slow query ${event.duration}ms: ${event.query.slice(0, 200)}`);
    }

    // Normalize positional params ($1, $2, …) so repeated per-row lookups collapse
    // to one signature.
    const signature = event.query.replace(/\$\d+/g, '?');
    const now = Date.now();
    const record = seen.get(signature);
    if (!record || now - record.windowStart > NPLUS1_WINDOW_MS) {
      seen.set(signature, { count: 1, windowStart: now });
    } else {
      record.count += 1;
      if (record.count === NPLUS1_THRESHOLD) {
        console.warn(
          `[prisma] possible N+1: ${record.count}+ identical queries in <1s — ${signature.slice(0, 160)}`,
        );
      }
    }
  });
}

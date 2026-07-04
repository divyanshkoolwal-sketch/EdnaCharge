/** @file packages/db/src/index.ts. */
import { PrismaClient } from '@prisma/client';
import { attachQueryLogging } from './query-log.js';

declare global {
  var __edna_prisma: PrismaClient | undefined;
  var __edna_query_logging: boolean | undefined;
}

// Per-query event logging is enabled only in local development — never in
// production (adds overhead) and never in test (keeps suites deterministic and
// quiet). Elsewhere the client stays on the original warn/error logging.
const devQueryLog = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

/// Singleton PrismaClient. Reused across hot-reloads in dev to avoid exhausting
/// the connection pool.
export const prisma: PrismaClient =
  globalThis.__edna_prisma ??
  new PrismaClient({
    log: devQueryLog ? [{ emit: 'event', level: 'query' }, 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalThis.__edna_prisma = prisma;

// Slow-query + N+1 detection (dev only). Guard against hot-reload stacking
// duplicate listeners on the cached singleton.
if (devQueryLog && !globalThis.__edna_query_logging) {
  globalThis.__edna_query_logging = true;
  attachQueryLogging(prisma);
}

export * from '@prisma/client';

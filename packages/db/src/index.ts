/** @file packages/db/src/index.ts. */
import { PrismaClient } from '@prisma/client';

declare global {
  var __edna_prisma: PrismaClient | undefined;
}

/// Singleton PrismaClient. Reused across hot-reloads in dev to avoid exhausting
/// the connection pool.
export const prisma: PrismaClient =
  globalThis.__edna_prisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') globalThis.__edna_prisma = prisma;

export * from '@prisma/client';

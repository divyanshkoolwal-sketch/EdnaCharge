// Prisma client re-export. Populated once `prisma generate` runs in Phase 1.
// For Phase 0 we expose a lazy getter so importers compile even before generate.
export type PrismaClient = unknown;

export function getPrisma(): PrismaClient {
  throw new Error(
    'Prisma client not generated yet. Run `pnpm -F @edna/db generate` after Phase 1 schema is in place.',
  );
}

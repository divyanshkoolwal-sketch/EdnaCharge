import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { verifyJwt } from './lib/supabase.js';
import { prisma } from '@edna/db';

export type Context = {
  userId: string | null;
  email: string | null;
};

export async function createContext({ req }: CreateFastifyContextOptions): Promise<Context> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return { userId: null, email: null };
  const token = auth.slice('Bearer '.length);
  const v = await verifyJwt(token);
  return v ? { userId: v.userId, email: v.email } : { userId: null, email: null };
}

const t = initTRPC.context<Context>().create({
  // tRPC's default formatter includes the full server stack in `data.stack`.
  // Strip it outside development so error responses don't leak file paths,
  // line numbers, and internal module structure to clients.
  errorFormatter({ shape }) {
    if (process.env.NODE_ENV === 'production') {
      const data = (shape.data as Record<string, unknown> | undefined) ?? {};
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { stack, ...rest } = data;
      return { ...shape, data: rest };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Bootstrap the User row on the first authenticated touch. Every protected
// procedure relies on `User { id: ctx.userId }` existing — without this guard
// we hit "Record to update not found" / FK violations on any procedure that
// runs before the mobile app happens to call `auth.getSession`. Cheap (one
// indexed lookup) and idempotent.
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' });
  // AUDIT L4: phone-only Supabase users have no email; fall back to a stable
  // placeholder derived from the userId so downstream code (e.g. fullName
  // bootstrap in auth.getSession) doesn't produce empty strings.
  const email = ctx.email && ctx.email.length > 0 ? ctx.email : `user-${ctx.userId.slice(0, 8)}`;

  const exists = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true },
  });
  if (!exists) {
    const fallbackName = email.split('@')[0] || 'user';
    // Race-safe: if a concurrent request created the row, swallow P2002.
    await prisma.user
      .create({
        data: { id: ctx.userId, email, fullName: fallbackName },
      })
      .catch((err: { code?: string }) => {
        if (err?.code !== 'P2002') throw err;
      });
  }

  return next({ ctx: { userId: ctx.userId, email } });
});

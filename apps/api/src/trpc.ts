import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { verifyJwt } from './lib/supabase.js';

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

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' });
  // AUDIT L4: phone-only Supabase users have no email; fall back to a stable
  // placeholder derived from the userId so downstream code (e.g. fullName
  // bootstrap in auth.getSession) doesn't produce empty strings.
  const email = ctx.email && ctx.email.length > 0 ? ctx.email : `user-${ctx.userId.slice(0, 8)}`;
  return next({ ctx: { userId: ctx.userId, email } });
});

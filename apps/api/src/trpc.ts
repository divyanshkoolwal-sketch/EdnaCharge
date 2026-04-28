import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { verifyFirebaseIdToken, type VerifiedFirebaseUser } from './lib/firebase.js';
import { prisma } from '@edna/db';

export type Context = {
  userId: string | null;
  email: string | null;
  firebaseUser: VerifiedFirebaseUser | null;
};

export async function createContext({ req }: CreateFastifyContextOptions): Promise<Context> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return { userId: null, email: null, firebaseUser: null };
  const token = auth.slice('Bearer '.length);
  const v = await verifyFirebaseIdToken(token);
  return v
    ? { userId: null, email: v.email, firebaseUser: v }
    : { userId: null, email: null, firebaseUser: null };
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
  if (!ctx.firebaseUser) throw new TRPCError({ code: 'UNAUTHORIZED' });
  const authUser = ctx.firebaseUser;
  const email =
    authUser.email && authUser.email.length > 0
      ? authUser.email.toLowerCase()
      : `firebase-${authUser.firebaseUid}@ednacharge.local`;
  const fullName = authUser.name?.trim() || email.split('@')[0] || 'user';

  let user = await prisma.user.findFirst({
    where: {
      OR: [{ firebaseUid: authUser.firebaseUid }, { email }],
    },
    select: { id: true, firebaseUid: true, fullName: true, avatarUrl: true },
  });

  if (user) {
    const shouldUpdate =
      user.firebaseUid !== authUser.firebaseUid ||
      (authUser.picture && user.avatarUrl !== authUser.picture) ||
      (!user.fullName && fullName);

    if (shouldUpdate) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firebaseUid: authUser.firebaseUid,
          avatarUrl: authUser.picture ?? user.avatarUrl,
          fullName: user.fullName || fullName,
        },
        select: { id: true, firebaseUid: true, fullName: true, avatarUrl: true },
      });
    }
  } else {
    user = await prisma.user
      .create({
        data: {
          firebaseUid: authUser.firebaseUid,
          email,
          fullName,
          avatarUrl: authUser.picture,
        },
        select: { id: true, firebaseUid: true, fullName: true, avatarUrl: true },
      })
      .catch(async (err: { code?: string }) => {
        if (err?.code !== 'P2002') throw err;
        return prisma.user.findFirstOrThrow({
          where: {
            OR: [{ firebaseUid: authUser.firebaseUid }, { email }],
          },
          select: { id: true, firebaseUid: true, fullName: true, avatarUrl: true },
        });
      });
  }

  return next({ ctx: { userId: user.id, email, firebaseUser: authUser } });
});

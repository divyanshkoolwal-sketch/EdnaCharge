import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { verifyAccessToken, type VerifiedUser } from './lib/auth.js';
import { prisma } from '@edna/db';

export type Context = {
  userId: string | null;
  email: string | null;
  authUser: VerifiedUser | null;
};

export async function createContext({ req }: CreateFastifyContextOptions): Promise<Context> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return { userId: null, email: null, authUser: null };
  const token = auth.slice('Bearer '.length);
  const v = await verifyAccessToken(token);
  return v
    ? { userId: null, email: v.email, authUser: v }
    : { userId: null, email: null, authUser: null };
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
//
// Identity model: `User.id` IS the Supabase auth user id (auth.users.id). This
// is what makes RLS `auth.uid() = User.id` (and the FK-based party policies)
// line up for the authenticated client.
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.authUser) throw new TRPCError({ code: 'UNAUTHORIZED' });
  const authUser = ctx.authUser;

  // Email-verification gate. Allow accounts without an email (dev tokens).
  // Reject email accounts whose address hasn't been confirmed — otherwise
  // anyone can register `fake@anything.com` and use the app. (App Store
  // reviewers probe for this.) With Supabase email-confirmation disabled today
  // this passes immediately; it becomes meaningful the moment confirmation is
  // turned on.
  const hasEmail = authUser.email && authUser.email.length > 0;
  if (hasEmail && authUser.emailVerified === false) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Please verify your email before continuing. Check your inbox for the verification link.',
    });
  }

  const email = hasEmail
    ? authUser.email!.toLowerCase()
    : `user-${authUser.id}@ednacharge.local`;
  const fullName = authUser.name?.trim() || email.split('@')[0] || 'user';

  // Identity is keyed on the Supabase auth id ONLY (User.id === auth.users.id).
  // We never look up by email and rebind (that was an account-takeover vector).
  // If the email is already owned by a different id we refuse rather than merge.
  let user = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { id: true, fullName: true, avatarUrl: true },
  });

  if (user) {
    // Returning user — id already matches, so only refresh avatar/name.
    const shouldUpdate =
      (authUser.avatarUrl && user.avatarUrl !== authUser.avatarUrl) ||
      (!user.fullName && fullName);

    if (shouldUpdate) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          avatarUrl: authUser.avatarUrl ?? user.avatarUrl,
          fullName: user.fullName || fullName,
        },
        select: { id: true, fullName: true, avatarUrl: true },
      });
    }
  } else {
    // No account for this auth id yet. Refuse if the email is already taken by
    // another id (no implicit account merge/takeover).
    const emailOwner = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (emailOwner && emailOwner.id !== authUser.id) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'An account already exists for this email. Sign in with the method you originally used.',
      });
    }
    user = await prisma.user
      .create({
        data: {
          id: authUser.id,
          email,
          fullName,
          avatarUrl: authUser.avatarUrl,
        },
        select: { id: true, fullName: true, avatarUrl: true },
      })
      .catch(async (err: { code?: string }) => {
        if (err?.code !== 'P2002') throw err;
        // Unique-constraint race. If our id's row now exists, use it; otherwise
        // the email was just claimed by a different id → refuse.
        const byId = await prisma.user.findUnique({
          where: { id: authUser.id },
          select: { id: true, fullName: true, avatarUrl: true },
        });
        if (byId) return byId;
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'An account already exists for this email. Sign in with the method you originally used.',
        });
      });
  }

  return next({ ctx: { userId: user.id, email, authUser } });
});

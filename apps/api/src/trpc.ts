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

  // Email-verification gate. Allow phone-only accounts (Firebase issues those
  // without an email field) and dev tokens (no `email` field unless we set
  // it). Reject email-based sign-ups whose address hasn't been verified —
  // otherwise anyone can register `fake@anything.com` and use the app.
  //
  // App Store reviewers explicitly probe for this; failing it causes a
  // "your app accepts unverified accounts" flag.
  const hasEmail = authUser.email && authUser.email.length > 0;
  if (hasEmail && authUser.emailVerified === false) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Please verify your email before continuing. Check your inbox for the verification link.',
    });
  }

  const email = hasEmail
    ? authUser.email!.toLowerCase()
    : `firebase-${authUser.firebaseUid}@ednacharge.local`;
  const fullName = authUser.name?.trim() || email.split('@')[0] || 'user';

  // SECURITY: identity is keyed on the Firebase UID ONLY. We deliberately do
  // NOT look an account up by email — matching on email and then rebinding
  // `firebaseUid` (as the old OR-lookup did) let a second Firebase identity
  // carrying the same provider-verified email silently take over an existing
  // account (and its bookings / host profile / Stripe customer). If the email
  // is already owned by a different UID we refuse rather than merge.
  let user = await prisma.user.findUnique({
    where: { firebaseUid: authUser.firebaseUid },
    select: { id: true, firebaseUid: true, fullName: true, avatarUrl: true },
  });

  if (user) {
    // Returning user — the UID already matches, so only refresh avatar/name.
    // The firebaseUid is never rewritten.
    const shouldUpdate =
      (authUser.picture && user.avatarUrl !== authUser.picture) ||
      (!user.fullName && fullName);

    if (shouldUpdate) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          avatarUrl: authUser.picture ?? user.avatarUrl,
          fullName: user.fullName || fullName,
        },
        select: { id: true, firebaseUid: true, fullName: true, avatarUrl: true },
      });
    }
  } else {
    // No account for this UID. Refuse if the email is already taken by another
    // UID (no implicit account merge/takeover).
    const emailOwner = await prisma.user.findUnique({
      where: { email },
      select: { firebaseUid: true },
    });
    if (emailOwner && emailOwner.firebaseUid !== authUser.firebaseUid) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'An account already exists for this email. Sign in with the method you originally used.',
      });
    }
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
        // Unique-constraint race. If our UID's row now exists, use it; otherwise
        // the email was just claimed by a different UID → refuse.
        const byUid = await prisma.user.findUnique({
          where: { firebaseUid: authUser.firebaseUid },
          select: { id: true, firebaseUid: true, fullName: true, avatarUrl: true },
        });
        if (byUid) return byUid;
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'An account already exists for this email. Sign in with the method you originally used.',
        });
      });
  }

  return next({ ctx: { userId: user.id, email, firebaseUser: authUser } });
});

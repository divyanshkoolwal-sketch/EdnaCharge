/** Stripe Identity procedures for user verification. */
import { prisma } from '@edna/db';
import { protectedProcedure } from '../../trpc.js';
import { stripe, devBypassStripe } from '../../lib/stripe.js';
import { logger } from '../../logger.js';
import { requireAnyUserAccess } from '../../lib/access.js';

export const startIdentityVerification = protectedProcedure.mutation(async ({ ctx }) => {
  await requireAnyUserAccess(ctx.userId);
  const existing = await prisma.identityVerification.findUnique({ where: { userId: ctx.userId } });
  if (existing?.status === 'verified') {
    return {
      url: null as string | null,
      verificationSessionId: existing.stripeVerificationSessionId,
      clientSecret: null as string | null,
      devBypass: false as const,
      alreadyVerified: true as const,
    };
  }

  if (devBypassStripe()) {
    const fakeId = `vs_dev_${ctx.userId.slice(0, 8)}`;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    await prisma.identityVerification.upsert({
      where: { userId: ctx.userId },
      create: {
        userId: ctx.userId,
        stripeVerificationSessionId: fakeId,
        status: 'verified',
        verifiedName: user.fullName,
        verifiedAt: new Date(),
        documentType: 'driving_license',
        documentLast4: '0000',
      },
      update: {
        stripeVerificationSessionId: fakeId,
        status: 'verified',
        verifiedName: user.fullName,
        verifiedAt: new Date(),
      },
    });
    return {
      url: null as string | null,
      verificationSessionId: fakeId,
      clientSecret: null as string | null,
      devBypass: true as const,
      alreadyVerified: false as const,
    };
  }

  const s = stripe();
  if (existing?.status === 'processing' && existing.stripeVerificationSessionId) {
    try {
      const live = await s.identity.verificationSessions.retrieve(
        existing.stripeVerificationSessionId,
      );
      if (live.status === 'requires_input' && live.url) {
        return {
          url: live.url,
          verificationSessionId: live.id,
          clientSecret: live.client_secret,
          devBypass: false as const,
          alreadyVerified: false as const,
        };
      }
    } catch {
      // Session vanished; create a fresh one below.
    }
  }

  const session = await s.identity.verificationSessions.create({
    type: 'document',
    metadata: { ednaUserId: ctx.userId },
    options: {
      document: {
        require_matching_selfie: true,
        require_live_capture: true,
        allowed_types: ['driving_license', 'id_card', 'passport'],
      },
    },
  });
  await prisma.identityVerification.upsert({
    where: { userId: ctx.userId },
    create: {
      userId: ctx.userId,
      stripeVerificationSessionId: session.id,
      status: 'processing',
    },
    update: {
      stripeVerificationSessionId: session.id,
      status: 'processing',
      failureReason: null,
    },
  });
  return {
    url: session.url,
    verificationSessionId: session.id,
    clientSecret: session.client_secret,
    devBypass: false as const,
    alreadyVerified: false as const,
  };
});

export const identityVerificationStatus = protectedProcedure.query(async ({ ctx }) => {
  await requireAnyUserAccess(ctx.userId);
  const row = await prisma.identityVerification.findUnique({ where: { userId: ctx.userId } });
  if (!row) return { status: 'unstarted' as const, failureReason: null, verifiedAt: null };
  return {
    status: row.status,
    failureReason: row.failureReason,
    verifiedAt: row.verifiedAt,
    verifiedName: row.verifiedName,
    documentType: row.documentType,
    documentLast4: row.documentLast4,
  };
});

export const cancelIdentityVerification = protectedProcedure.mutation(async ({ ctx }) => {
  await requireAnyUserAccess(ctx.userId);
  const row = await prisma.identityVerification.findUnique({ where: { userId: ctx.userId } });
  if (!row || !row.stripeVerificationSessionId) return { ok: true as const };
  if (row.status === 'verified' || row.status === 'canceled') return { ok: true as const };

  if (!devBypassStripe()) {
    try {
      await stripe().identity.verificationSessions.cancel(row.stripeVerificationSessionId);
    } catch (err) {
      logger.warn({ err }, 'cancelIdentityVerification: stripe cancel failed');
    }
  }
  await prisma.identityVerification.update({
    where: { userId: ctx.userId },
    data: { status: 'canceled' },
  });
  return { ok: true as const };
});

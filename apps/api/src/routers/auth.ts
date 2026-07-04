/** Public auth and onboarding router. */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { stripe, devBypassStripe } from '../lib/stripe.js';
import {
  DriverProfileInputZ,
  HostIdentityInputZ,
  UpdateProfileInputZ,
  UploadAvatarInputZ,
} from '@edna/schemas';
import { uploadAvatar } from '../lib/supabase.js';
import { logger } from '../logger.js';
import { grantHostAccess, requireUserAccess } from '../lib/access.js';
import {
  startIdentityVerification,
  identityVerificationStatus,
  cancelIdentityVerification,
} from './auth/identity.js';
import { deleteAccount } from './auth/account-deletion.js';

const USER_PUBLIC_SELECT = { id: true, fullName: true, avatarUrl: true } as const;

export const authRouter = router({
  getSession: protectedProcedure.query(async ({ ctx }) => {
    return prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      include: {
        driverProfile: true,
        hostProfile: true,
        identityVerification: true,
        accessGrants: true,
        appWaitlistEntries: true,
      },
    });
  }),

  updateProfile: protectedProcedure.input(UpdateProfileInputZ).mutation(async ({ ctx, input }) => {
    return prisma.user.update({
      where: { id: ctx.userId },
      data: { fullName: input.fullName.trim() },
      select: USER_PUBLIC_SELECT,
    });
  }),

  uploadAvatar: protectedProcedure.input(UploadAvatarInputZ).mutation(async ({ ctx, input }) => {
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.length === 0 || bytes.length > 3_000_000) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Image must be under 3MB.' });
    }
    let url: string;
    try {
      url = await uploadAvatar(ctx.userId, bytes, input.mime);
    } catch (err) {
      logger.error({ err, userId: ctx.userId }, 'avatar upload failed');
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Could not upload your photo. Please try again.',
      });
    }
    await prisma.user.update({ where: { id: ctx.userId }, data: { avatarUrl: url } });
    return { avatarUrl: url };
  }),

  completeDriverProfile: protectedProcedure
    .input(DriverProfileInputZ)
    .mutation(async ({ ctx, input }) => {
      await requireUserAccess(ctx.userId, 'driver');
      const { fullName, ...profile } = input;
      await prisma.user.update({ where: { id: ctx.userId }, data: { fullName } });
      return prisma.driverProfile.upsert({
        where: { userId: ctx.userId },
        create: { userId: ctx.userId, ...profile },
        update: profile,
      });
    }),

  submitHostIdentity: protectedProcedure
    .input(HostIdentityInputZ)
    .mutation(async ({ ctx, input }) => {
      await requireUserAccess(ctx.userId, 'host');
      return prisma.hostProfile.upsert({
        where: { userId: ctx.userId },
        create: { userId: ctx.userId, ...input, dob: new Date(input.dob) },
        update: { ...input, dob: new Date(input.dob) },
      });
    }),

  startHostOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    await requireUserAccess(ctx.userId, 'host');
    const profile = await prisma.hostProfile.findUnique({ where: { userId: ctx.userId } });
    if (!profile) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Submit host identity first.' });
    }
    if (devBypassStripe()) {
      const devAccount = `acct_dev_${ctx.userId.slice(0, 8)}`;
      await prisma.hostProfile.update({
        where: { userId: ctx.userId },
        data: { stripeAccountId: devAccount, stripeOnboardingComplete: true },
      });
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { roles: { set: ['driver', 'host'] } },
      });
      await grantHostAccess(ctx.userId);
      return { url: 'edna-dev://stripe-skip', accountId: devAccount, devBypass: true as const };
    }
    const s = stripe();
    const isDevAccount = profile.stripeAccountId?.startsWith('acct_dev_') ?? false;
    let accountId = isDevAccount ? null : profile.stripeAccountId;
    if (!accountId) {
      const account = await s.accounts.create({
        type: 'express',
        country: profile.country,
        email: ctx.email,
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      });
      accountId = account.id;
      await prisma.hostProfile.update({
        where: { userId: ctx.userId },
        data: {
          stripeAccountId: accountId,
          ...(isDevAccount ? { stripeOnboardingComplete: false } : {}),
        },
      });
    }
    const baseUrl = process.env.API_URL ?? 'http://localhost:3000';
    const link = await s.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/stripe/onboarding/refresh`,
      return_url: `${baseUrl}/stripe/onboarding/return`,
      type: 'account_onboarding',
    });
    return { url: link.url, accountId, devBypass: false as const };
  }),

  registerExpoPushToken: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(512).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.user.update({ where: { id: ctx.userId }, data: { expoPushToken: input.token } });
      return { ok: true as const };
    }),

  startIdentityVerification,
  identityVerificationStatus,
  cancelIdentityVerification,
  deleteAccount,

  hostOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    await requireUserAccess(ctx.userId, 'host');
    const profile = await prisma.hostProfile.findUnique({ where: { userId: ctx.userId } });
    if (!profile?.stripeAccountId) return { status: 'not_started' as const };
    const isDevAccount = profile.stripeAccountId.startsWith('acct_dev_');
    if (devBypassStripe() || isDevAccount) {
      if (isDevAccount && !devBypassStripe()) return { status: 'not_started' as const };
      return {
        status: profile.stripeOnboardingComplete ? ('complete' as const) : ('pending' as const),
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
      };
    }
    const account = await stripe().accounts.retrieve(profile.stripeAccountId);
    const complete =
      account.details_submitted && account.charges_enabled && account.payouts_enabled;
    if (complete && !profile.stripeOnboardingComplete) {
      await prisma.hostProfile.update({
        where: { userId: ctx.userId },
        data: { stripeOnboardingComplete: true },
      });
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { roles: { set: ['driver', 'host'] } },
      });
      await grantHostAccess(ctx.userId);
    }
    return {
      status: complete ? ('complete' as const) : ('pending' as const),
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    };
  }),
});

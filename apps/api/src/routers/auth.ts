import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { stripe } from '../lib/stripe.js';
import {
  DriverProfileInputZ,
  ChargerIdentificationInputZ,
  HostIdentityInputZ,
} from '@edna/schemas';

export const authRouter = router({
  getSession: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      include: { driverProfile: true, hostProfile: true },
    });
    if (!user) {
      // first call after signup — bootstrap the User row.
      const created = await prisma.user.create({
        data: { id: ctx.userId, email: ctx.email, fullName: ctx.email.split('@')[0] ?? 'user' },
        include: { driverProfile: true, hostProfile: true },
      });
      return created;
    }
    return user;
  }),

  completeDriverProfile: protectedProcedure
    .input(DriverProfileInputZ)
    .mutation(async ({ ctx, input }) => {
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
      return prisma.hostProfile.upsert({
        where: { userId: ctx.userId },
        create: { userId: ctx.userId, ...input, dob: new Date(input.dob) },
        update: { ...input, dob: new Date(input.dob) },
      });
    }),

  submitChargerIdentification: protectedProcedure
    .input(ChargerIdentificationInputZ)
    .mutation(async ({ ctx, input }) => {
      const hardwareSetup = { ...input, submittedAt: new Date().toISOString() };
      const host = await prisma.hostProfile.findUnique({ where: { userId: ctx.userId } });
      if (!host) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Complete identity step before charger identification.',
        });
      }
      return prisma.hostProfile.update({
        where: { userId: ctx.userId },
        data: { hardwareSetup },
      });
    }),

  startHostOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await prisma.hostProfile.findUnique({ where: { userId: ctx.userId } });
    if (!profile) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Submit host identity first.' });
    }
    const s = stripe();
    let accountId = profile.stripeAccountId;
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
        data: { stripeAccountId: accountId },
      });
    }
    const baseUrl = process.env.API_URL ?? 'http://localhost:3000';
    const link = await s.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/stripe/onboarding/refresh`,
      return_url: `${baseUrl}/stripe/onboarding/return`,
      type: 'account_onboarding',
    });
    return { url: link.url, accountId };
  }),

  hostOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const profile = await prisma.hostProfile.findUnique({ where: { userId: ctx.userId } });
    if (!profile?.stripeAccountId) return { status: 'not_started' as const };
    const s = stripe();
    const account = await s.accounts.retrieve(profile.stripeAccountId);
    const complete = account.details_submitted && account.charges_enabled && account.payouts_enabled;
    if (complete && !profile.stripeOnboardingComplete) {
      await prisma.hostProfile.update({
        where: { userId: ctx.userId },
        data: { stripeOnboardingComplete: true },
      });
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { roles: { set: ['driver', 'host'] } },
      });
    }
    return {
      status: complete ? ('complete' as const) : ('pending' as const),
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    };
  }),
});

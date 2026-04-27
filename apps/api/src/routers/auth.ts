import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { stripe, devBypassStripe } from '../lib/stripe.js';
import {
  DriverProfileInputZ,
  ChargerIdentificationInputZ,
  HostIdentityInputZ,
} from '@edna/schemas';
import { setHardwareSetup } from '../lib/hardwareSetup.js';

export const authRouter = router({
  // protectedProcedure middleware guarantees the User row exists by the time
  // this resolver runs (see apps/api/src/trpc.ts), so a single read is enough.
  getSession: protectedProcedure.query(async ({ ctx }) => {
    return prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      include: { driverProfile: true, hostProfile: true },
    });
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
      const host = await prisma.hostProfile.findUnique({ where: { userId: ctx.userId } });
      if (!host) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Complete identity step before charger identification.',
        });
      }
      // AUDIT M7: route through the validated helper so the jsonb column only
      // ever accepts shapes that satisfy HardwareSetupZ.
      await setHardwareSetup(ctx.userId, {
        ...input,
        submittedAt: new Date().toISOString(),
      });
      return prisma.hostProfile.findUniqueOrThrow({ where: { userId: ctx.userId } });
    }),

  startHostOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await prisma.hostProfile.findUnique({ where: { userId: ctx.userId } });
    if (!profile) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Submit host identity first.' });
    }
    // Dev bypass: stamp dev placeholders + flip role so the rest of the host
    // surface (Add charger, Requests, Earnings) becomes reachable without a
    // real Stripe Connect account. The mobile screen sees devBypass=true and
    // routes straight to the Done screen.
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
      return {
        url: 'edna-dev://stripe-skip',
        accountId: devAccount,
        devBypass: true as const,
      };
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
    return { url: link.url, accountId, devBypass: false as const };
  }),

  // AUDIT L5: persist the Expo push token on the User row so the worker's
  // notify() can reach the device. Idempotent — re-issuing the same token is
  // a no-op; a null token clears it (e.g. on logout / token refresh failure).
  registerExpoPushToken: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(512).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { expoPushToken: input.token },
      });
      return { ok: true as const };
    }),

  hostOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const profile = await prisma.hostProfile.findUnique({ where: { userId: ctx.userId } });
    if (!profile?.stripeAccountId) return { status: 'not_started' as const };
    // Dev bypass: trust the row, don't call Stripe.
    if (devBypassStripe()) {
      return {
        status: profile.stripeOnboardingComplete
          ? ('complete' as const)
          : ('pending' as const),
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
      };
    }
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

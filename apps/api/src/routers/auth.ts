import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { stripe, devBypassStripe } from '../lib/stripe.js';
import {
  DriverProfileInputZ,
  ChargerIdentificationInputZ,
  HostIdentityInputZ,
  UpdateProfileInputZ,
  UploadAvatarInputZ,
} from '@edna/schemas';
import { setHardwareSetup } from '../lib/hardwareSetup.js';
import { uploadAvatar } from '../lib/supabase.js';
import { logger } from '../logger.js';

const USER_PUBLIC_SELECT = {
  id: true,
  fullName: true,
  avatarUrl: true,
} as const;

export const authRouter = router({
  // protectedProcedure middleware guarantees the User row exists by the time
  // this resolver runs (see apps/api/src/trpc.ts), so a single read is enough.
  getSession: protectedProcedure.query(async ({ ctx }) => {
    return prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      include: { driverProfile: true, hostProfile: true, identityVerification: true },
    });
  }),

  // Edit profile: update the display name (avatars go through uploadAvatar).
  updateProfile: protectedProcedure
    .input(UpdateProfileInputZ)
    .mutation(async ({ ctx, input }) => {
      return prisma.user.update({
        where: { id: ctx.userId },
        data: { fullName: input.fullName.trim() },
        select: USER_PUBLIC_SELECT,
      });
    }),

  // Upload a profile photo: store the image in Supabase Storage and persist the
  // resulting public URL on the user.
  uploadAvatar: protectedProcedure
    .input(UploadAvatarInputZ)
    .mutation(async ({ ctx, input }) => {
      // Buffer.from with 'base64' never throws (it drops invalid chars); the
      // size guard below is the real validation.
      const bytes = Buffer.from(input.base64, 'base64');
      // Hard cap ~3MB decoded to protect Storage + the DB.
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
    // Discard leftover dev placeholders from earlier dev-bypass mode —
    // `acct_dev_*` isn't a real Stripe account and `accountLinks.create`
    // would 400 on it.
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
          // Reset the onboarding flag if we're upgrading from a dev account
          // — Stripe needs to actually onboard the user.
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

  // ─── Identity verification (Stripe Identity) ─────────────────────────────
  // Drivers must verify before booking; hosts must verify before listing a
  // charger. Users can browse the rest of the app freely while unverified.

  startIdentityVerification: protectedProcedure.mutation(async ({ ctx }) => {
    // Already verified — short-circuit.
    const existing = await prisma.identityVerification.findUnique({
      where: { userId: ctx.userId },
    });
    if (existing?.status === 'verified') {
      return {
        url: null as string | null,
        verificationSessionId: existing.stripeVerificationSessionId,
        clientSecret: null as string | null,
        devBypass: false as const,
        alreadyVerified: true as const,
      };
    }

    // Dev mode: instantly mark verified so demos work without real Stripe keys.
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

    // Real Stripe Identity flow.
    const s = stripe();

    // Idempotency: if a session is already processing, reuse its URL instead
    // of opening a second one. Avoids leaking duplicate sessions when the
    // user double-taps "Verify now" or the screen re-mounts.
    if (existing?.status === 'processing' && existing.stripeVerificationSessionId) {
      try {
        const live = await s.identity.verificationSessions.retrieve(
          existing.stripeVerificationSessionId,
        );
        // Stripe sessions can move to 'verified' / 'requires_input' / 'canceled'
        // server-side. Only reuse if still actionable.
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
        // Session vanished — fall through and create a fresh one.
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
  }),

  identityVerificationStatus: protectedProcedure.query(async ({ ctx }) => {
    const row = await prisma.identityVerification.findUnique({
      where: { userId: ctx.userId },
    });
    if (!row) return { status: 'unstarted' as const, failureReason: null, verifiedAt: null };
    return {
      status: row.status,
      failureReason: row.failureReason,
      verifiedAt: row.verifiedAt,
      verifiedName: row.verifiedName,
      documentType: row.documentType,
      documentLast4: row.documentLast4,
    };
  }),

  // App Store Guideline 5.1.1(v) — apps that let users sign in must let
  // them delete the account in-app. This cascades through Prisma's
  // onDelete:Cascade chain (DriverProfile, HostProfile, IdentityVerification,
  // Charger, Booking, ChatMessage, Review, Payout) and best-effort cleans up
  // Stripe customer + Connect account. The user is signed out client-side
  // after this returns ok.
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      include: {
        driverBookings: { where: { status: { in: ['pending', 'confirmed', 'active'] } } },
        chargers: true,
        hostProfile: true,
      },
    });

    // 1. Cancel any in-flight Stripe payment intents on the driver side.
    if (!devBypassStripe()) {
      const s = stripe();
      for (const b of user.driverBookings) {
        if (b.stripePaymentIntentId && !b.stripePaymentIntentId.startsWith('pi_dev_')) {
          try {
            await s.paymentIntents.cancel(b.stripePaymentIntentId, undefined, {
              idempotencyKey: `cancel:${b.id}:account_deletion`,
            });
          } catch {
            // Already canceled / not cancelable — continue.
          }
        }
      }
      // 2. Delete the Stripe customer (driver).
      if (user.stripeCustomerId && !user.stripeCustomerId.startsWith('cus_dev_')) {
        try {
          await s.customers.del(user.stripeCustomerId);
        } catch {
          // Already gone or restricted — continue.
        }
      }
      // 3. Reject the Stripe Connect account (host). Stripe Connect Express
      //    accounts can't be hard-deleted, but `accounts.reject` flips them
      //    to inactive and disables payouts.
      const accountId = user.hostProfile?.stripeAccountId;
      if (accountId && !accountId.startsWith('acct_dev_')) {
        try {
          await s.accounts.reject(accountId, { reason: 'other' });
        } catch {
          // Already rejected / not rejectable — continue.
        }
      }
    }

    // 4. Delete the User row. Cascades clean the rest.
    await prisma.user.delete({ where: { id: ctx.userId } });

    return { ok: true as const };
  }),

  cancelIdentityVerification: protectedProcedure.mutation(async ({ ctx }) => {
    const row = await prisma.identityVerification.findUnique({
      where: { userId: ctx.userId },
    });
    if (!row || !row.stripeVerificationSessionId) return { ok: true as const };
    if (row.status === 'verified' || row.status === 'canceled') return { ok: true as const };

    if (!devBypassStripe()) {
      try {
        await stripe().identity.verificationSessions.cancel(row.stripeVerificationSessionId);
      } catch (err) {
        // Already canceled / completed — log and continue.
        logger.warn({ err }, 'cancelIdentityVerification: stripe cancel failed');
      }
    }
    await prisma.identityVerification.update({
      where: { userId: ctx.userId },
      data: { status: 'canceled' },
    });
    return { ok: true as const };
  }),

  hostOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const profile = await prisma.hostProfile.findUnique({ where: { userId: ctx.userId } });
    if (!profile?.stripeAccountId) return { status: 'not_started' as const };
    // Dev bypass OR a leftover dev placeholder from earlier dev-bypass mode:
    // trust the row, don't call Stripe (an `acct_dev_*` would fail the
    // accounts.retrieve call with "no such account").
    const isDevAccount = profile.stripeAccountId.startsWith('acct_dev_');
    if (devBypassStripe() || isDevAccount) {
      // If real Stripe is now live but the host's row still has `acct_dev_*`,
      // surface as `not_started` so they re-enter onboarding and we mint a
      // real account on the next `startHostOnboarding` call.
      if (isDevAccount && !devBypassStripe()) {
        return { status: 'not_started' as const };
      }
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

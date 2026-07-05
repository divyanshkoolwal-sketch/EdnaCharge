/** @file apps/api/src/routers/access.ts. */
import { TRPCError } from '@trpc/server';
import { prisma } from '@edna/db';
import { JoinAppWaitlistInputZ, RedeemInviteCodeInputZ } from '@edna/schemas';
import { router, protectedProcedure } from '../trpc.js';
import { hashInviteCode } from '../lib/access.js';

const INVALID_CODE = 'That invite code is not valid for this role.';
const CAMPAIGN = 'fremont-ground';

// Per-user throttle on invite-code attempts. redeemCode is authenticated, but
// without this a single account could brute-force high-entropy codes (the global
// per-IP limit is coarse and proxy-dependent). In-memory per instance — enough to
// make guessing infeasible; swap for a Redis-backed limiter if the API scales out.
const REDEEM_WINDOW_MS = 10 * 60_000;
const REDEEM_MAX_ATTEMPTS = 10;
const redeemAttempts = new Map<string, number[]>();

function assertRedeemAllowed(userId: string): void {
  const now = Date.now();
  const recent = (redeemAttempts.get(userId) ?? []).filter((t) => now - t < REDEEM_WINDOW_MS);
  if (recent.length >= REDEEM_MAX_ATTEMPTS) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many invite attempts. Please wait a few minutes and try again.',
    });
  }
  recent.push(now);
  redeemAttempts.set(userId, recent);
}

function waitlistData(userId: string, input: {
  role: 'driver' | 'host';
  city: string;
  postalCode: string;
  phone?: string;
  chargerBrand?: string;
  hasOcpp?: boolean;
  notes?: string;
}) {
  return {
    userId,
    role: input.role,
    city: input.city.trim(),
    postalCode: input.postalCode.trim(),
    phone: input.phone?.trim() || null,
    source: 'app_gate',
    campaign: CAMPAIGN,
    chargerBrand: input.chargerBrand?.trim() || null,
    hasOcpp: input.hasOcpp,
    notes: input.notes?.trim() || null,
    status: 'open',
  };
}

export const accessRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const [grants, waitlist] = await Promise.all([
      prisma.userAccessGrant.findMany({
        where: { userId: ctx.userId },
        select: { role: true, source: true, createdAt: true },
      }),
      prisma.appWaitlistEntry.findMany({
        where: { userId: ctx.userId },
        select: { role: true, status: true, createdAt: true, updatedAt: true },
      }),
    ]);
    return {
      grants,
      roles: {
        driver: grants.some((g) => g.role === 'driver'),
        host: grants.some((g) => g.role === 'host'),
      },
      waitlist,
    };
  }),

  redeemCode: protectedProcedure.input(RedeemInviteCodeInputZ).mutation(async ({ ctx, input }) => {
    assertRedeemAllowed(ctx.userId);
    const now = new Date();
    const codeHash = hashInviteCode(input.code);
    const grant = await prisma.$transaction(async (tx) => {
      const invite = await tx.inviteCode.findUnique({ where: { codeHash } });
      if (
        !invite ||
        invite.role !== input.role ||
        invite.disabledAt ||
        (invite.expiresAt && invite.expiresAt <= now)
      ) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_CODE });
      }

      const previous = await tx.inviteRedemption.findUnique({
        where: { userId_inviteCodeId: { userId: ctx.userId, inviteCodeId: invite.id } },
      });
      if (!previous) {
        const updated = await tx.$executeRaw`
          UPDATE "InviteCode"
          SET "redeemedCount" = "redeemedCount" + 1, "updatedAt" = now()
          WHERE id = ${invite.id}::uuid
            AND "disabledAt" IS NULL
            AND ("expiresAt" IS NULL OR "expiresAt" > now())
            AND "redeemedCount" < "maxRedemptions"
        `;
        if (updated !== 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_CODE });
        }
        await tx.inviteRedemption.create({
          data: { userId: ctx.userId, inviteCodeId: invite.id, role: invite.role },
        });
      }
      return tx.userAccessGrant.upsert({
        where: { userId_role: { userId: ctx.userId, role: invite.role } },
        create: {
          userId: ctx.userId,
          role: invite.role,
          source: 'invite_code',
          inviteCodeId: invite.id,
        },
        update: {},
      });
    });
    return { grant };
  }),

  joinWaitlist: protectedProcedure.input(JoinAppWaitlistInputZ).mutation(async ({ ctx, input }) => {
    const data = waitlistData(ctx.userId, input);
    const entry = await prisma.appWaitlistEntry.upsert({
      where: { userId_role: { userId: ctx.userId, role: input.role } },
      create: data,
      update: { ...data, updatedAt: new Date() },
    });
    return { entry };
  }),
});

/** @file apps/api/src/routers/booking/modify.ts. */
import { TRPCError } from '@trpc/server';
import { createHash } from 'crypto';
import { prisma } from '@edna/db';
import { ModifyBookingInputZ, demandRateCents } from '@edna/schemas';
import { protectedProcedure } from '../../trpc.js';
import { devBypassStripe } from '../../lib/stripe.js';
import { estimateBooking } from '../../lib/pricing.js';
import { bookingsQueue } from '../../lib/queues.js';
import { cancelStripePaymentIntent, formatPacific, isOverlapConstraintError } from './helpers.js';
import { assertLaunchHardwareTier, assertOcppReady } from '../../lib/charger-readiness.js';
import { assertWindowAvailable } from '../../lib/availability.js';
import { authorizeBookingHold } from './payment-holds.js';
import { requireUserAccess } from '../../lib/access.js';

export const modifyBooking = protectedProcedure
  .input(ModifyBookingInputZ)
  .mutation(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, 'driver');
    const b = await prisma.booking.findUniqueOrThrow({
      where: { id: input.bookingId },
      include: { charger: true, chatThread: true },
    });
    if (b.driverId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
    if (b.status !== 'pending') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'You can only change the times before the host responds.',
      });
    }
    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    assertLaunchHardwareTier(b.charger.hardwareTier);
    if (b.charger.hardwareTier === 'tier_3_native') assertOcppReady(b.charger);
    assertWindowAvailable(b.charger.availability, start, end);
    const est = estimateBooking(demandRateCents(start), b.charger.powerKw, start, end);
    const isDev = devBypassStripe();
    if (b.startAt.getTime() === start.getTime() && b.endAt.getTime() === end.getTime()) {
      return { booking: b, estimate: est };
    }

    const idempotencyKey = createHash('sha256')
      .update(
        `booking:${ctx.userId}:${b.id}:${b.stripePaymentIntentId ?? 'none'}:${start.toISOString()}:${end.toISOString()}`,
      )
      .digest('hex');
    let stripePaymentIntentId = b.stripePaymentIntentId;
    const wasDevPi = b.stripePaymentIntentId?.startsWith('pi_dev_') ?? false;

    if (isDev || wasDevPi) {
      stripePaymentIntentId = await authorizeBookingHold({
        idempotencyKey,
        devMode: true,
        amountCents: est.totalCents,
        platformFeeCents: est.platformFeeCents,
        userId: ctx.userId,
        chargerId: b.charger.id,
      });
    } else {
      const driver = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      const host = await prisma.hostProfile.findUniqueOrThrow({
        where: { userId: b.charger.hostId },
      });
      stripePaymentIntentId = await authorizeBookingHold({
        idempotencyKey,
        devMode: false,
        amountCents: est.totalCents,
        platformFeeCents: est.platformFeeCents,
        customerId: driver.stripeCustomerId!,
        paymentMethodId: driver.defaultPaymentMethodId!,
        destinationAccountId: host.stripeAccountId!,
        receiptEmail: driver.email,
        userId: ctx.userId,
        chargerId: b.charger.id,
      });
    }

    // Void the newly-created hold unless we reused the old PI.
    const voidNewHold = (reason: string) =>
      stripePaymentIntentId !== b.stripePaymentIntentId
        ? cancelStripePaymentIntent(
            stripePaymentIntentId,
            `cancel:${stripePaymentIntentId}:${reason}`,
          )
        : Promise.resolve();

    // Atomic status guard: only rewrite the booking while it is still 'pending'.
    // If the host responded (or it auto-declined) between our read and this write,
    // an id-only update would corrupt a confirmed/cancelled booking and swap its
    // payment intent — so guard on status and treat a miss as a conflict.
    const res = await prisma.booking
      .updateMany({
        where: { id: b.id, status: 'pending' },
        data: {
          startAt: start,
          endAt: end,
          estimatedKwh: est.estimatedKwh,
          estimatedCostCents: est.energyCostCents,
          platformFeeCents: est.platformFeeCents,
          ratePerKwhCents: est.ratePerKwhCents,
          preauthAmountCents: est.totalCents,
          stripePaymentIntentId,
        },
      })
      .catch(async (err) => {
        await voidNewHold('modify_failed');
        if (isOverlapConstraintError(err)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'That time slot was just taken. Please pick another window.',
          });
        }
        throw err;
      });

    if (res.count !== 1) {
      await voidNewHold('modify_conflict');
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This booking was just responded to and can no longer be changed.',
      });
    }
    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });

    // Release the OLD hold DURABLY: enqueue a retryable cancel job rather than a
    // best-effort inline cancel whose failure was swallowed (leaking a second live
    // hold on the driver's card until it expired ~7 days later). The new hold is
    // already attached to the booking above, so the driver is never left without
    // a valid authorization.
    if (b.stripePaymentIntentId && b.stripePaymentIntentId !== stripePaymentIntentId) {
      await bookingsQueue.add(
        'cancel_hold',
        { paymentIntentId: b.stripePaymentIntentId, reason: `modify:${b.id}` },
        { jobId: `cancel_hold:${b.stripePaymentIntentId}` },
      );
    }
    if (b.chatThread) {
      await prisma.chatMessage.create({
        data: {
          threadId: b.chatThread.id,
          senderId: null,
          kind: 'system',
          body: `Booking updated to ${formatPacific(start)} PT.`,
        },
      });
    }
    return updated;
  });

/** Booking request procedure. */
import { TRPCError } from '@trpc/server';
import { createHash } from 'crypto';
import { prisma } from '@edna/db';
import { RequestBookingInputZ, demandRateCents } from '@edna/schemas';
import { protectedProcedure } from '../../trpc.js';
import { devBypassStripe } from '../../lib/stripe.js';
import { estimateBooking } from '../../lib/pricing.js';
import { notificationsQueue } from '../../lib/queues.js';
import {
  AUTO_DECLINE_MS,
  bookingsQueueSchedule,
  cancelStripePaymentIntent,
  formatPacific,
  isOverlapConstraintError,
} from './helpers.js';
import { assertLaunchHardwareTier, assertOcppReady } from '../../lib/charger-readiness.js';
import { assertWindowAvailable } from '../../lib/availability.js';
import { authorizeBookingHold } from './payment-holds.js';
import { requireUserAccess } from '../../lib/access.js';
import { capture } from '../../lib/analytics.js';

export const requestBooking = protectedProcedure
  .input(RequestBookingInputZ)
  .mutation(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, 'driver');
    const charger = await prisma.charger.findUniqueOrThrow({ where: { id: input.chargerId } });
    if (charger.hostId === ctx.userId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'You cannot book your own charger.',
      });
    }
    if (!charger.published || charger.status === 'offline') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'This charger just went offline. Try a different one nearby.',
      });
    }
    const host = await prisma.hostProfile.findUniqueOrThrow({ where: { userId: charger.hostId } });
    const isDev = devBypassStripe();
    const hostHasDevAccount = host.stripeAccountId?.startsWith('acct_dev_') ?? false;
    if (!isDev && (!host.stripeAccountId || !host.stripeOnboardingComplete || hostHasDevAccount)) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Host payouts not ready. The host needs to finish Stripe onboarding.',
      });
    }

    const driver = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      include: { identityVerification: true },
    });
    if (driver.identityVerification?.status !== 'verified') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Verify your ID before booking your first charging session.',
      });
    }
    if (isDev && (!driver.stripeCustomerId || !driver.defaultPaymentMethodId)) {
      await prisma.user.update({
        where: { id: ctx.userId },
        data: {
          stripeCustomerId: driver.stripeCustomerId ?? `cus_dev_${ctx.userId.slice(0, 8)}`,
          defaultPaymentMethodId: driver.defaultPaymentMethodId ?? 'pm_dev_card',
        },
      });
    } else if (!isDev) {
      const isDevCustomer = driver.stripeCustomerId?.startsWith('cus_dev_') ?? false;
      const isDevPm = driver.defaultPaymentMethodId === 'pm_dev_card';
      if (!driver.stripeCustomerId || !driver.defaultPaymentMethodId || isDevCustomer || isDevPm) {
        if (isDevCustomer || isDevPm) {
          await prisma.user.update({
            where: { id: ctx.userId },
            data: {
              stripeCustomerId: isDevCustomer ? null : driver.stripeCustomerId,
              defaultPaymentMethodId: isDevPm ? null : driver.defaultPaymentMethodId,
            },
          });
        }
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Save a card first.' });
      }
    }

    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    assertLaunchHardwareTier(charger.hardwareTier);
    if (charger.hardwareTier === 'tier_3_native') assertOcppReady(charger);
    assertWindowAvailable(charger.availability, start, end);
    const est = estimateBooking(demandRateCents(start), charger.powerKw, start, end);
    const existing = await prisma.booking.findFirst({
      where: {
        driverId: ctx.userId,
        chargerId: charger.id,
        startAt: start,
        endAt: end,
        status: { in: ['pending', 'confirmed', 'active'] },
      },
      include: { chatThread: true },
    });
    if (existing) {
      const thread =
        existing.chatThread ??
        (await prisma.chatThread.create({ data: { bookingId: existing.id } }));
      return { booking: existing, thread, estimate: est };
    }

    // Release any hold left live by a prior same-window request that ended in
    // `errored` (e.g. a Radar post-auth review) before we place a fresh hold —
    // otherwise re-requesting the same slot double-holds the driver's card.
    const staleErrored = await prisma.booking.findMany({
      where: {
        driverId: ctx.userId,
        chargerId: charger.id,
        startAt: start,
        endAt: end,
        status: 'errored',
        stripePaymentIntentId: { not: null },
      },
      select: { id: true, stripePaymentIntentId: true },
    });
    for (const s of staleErrored) {
      await cancelStripePaymentIntent(s.stripePaymentIntentId, `cancel:${s.id}:errored_rerequest`);
    }

    const sameWindowTerminalCount = await prisma.booking.count({
      where: {
        driverId: ctx.userId,
        chargerId: charger.id,
        startAt: start,
        endAt: end,
        status: { in: ['declined', 'cancelled', 'completed', 'no_show', 'errored'] },
      },
    });
    const idempotencyKey = createHash('sha256')
      .update(
        `booking:${ctx.userId}:${charger.id}:${start.toISOString()}:${end.toISOString()}:${sameWindowTerminalCount}`,
      )
      .digest('hex');

    const stripePaymentIntentId = await authorizeBookingHold({
      idempotencyKey,
      devMode: isDev,
      amountCents: est.totalCents,
      platformFeeCents: est.platformFeeCents,
      customerId: driver.stripeCustomerId!,
      paymentMethodId: driver.defaultPaymentMethodId!,
      destinationAccountId: host.stripeAccountId!,
      receiptEmail: driver.email,
      userId: ctx.userId,
      chargerId: charger.id,
    });

    const booking = await prisma.booking
      .create({
        data: {
          chargerId: charger.id,
          driverId: ctx.userId,
          startAt: start,
          endAt: end,
          estimatedKwh: est.estimatedKwh,
          estimatedCostCents: est.energyCostCents,
          platformFeeCents: est.platformFeeCents,
          ratePerKwhCents: est.ratePerKwhCents,
          preauthAmountCents: est.totalCents,
          driverMessage: input.message,
          stripePaymentIntentId,
          autoDeclineAt: new Date(Date.now() + AUTO_DECLINE_MS),
        },
      })
      .catch(async (err) => {
        const duplicate = await prisma.booking.findFirst({
          where: { stripePaymentIntentId },
          include: { chatThread: true },
        });
        if (duplicate) return duplicate;
        // The booking never persisted — void the card hold we placed above.
        await cancelStripePaymentIntent(
          stripePaymentIntentId,
          `cancel:${stripePaymentIntentId}:booking_create_failed`,
        );
        // A concurrent booking grabbed an overlapping slot. Return a friendly
        // conflict instead of a raw 500 after we've already voided the hold.
        if (isOverlapConstraintError(err)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'That time slot was just taken. Please pick another window.',
          });
        }
        throw err;
      });

    const retryThread = 'chatThread' in booking ? booking.chatThread : null;
    const thread =
      retryThread ?? (await prisma.chatThread.create({ data: { bookingId: booking.id } }));
    if (input.message) {
      await prisma.chatMessage.create({
        data: { threadId: thread.id, senderId: ctx.userId, kind: 'text', body: input.message },
      });
    }
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderId: null,
        kind: 'system',
        // Pacific time — a bare toLocaleString() renders in the server's zone (UTC).
        body: `Booking requested for ${formatPacific(start)} PT.`,
      },
    });

    await bookingsQueueSchedule(booking.id, AUTO_DECLINE_MS);
    await notificationsQueue.add('new_booking_request', {
      hostId: charger.hostId,
      bookingId: booking.id,
    });
    capture(ctx.userId, 'booking_requested', { chargerId: charger.id });
    return { booking, thread, estimate: est };
  });

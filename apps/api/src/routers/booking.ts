import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createHash } from 'crypto';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import {
  RequestBookingInputZ,
  RespondBookingInputZ,
  CancelBookingInputZ,
  StartSessionInputZ,
  StopSessionInputZ,
} from '@edna/schemas';
import { stripe } from '../lib/stripe.js';
import { estimateBooking } from '../lib/pricing.js';
import { ocppCommandsQueue, notificationsQueue, bookingsQueue } from '../lib/queues.js';
import { logger } from '../logger.js';
import { Sentry } from '../sentry.js';

const AUTO_DECLINE_MS = Number(process.env.AUTO_DECLINE_MS ?? 30 * 60 * 1000);

async function requireBookingParty(bookingId: string, userId: string) {
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { charger: true },
  });
  if (b.driverId !== userId && b.charger.hostId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return b;
}

export const bookingRouter = router({
  requestBooking: protectedProcedure
    .input(RequestBookingInputZ)
    .mutation(async ({ ctx, input }) => {
      const charger = await prisma.charger.findUniqueOrThrow({ where: { id: input.chargerId } });
      const host = await prisma.hostProfile.findUniqueOrThrow({ where: { userId: charger.hostId } });
      if (!host.stripeAccountId || !host.stripeOnboardingComplete) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Host payouts not ready.' });
      }
      const driver = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (!driver.stripeCustomerId || !driver.defaultPaymentMethodId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Save a card first.' });
      }

      const start = new Date(input.startAt);
      const end = new Date(input.endAt);
      const est = estimateBooking(charger, start, end);

      // AUDIT C3: deterministic idempotency key so client retries /
      // double-submits don't create N pre-auths + N booking rows.
      const idempotencyKey = createHash('sha256')
        .update(`booking:${ctx.userId}:${charger.id}:${start.toISOString()}:${end.toISOString()}`)
        .digest('hex');

      const pi = await stripe().paymentIntents.create(
        {
          amount: est.totalCents,
          currency: 'usd',
          customer: driver.stripeCustomerId,
          payment_method: driver.defaultPaymentMethodId,
          capture_method: 'manual',
          confirm: true,
          off_session: true,
          application_fee_amount: est.platformFeeCents,
          transfer_data: { destination: host.stripeAccountId },
          metadata: { ednaUserId: ctx.userId, chargerId: charger.id },
        },
        { idempotencyKey },
      );

      const booking = await prisma.booking.create({
        data: {
          chargerId: charger.id,
          driverId: ctx.userId,
          startAt: start,
          endAt: end,
          estimatedKwh: est.estimatedKwh,
          estimatedCostCents: est.energyCostCents,
          platformFeeCents: est.platformFeeCents,
          preauthAmountCents: est.totalCents,
          driverMessage: input.message,
          stripePaymentIntentId: pi.id,
          autoDeclineAt: new Date(Date.now() + AUTO_DECLINE_MS),
        },
      });

      const thread = await prisma.chatThread.create({ data: { bookingId: booking.id } });
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
          body: `Booking requested for ${start.toLocaleString()}.`,
        },
      });

      await bookingsQueueSchedule(booking.id, AUTO_DECLINE_MS);
      await notificationsQueue.add('new_booking_request', {
        hostId: charger.hostId,
        bookingId: booking.id,
      });

      return { booking, thread, estimate: est };
    }),

  respond: protectedProcedure
    .input(RespondBookingInputZ)
    .mutation(async ({ ctx, input }) => {
      const b = await prisma.booking.findUniqueOrThrow({
        where: { id: input.bookingId },
        include: { charger: true, chatThread: true },
      });
      if (b.charger.hostId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (b.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Booking already responded.' });
      }
      // AUDIT L6: remove the delayed auto-decline job so it doesn't fire later
      // and no-op against a non-pending row.
      await bookingsQueue.remove(`auto_decline:${b.id}`).catch((err) => {
        // Benign: job may have already fired or be gone.
        void err;
      });
      if (input.decision === 'accept') {
        // AUDIT H2: optimistic-lock update — if auto-decline raced between the
        // read above and this write, count === 0 and we bail instead of
        // silently flipping `declined` back to `confirmed` with no PI.
        const res = await prisma.booking.updateMany({
          where: { id: b.id, status: 'pending' },
          data: { status: 'confirmed', respondedAt: new Date() },
        });
        if (res.count !== 1) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Booking was already resolved (likely auto-declined).',
          });
        }
        if (b.chatThread) {
          await prisma.chatMessage.create({
            data: {
              threadId: b.chatThread.id,
              senderId: null,
              kind: 'system',
              body: 'Booking confirmed by host.',
            },
          });
        }
        await notificationsQueue.add('booking_accepted', {
          driverId: b.driverId,
          bookingId: b.id,
        });
      } else {
        // AUDIT H2: optimistic-lock on decline as well.
        const res = await prisma.booking.updateMany({
          where: { id: b.id, status: 'pending' },
          data: {
            status: 'declined',
            respondedAt: new Date(),
            declineReason: input.reason,
          },
        });
        if (res.count !== 1) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Booking was already resolved.',
          });
        }
        if (b.stripePaymentIntentId) {
          // AUDIT C3: idempotency key scoped per-booking so a retry doesn't
          // surface a noisy "already canceled" error.
          await stripe().paymentIntents.cancel(
            b.stripePaymentIntentId,
            undefined,
            { idempotencyKey: `cancel:${b.id}` },
          );
        }
        if (b.chatThread) {
          await prisma.chatMessage.create({
            data: {
              threadId: b.chatThread.id,
              senderId: null,
              kind: 'system',
              body: `Booking declined${input.reason ? `: ${input.reason}` : ''}.`,
            },
          });
        }
        await notificationsQueue.add('booking_declined', {
          driverId: b.driverId,
          bookingId: b.id,
        });
      }
      return prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    }),

  cancel: protectedProcedure
    .input(CancelBookingInputZ)
    .mutation(async ({ ctx, input }) => {
      const b = await requireBookingParty(input.bookingId, ctx.userId);
      if (!['pending', 'confirmed'].includes(b.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot cancel this booking.' });
      }
      if (b.stripePaymentIntentId) {
        // AUDIT (was silent-swallow): log failures so we can alert on PI
        // cancel errors instead of dropping them.
        try {
          await stripe().paymentIntents.cancel(
            b.stripePaymentIntentId,
            undefined,
            { idempotencyKey: `cancel:${b.id}` },
          );
        } catch (err) {
          logger.warn({ err, bookingId: b.id }, 'stripe cancel failed on booking cancel');
          Sentry.captureException(err);
        }
      }
      return prisma.booking.update({
        where: { id: b.id },
        data: { status: 'cancelled', declineReason: input.reason },
      });
    }),

  startSession: protectedProcedure
    .input(StartSessionInputZ)
    .mutation(async ({ ctx, input }) => {
      const b = await prisma.booking.findUniqueOrThrow({
        where: { id: input.bookingId },
        include: { charger: true },
      });
      if (b.driverId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (b.status !== 'confirmed') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Booking not confirmed.' });
      }
      if (!b.charger.ocppChargePointId) {
        // Tier 1/2/4 — mark active directly; no OCPP.
        await prisma.booking.update({ where: { id: b.id }, data: { status: 'active' } });
        return { status: 'started_virtual' as const };
      }
      await ocppCommandsQueue.add('RemoteStartTransaction', {
        kind: 'RemoteStartTransaction',
        chargePointId: b.charger.ocppChargePointId,
        idTag: `EDNA-${b.driverId.slice(0, 8)}`,
      });
      return { status: 'dispatched' as const };
    }),

  stopSession: protectedProcedure
    .input(StopSessionInputZ)
    .mutation(async ({ ctx, input }) => {
      const s = await prisma.chargingSession.findUniqueOrThrow({
        where: { id: input.sessionId },
        include: { booking: true, charger: true },
      });
      if (s.booking.driverId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (!s.ocppTransactionId || !s.charger.ocppChargePointId) {
        // Virtual-stop path for non-OCPP tiers.
        await prisma.chargingSession.update({
          where: { id: s.id },
          data: { endedAt: new Date() },
        });
        return { status: 'stopped_virtual' as const };
      }
      await ocppCommandsQueue.add('RemoteStopTransaction', {
        kind: 'RemoteStopTransaction',
        chargePointId: s.charger.ocppChargePointId,
        transactionId: s.ocppTransactionId,
      });
      return { status: 'dispatched' as const };
    }),

  list: protectedProcedure
    .input(
      z.object({
        role: z.enum(['driver', 'host']),
        status: z.string().optional(),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where =
        input.role === 'driver'
          ? { driverId: ctx.userId, ...(input.status ? { status: input.status as any } : {}) }
          : { charger: { hostId: ctx.userId }, ...(input.status ? { status: input.status as any } : {}) };
      const rows = await prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 25,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: { charger: true },
      });
      return { rows, nextCursor: rows.at(-1)?.id ?? null };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const b = await requireBookingParty(input.id, ctx.userId);
      return prisma.booking.findUniqueOrThrow({
        where: { id: b.id },
        include: { charger: true, session: true, chatThread: true },
      });
    }),
});

// Schedule the 30-min auto-decline job; pulled up here to keep requestBooking readable.
async function bookingsQueueSchedule(bookingId: string, delay: number) {
  await bookingsQueue.add(
    'auto_decline',
    { bookingId },
    { delay, jobId: `auto_decline:${bookingId}`, removeOnComplete: true, removeOnFail: true },
  );
}

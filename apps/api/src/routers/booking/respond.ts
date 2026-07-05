/** Host response and cancellation procedures for bookings. */
import { TRPCError } from '@trpc/server';
import { prisma } from '@edna/db';
import { RespondBookingInputZ, CancelBookingInputZ } from '@edna/schemas';
import { protectedProcedure } from '../../trpc.js';
import { bookingsQueue, notificationsQueue } from '../../lib/queues.js';
import { autoDeclineJobId } from '../../lib/auto-decline.js';
import { cancelStripePaymentIntent, requireBookingParty } from './helpers.js';
import { assertLaunchHardwareTier, assertOcppReady } from '../../lib/charger-readiness.js';
import { assertWindowAvailable } from '../../lib/availability.js';
import { requireUserAccess } from '../../lib/access.js';

export const respondBooking = protectedProcedure
  .input(RespondBookingInputZ)
  .mutation(async ({ ctx, input }) => {
    const b = await prisma.booking.findUniqueOrThrow({
      where: { id: input.bookingId },
      include: { charger: true, chatThread: true },
    });
    await requireUserAccess(ctx.userId, 'host');
    if (b.charger.hostId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
    if (b.status !== 'pending') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Booking already responded.' });
    }
    // NOTE: the auto-decline timer is removed only AFTER the booking successfully
    // leaves 'pending' (in each branch below). Removing it up front means a later
    // validation throw (hardware tier / OCPP readiness / availability / overlap)
    // would leave the booking stuck pending forever with no timer to resolve it.

    if (input.decision === 'accept') {
      assertLaunchHardwareTier(b.charger.hardwareTier);
      if (b.charger.hardwareTier === 'tier_3_native') assertOcppReady(b.charger);
      assertWindowAvailable(b.charger.availability, b.startAt, b.endAt);
      const overlap = await prisma.booking.findFirst({
        where: {
          id: { not: b.id },
          chargerId: b.chargerId,
          status: { in: ['confirmed', 'active'] },
          startAt: { lt: b.endAt },
          endAt: { gt: b.startAt },
        },
        select: { id: true },
      });
      if (overlap) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This overlaps another confirmed booking on the same charger.',
        });
      }
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
      await bookingsQueue.remove(autoDeclineJobId(b.id)).catch(() => {});
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
      await notificationsQueue.add('booking_accepted', { driverId: b.driverId, bookingId: b.id });
    } else {
      const res = await prisma.booking.updateMany({
        where: { id: b.id, status: 'pending' },
        data: { status: 'declined', respondedAt: new Date(), declineReason: input.reason },
      });
      if (res.count !== 1) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Booking was already resolved.' });
      }
      await bookingsQueue.remove(autoDeclineJobId(b.id)).catch(() => {});
      await cancelStripePaymentIntent(b.stripePaymentIntentId, `cancel:${b.id}`);
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
      await notificationsQueue.add('booking_declined', { driverId: b.driverId, bookingId: b.id });
    }
    return prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  });

export const cancelBooking = protectedProcedure
  .input(CancelBookingInputZ)
  .mutation(async ({ ctx, input }) => {
    const b = await requireBookingParty(input.bookingId, ctx.userId);
    await requireUserAccess(ctx.userId, b.driverId === ctx.userId ? 'driver' : 'host');
    if (!['pending', 'confirmed'].includes(b.status)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot cancel this booking.' });
    }
    await bookingsQueue.remove(autoDeclineJobId(b.id)).catch((err) => {
      void err;
    });
    await cancelStripePaymentIntent(b.stripePaymentIntentId, `cancel:${b.id}`);
    const updated = await prisma.booking.update({
      where: { id: b.id },
      data: { status: 'cancelled', declineReason: input.reason },
    });
    const thread = await prisma.chatThread.upsert({
      where: { bookingId: b.id },
      create: { bookingId: b.id },
      update: {},
    });
    const actor = ctx.userId === b.driverId ? 'driver' : 'host';
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderId: null,
        kind: 'system',
        body: `Booking cancelled by ${actor}${input.reason ? `: ${input.reason}` : ''}.`,
      },
    });
    if (actor === 'driver') {
      await notificationsQueue.add('booking_cancelled', {
        hostId: b.charger.hostId,
        bookingId: b.id,
      });
    } else {
      await notificationsQueue.add('booking_cancelled', {
        driverId: b.driverId,
        bookingId: b.id,
      });
    }
    return updated;
  });

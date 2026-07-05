/** Charging-session start and stop procedures for bookings. */
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'crypto';
import { prisma } from '@edna/db';
import { StartSessionInputZ, StopSessionInputZ } from '@edna/schemas';
import { protectedProcedure } from '../../trpc.js';
import { ocppCommandsQueue } from '../../lib/queues.js';
import { BILLING_JOB_OPTS, START_WINDOW_BUFFER_MS } from './helpers.js';
import { assertOcppReady } from '../../lib/charger-readiness.js';
import { logger } from '../../logger.js';
import { requireUserAccess } from '../../lib/access.js';

type RemoteStartCommandInput = {
  bookingId: string;
  chargePointId: string;
  idTag: string;
};

async function enqueueRemoteStartCommand(input: RemoteStartCommandInput) {
  try {
    await ocppCommandsQueue.add(
      'RemoteStartTransaction',
      {
        kind: 'RemoteStartTransaction',
        chargePointId: input.chargePointId,
        idTag: input.idTag,
        bookingId: input.bookingId,
      },
      {
        ...BILLING_JOB_OPTS,
        jobId: `remote-start:${input.bookingId}:${input.idTag}`,
      },
    );
  } catch (err) {
    logger.error({ err, bookingId: input.bookingId }, 'remote start queue enqueue failed');
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Could not send the charger start command. Please try again.',
    });
  }
}

export const startSession = protectedProcedure
  .input(StartSessionInputZ)
  .mutation(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, 'driver');
    const b = await prisma.booking.findUniqueOrThrow({
      where: { id: input.bookingId },
      include: { charger: true },
    });
    if (b.driverId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
    if (b.status !== 'confirmed') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Booking not confirmed.' });
    }
    const now = Date.now();
    if (
      now < b.startAt.getTime() - START_WINDOW_BUFFER_MS ||
      now > b.endAt.getTime() + START_WINDOW_BUFFER_MS
    ) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'You can start charging within 5 minutes of your booking window.',
      });
    }

    if (b.charger.hardwareTier === 'tier_3_native') {
      assertOcppReady(b.charger);
      if (!b.charger.ocppChargePointId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This Tier 3 charger has no OCPP credentials provisioned.',
        });
      }
      const AUTH_WINDOW_MS = 15 * 60_000;
      const stillAuthorized =
        !!b.ocppStartToken &&
        !!b.ocppAuthorizedAt &&
        Date.now() - b.ocppAuthorizedAt.getTime() < AUTH_WINDOW_MS;
      if (stillAuthorized) {
        await enqueueRemoteStartCommand({
          bookingId: b.id,
          chargePointId: b.charger.ocppChargePointId,
          idTag: b.ocppStartToken!,
        });
        return { status: 'dispatched' as const };
      }

      const startToken = randomBytes(8).toString('hex');
      const authRes = await prisma.booking.updateMany({
        where: { id: b.id, status: 'confirmed' },
        data: { ocppStartToken: startToken, ocppAuthorizedAt: new Date() },
      });
      if (authRes.count !== 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Booking not confirmed.' });
      }
      await enqueueRemoteStartCommand({
        bookingId: b.id,
        chargePointId: b.charger.ocppChargePointId,
        idTag: startToken,
      });
      return { status: 'dispatched' as const };
    }

    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'EdnaCharge v1 supports OCPP-connected chargers only.',
    });
  });

export const stopSession = protectedProcedure
  .input(StopSessionInputZ)
  .mutation(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, 'driver');
    const s = await prisma.chargingSession.findUniqueOrThrow({
      where: { id: input.sessionId },
      include: { booking: true, charger: true },
    });
    if (s.booking.driverId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });

    if (s.charger.hardwareTier !== 'tier_3_native') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'EdnaCharge v1 supports OCPP-connected chargers only.',
      });
    }
    if (!s.ocppTransactionId || !s.charger.ocppChargePointId) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'This charger has no active OCPP transaction to stop.',
      });
    }
    await ocppCommandsQueue.add(
      'RemoteStopTransaction',
      {
        kind: 'RemoteStopTransaction',
        chargePointId: s.charger.ocppChargePointId,
        transactionId: s.ocppTransactionId,
        bookingId: s.bookingId,
        sessionId: s.id,
      },
      BILLING_JOB_OPTS,
    );
    return { status: 'dispatched' as const };
  });

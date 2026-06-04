import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createHash } from 'crypto';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import {
  RequestBookingInputZ,
  ModifyBookingInputZ,
  RespondBookingInputZ,
  CancelBookingInputZ,
  StartSessionInputZ,
  StopSessionInputZ,
} from '@edna/schemas';
import { stripe, devBypassStripe } from '../lib/stripe.js';
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

      // Race-window guard: a driver can pick a charger from the cached `nearby`
      // result and submit a request after the host has taken it offline.
      // Re-check at write time so we don't create a booking against a hidden
      // charger.
      if (!charger.published || charger.status === 'offline') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This charger just went offline. Try a different one nearby.',
        });
      }

      const host = await prisma.hostProfile.findUniqueOrThrow({ where: { userId: charger.hostId } });
      const isDev = devBypassStripe();

      // Reject leftover dev placeholders (`acct_dev_*`) explicitly — even if
      // `stripeOnboardingComplete=true` was stamped during an earlier dev
      // session, the account doesn't exist in real Stripe and the Connect
      // transfer_data would 400 with "no such destination".
      const hostHasDevAccount = host.stripeAccountId?.startsWith('acct_dev_') ?? false;
      if (
        !isDev &&
        (!host.stripeAccountId || !host.stripeOnboardingComplete || hostHasDevAccount)
      ) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Host payouts not ready. The host needs to finish Stripe onboarding.',
        });
      }
      const driver = await prisma.user.findUniqueOrThrow({
        where: { id: ctx.userId },
        include: { identityVerification: true },
      });

      // Identity-verification gate. Drivers can browse the app freely but must
      // be verified before booking their first charging session. Dev bypass
      // mode auto-verifies users so demos work without real Stripe keys.
      if (driver.identityVerification?.status !== 'verified') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Verify your ID before booking your first charging session.',
        });
      }

      // Dev bypass: stamp placeholder customer + PM so the precondition
      // passes without a real Stripe SetupIntent. Production keeps the
      // hard requirement.
      if (isDev && (!driver.stripeCustomerId || !driver.defaultPaymentMethodId)) {
        await prisma.user.update({
          where: { id: ctx.userId },
          data: {
            stripeCustomerId: driver.stripeCustomerId ?? `cus_dev_${ctx.userId.slice(0, 8)}`,
            defaultPaymentMethodId: driver.defaultPaymentMethodId ?? 'pm_dev_card',
          },
        });
      } else if (!isDev) {
        // Real Stripe is live. Reject leftover dev placeholders too — they
        // would make the PaymentIntent.create() fail with "no such customer"
        // / "no such payment_method". Force the user back to "Save a card
        // first" so they go through the real Stripe flow.
        const isDevCustomer = driver.stripeCustomerId?.startsWith('cus_dev_') ?? false;
        const isDevPm = driver.defaultPaymentMethodId === 'pm_dev_card';
        if (
          !driver.stripeCustomerId ||
          !driver.defaultPaymentMethodId ||
          isDevCustomer ||
          isDevPm
        ) {
          // Clean the placeholders so the next SetupIntent flow starts fresh.
          if (isDevCustomer || isDevPm) {
            await prisma.user.update({
              where: { id: ctx.userId },
              data: {
                stripeCustomerId: isDevCustomer ? null : driver.stripeCustomerId,
                defaultPaymentMethodId: isDevPm ? null : driver.defaultPaymentMethodId,
              },
            });
          }
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Save a card first.',
          });
        }
      }

      const start = new Date(input.startAt);
      const end = new Date(input.endAt);
      const est = estimateBooking(charger, start, end);

      // AUDIT C3: deterministic idempotency key so client retries /
      // double-submits don't create N pre-auths + N booking rows.
      const idempotencyKey = createHash('sha256')
        .update(`booking:${ctx.userId}:${charger.id}:${start.toISOString()}:${end.toISOString()}`)
        .digest('hex');

      let stripePaymentIntentId: string;
      if (isDev) {
        // Synthetic PI id; nothing to authorise / capture. Deterministic
        // (derived from the same idempotency key as the real PI) so retries
        // never produce a fresh fake-PI-per-call.
        stripePaymentIntentId = `pi_dev_${idempotencyKey.slice(0, 16)}`;
      } else {
        const pi = await stripe().paymentIntents.create(
          {
            amount: est.totalCents,
            currency: 'usd',
            customer: driver.stripeCustomerId!,
            payment_method: driver.defaultPaymentMethodId!,
            capture_method: 'manual',
            confirm: true,
            off_session: true,
            application_fee_amount: est.platformFeeCents,
            transfer_data: { destination: host.stripeAccountId! },
            metadata: { ednaUserId: ctx.userId, chargerId: charger.id },
          },
          { idempotencyKey },
        );
        stripePaymentIntentId = pi.id;
      }

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
          stripePaymentIntentId,
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

  // Driver edits the booking window before the host has responded. Re-estimates
  // pricing and re-authorises the card: a manual-capture PI in `requires_capture`
  // can't have its amount changed, so we cancel the old hold and place a new one.
  modify: protectedProcedure
    .input(ModifyBookingInputZ)
    .mutation(async ({ ctx, input }) => {
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
      const est = estimateBooking(b.charger, start, end);
      const isDev = devBypassStripe();

      // New deterministic idempotency key keyed on the NEW window so retries of
      // this modify don't place multiple holds.
      const idempotencyKey = createHash('sha256')
        .update(`booking:${ctx.userId}:${b.charger.id}:${start.toISOString()}:${end.toISOString()}`)
        .digest('hex');

      let stripePaymentIntentId = b.stripePaymentIntentId;
      const wasDevPi = b.stripePaymentIntentId?.startsWith('pi_dev_') ?? false;

      if (isDev || wasDevPi) {
        // Synthetic hold — nothing to cancel/capture in Stripe.
        stripePaymentIntentId = `pi_dev_${idempotencyKey.slice(0, 16)}`;
      } else {
        const driver = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
        const host = await prisma.hostProfile.findUniqueOrThrow({
          where: { userId: b.charger.hostId },
        });
        // Place the new hold first; only cancel the old one once the new auth
        // succeeds, so a failure never leaves the driver with zero holds.
        const pi = await stripe().paymentIntents.create(
          {
            amount: est.totalCents,
            currency: 'usd',
            customer: driver.stripeCustomerId!,
            payment_method: driver.defaultPaymentMethodId!,
            capture_method: 'manual',
            confirm: true,
            off_session: true,
            application_fee_amount: est.platformFeeCents,
            transfer_data: { destination: host.stripeAccountId! },
            metadata: { ednaUserId: ctx.userId, chargerId: b.charger.id },
          },
          { idempotencyKey },
        );
        stripePaymentIntentId = pi.id;
        if (b.stripePaymentIntentId && b.stripePaymentIntentId !== pi.id) {
          await stripe()
            .paymentIntents.cancel(b.stripePaymentIntentId, undefined, {
              idempotencyKey: `cancel:modify:${b.id}`,
            })
            .catch((err) => {
              // Old hold release is best-effort — the new hold is already live.
              logger.warn({ err, bookingId: b.id }, 'stripe cancel failed on booking modify');
              Sentry.captureException(err);
            });
        }
      }

      const updated = await prisma.booking.update({
        where: { id: b.id },
        data: {
          startAt: start,
          endAt: end,
          estimatedKwh: est.estimatedKwh,
          estimatedCostCents: est.energyCostCents,
          platformFeeCents: est.platformFeeCents,
          preauthAmountCents: est.totalCents,
          stripePaymentIntentId,
        },
      });

      if (b.chatThread) {
        await prisma.chatMessage.create({
          data: {
            threadId: b.chatThread.id,
            senderId: null,
            kind: 'system',
            body: `Booking updated to ${start.toLocaleString()}.`,
          },
        });
      }

      return updated;
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
      await bookingsQueue.remove(`auto_decline_${b.id}`).catch((err) => {
        // Benign: job may have already fired or be gone.
        void err;
      });
      if (input.decision === 'accept') {
        // OCPP StartTransaction matches "the earliest confirmed booking for this
        // charger" (no RFID idTag in v1). Reject accepting a booking whose
        // window overlaps an already confirmed/active one on the same charger,
        // so two sessions can never contend for the same physical plug.
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
        if (b.stripePaymentIntentId && !b.stripePaymentIntentId.startsWith('pi_dev_')) {
          // AUDIT C3: idempotency key scoped per-booking so a retry doesn't
          // surface a noisy "already canceled" error. Skip for dev-bypass PIs.
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
      if (b.stripePaymentIntentId && !b.stripePaymentIntentId.startsWith('pi_dev_')) {
        // AUDIT (was silent-swallow): log failures so we can alert on PI
        // cancel errors instead of dropping them. Skip for dev-bypass PIs.
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
        include: { charger: { include: { shellDevice: true } } },
      });
      if (b.driverId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (b.status !== 'confirmed') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Booking not confirmed.' });
      }

      const tier = b.charger.hardwareTier;

      // Tier 3 — OCPP native: dispatch RemoteStartTransaction
      if (tier === 'tier_3_native') {
        if (!b.charger.ocppChargePointId) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'This Tier 3 charger has no OCPP credentials provisioned.',
          });
        }
        await ocppCommandsQueue.add('RemoteStartTransaction', {
          kind: 'RemoteStartTransaction',
          chargePointId: b.charger.ocppChargePointId,
          idTag: `EDNA-${b.driverId.slice(0, 8)}`,
        });
        return { status: 'dispatched' as const };
      }

      // Tier 1 — smart plug: relay ON via MQTT worker job
      if (tier === 'tier_1_smart_plug') {
        if (!b.charger.shellDevice) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'No smart plug linked to this charger. Ask the host to set up their device.',
          });
        }
        await bookingsQueue.add('shelly_start', { bookingId: b.id });
        return { status: 'dispatched' as const };
      }

      // Tier 2 — CT clamp monitoring: start threshold detector
      if (tier === 'tier_2_bridge_kit') {
        if (!b.charger.shellDevice) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'No bridge kit linked to this charger. Ask the host to set up their device.',
          });
        }
        // Mark confirmed → active so the session screen renders. Session row
        // is created later by the threshold detector when actual power flows.
        await prisma.booking.update({ where: { id: b.id }, data: { status: 'active' } });
        await bookingsQueue.add(
          'device_monitor',
          { bookingId: b.id },
          { jobId: `monitor_${b.id}`, removeOnComplete: true, removeOnFail: { age: 86400 } },
        );
        return { status: 'monitoring' as const };
      }

      // Tier 4 (unmetered) — virtual start: mark active immediately
      await prisma.booking.update({ where: { id: b.id }, data: { status: 'active' } });
      return { status: 'started_virtual' as const };
    }),

  stopSession: protectedProcedure
    .input(StopSessionInputZ)
    .mutation(async ({ ctx, input }) => {
      const s = await prisma.chargingSession.findUniqueOrThrow({
        where: { id: input.sessionId },
        include: { booking: true, charger: { include: { shellDevice: true } } },
      });
      if (s.booking.driverId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });

      const tier = s.charger.hardwareTier;

      // Tier 3 — OCPP native
      if (tier === 'tier_3_native' && s.ocppTransactionId && s.charger.ocppChargePointId) {
        await ocppCommandsQueue.add('RemoteStopTransaction', {
          kind: 'RemoteStopTransaction',
          chargePointId: s.charger.ocppChargePointId,
          transactionId: s.ocppTransactionId,
        });
        return { status: 'dispatched' as const };
      }

      // Tier 1 — smart plug: relay OFF via MQTT worker job
      if (tier === 'tier_1_smart_plug' && s.charger.shellDevice) {
        await bookingsQueue.add('shelly_stop', {
          bookingId: s.bookingId,
          sessionId: s.id,
        });
        return { status: 'dispatched' as const };
      }

      // Tier 2 — CT clamp: the monitor job handles auto-stop; manual stop stamps endedAt
      if (tier === 'tier_2_bridge_kit') {
        if (!s.endedAt) {
          const device = s.charger.shellDevice;
          const meterStopWh = device ? Math.round(device.lastMeterKwh * 1000) : null;
          const finalKwh = meterStopWh != null ? (meterStopWh - s.meterStartWh) / 1000 : null;
          await prisma.chargingSession.update({
            where: { id: s.id },
            data: { endedAt: new Date(), meterStopWh, finalKwh },
          });
          await bookingsQueue.add('settle_session', { sessionId: s.id });
        }
        return { status: 'stopped_virtual' as const };
      }

      // Tier 4 / virtual
      await prisma.chargingSession.update({
        where: { id: s.id },
        data: { endedAt: new Date() },
      });
      return { status: 'stopped_virtual' as const };
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
        // Include only the caller's own review (0 or 1 row) so list screens can
        // render a "rated" affordance without an N+1 of `review.mine` calls.
        include: { charger: true, reviews: { where: { authorId: ctx.userId } } },
      });
      return { rows, nextCursor: rows.at(-1)?.id ?? null };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const b = await requireBookingParty(input.id, ctx.userId);
      return prisma.booking.findUniqueOrThrow({
        where: { id: b.id },
        include: {
          charger: true,
          session: true,
          chatThread: true,
          driver: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      });
    }),

  // Session screen knows the session id from the route param but needs the
  // booking + charger to render real price + title. Cheap join keyed on the
  // unique session.bookingId.
  bySessionId: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const session = await prisma.chargingSession.findUniqueOrThrow({
        where: { id: input.sessionId },
        include: {
          booking: { include: { charger: true } },
        },
      });
      if (
        session.booking.driverId !== ctx.userId &&
        session.booking.charger.hostId !== ctx.userId
      ) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return session;
    }),
});

// Schedule the 30-min auto-decline job; pulled up here to keep requestBooking readable.
async function bookingsQueueSchedule(bookingId: string, delay: number) {
  await bookingsQueue.add(
    'auto_decline',
    { bookingId },
    { delay, jobId: `auto_decline_${bookingId}`, removeOnComplete: true, removeOnFail: true },
  );
}

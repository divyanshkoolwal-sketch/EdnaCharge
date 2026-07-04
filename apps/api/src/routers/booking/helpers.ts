/** Shared helpers and constants for booking router procedures. */
import { TRPCError } from '@trpc/server';
import { PRICING_TZ } from '@edna/schemas';
import { prisma } from '@edna/db';
import { stripe } from '../../lib/stripe.js';
import { bookingsQueue } from '../../lib/queues.js';
import { logger } from '../../logger.js';
import { Sentry } from '@edna/server-utils';
import { autoDeclineJobId } from '../../lib/auto-decline.js';

export const AUTO_DECLINE_MS = Number(process.env.AUTO_DECLINE_MS ?? 30 * 60 * 1000);
export const START_WINDOW_BUFFER_MS = 5 * 60 * 1000;
export const BILLING_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 86400, count: 100 },
} as const;

/** Format an instant in the pricing timezone (Pacific) for user-facing strings. */
export function formatPacific(at: Date): string {
  return at.toLocaleString('en-US', {
    timeZone: PRICING_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export async function requireBookingParty(bookingId: string, userId: string) {
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { charger: { select: { hostId: true } } },
  });
  if (b.driverId !== userId && b.charger.hostId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return b;
}

export async function cancelStripePaymentIntent(
  paymentIntentId: string | null,
  idempotencyKey: string,
) {
  if (!paymentIntentId || paymentIntentId.startsWith('pi_dev_')) return;
  try {
    await stripe().paymentIntents.cancel(paymentIntentId, undefined, { idempotencyKey });
  } catch (err) {
    logger.warn({ err, paymentIntentId }, 'stripe cancel failed');
    Sentry.captureException(err);
  }
}

export async function bookingsQueueSchedule(bookingId: string, delay: number) {
  await bookingsQueue.add(
    'auto_decline',
    { bookingId },
    { delay, jobId: autoDeclineJobId(bookingId), ...BILLING_JOB_OPTS },
  );
}

/**
 * True when a booking insert was rejected by the `booking_no_overlap` Postgres
 * EXCLUDE constraint (SQLSTATE 23P01) — another driver's pending/confirmed/active
 * booking already covers an overlapping slot. The constraint isn't modeled in
 * Prisma, so match on the constraint name / PG code.
 */
export function isOverlapConstraintError(err: unknown): boolean {
  const meta = (err as { meta?: unknown })?.meta;
  const haystack = `${err instanceof Error ? err.message : String(err)} ${
    meta ? JSON.stringify(meta) : ''
  }`;
  return (
    haystack.includes('booking_no_overlap') ||
    haystack.includes('23P01') ||
    haystack.includes('exclusion constraint')
  );
}

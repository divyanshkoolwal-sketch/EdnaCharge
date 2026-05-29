/**
 * device_monitor job — Tier 2 (CT clamp, monitoring-only) threshold detection.
 *
 * Runs every POLL_INTERVAL_MS during a confirmed/active booking window.
 *  - Power > THRESHOLD_START_W for STABLE_READS consecutive readings → start session
 *  - Power < THRESHOLD_STOP_W  for STABLE_READS consecutive readings → end session
 *
 * Sliding-window state lives in Redis so worker restarts don't lose progress.
 */

import type { Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@edna/db';
import { getDriver } from '../lib/device-registry.js';
import { bookingsQueue, DEFAULT_REPEAT_OPTS } from '../lib/queues.js';
import { logger } from '../logger.js';
import { Sentry } from '../sentry.js';

const POLL_INTERVAL_MS = 5_000;
const STABLE_READS = 6;        // 6 × 5s = 30s stable
const THRESHOLD_START_W = 500; // > 500W → charging started
const THRESHOLD_STOP_W = 100;  // < 100W → charging stopped
const WINDOW_BUFFER_MS = 5 * 60 * 1000; // ±5 min around booking window

export interface DeviceMonitorPayload {
  bookingId: string;
}

let _redis: IORedis | null = null;
function redis(): IORedis {
  if (_redis) return _redis;
  _redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  return _redis;
}

async function pushReading(key: string, value: number): Promise<number[]> {
  const r = redis();
  const json = await r.get(key);
  const arr: number[] = json ? JSON.parse(json) : [];
  arr.push(value);
  while (arr.length > STABLE_READS) arr.shift();
  await r.setex(key, 600, JSON.stringify(arr));
  return arr;
}

async function rescheduleNext(bookingId: string, delayMs: number): Promise<void> {
  await bookingsQueue().add(
    'device_monitor',
    { bookingId },
    { delay: delayMs, jobId: `monitor_${bookingId}`, ...DEFAULT_REPEAT_OPTS },
  );
}

export async function handleDeviceMonitor(job: Job<DeviceMonitorPayload>): Promise<void> {
  const { bookingId } = job.data;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { charger: true, session: true },
  });

  if (!booking) {
    logger.info({ bookingId }, 'device_monitor: booking gone; stop monitoring');
    return;
  }
  if (!['confirmed', 'active'].includes(booking.status)) {
    logger.info({ bookingId, status: booking.status }, 'device_monitor: not confirmed/active; stop');
    await redis().del(`dm:${bookingId}:readings`).catch(() => {});
    return;
  }

  const now = Date.now();
  const windowStart = booking.startAt.getTime() - WINDOW_BUFFER_MS;
  const windowEnd = booking.endAt.getTime() + WINDOW_BUFFER_MS;

  if (now < windowStart) {
    // Reschedule at window-open (or 60s, whichever sooner — defensive)
    const wait = Math.min(windowStart - now, 60_000);
    await rescheduleNext(bookingId, wait);
    return;
  }

  if (now > windowEnd) {
    if (booking.session && !booking.session.endedAt) {
      // Auto-end any in-progress session
      await endMonitoredSession(booking.session.id, booking.chargerId);
    } else if (!booking.session) {
      // BUG #15: window expired and the driver never crossed the start threshold
      // (i.e., never actually plugged in / drew power). Mark the booking as
      // completed with $0 captured so it doesn't sit in 'active' forever, and
      // cancel the Stripe pre-auth.
      await closeOutNoChargeBooking(bookingId, booking.stripePaymentIntentId);
    }
    await redis().del(`dm:${bookingId}:readings`).catch(() => {});
    logger.info({ bookingId }, 'device_monitor: booking window expired; stop monitoring');
    return;
  }

  const driver = await getDriver(booking.chargerId);
  if (!driver) {
    logger.error({ bookingId, chargerId: booking.chargerId }, 'device_monitor: no driver');
    Sentry.captureMessage(`device_monitor: no driver for booking ${bookingId}`);
    // Mark booking errored so the user gets a real failure signal
    if (booking.status === 'confirmed') {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'errored', declineReason: 'no_device' },
      });
    }
    return;
  }

  let meter;
  try {
    meter = await driver.getMeter();
  } catch (err) {
    logger.warn({ err, bookingId }, 'device_monitor: getMeter failed; reschedule');
    await rescheduleNext(bookingId, POLL_INTERVAL_MS);
    return;
  }

  const powerW = meter.powerW;
  const readingsKey = `dm:${bookingId}:readings`;
  const readings = await pushReading(readingsKey, powerW);

  const sessionExists = !!booking.session;
  const allAboveStart =
    readings.length >= STABLE_READS && readings.every((r) => r > THRESHOLD_START_W);
  const allBelowStop =
    readings.length >= STABLE_READS && readings.every((r) => r < THRESHOLD_STOP_W);

  if (!sessionExists && allAboveStart) {
    // Start session: read FRESH meter for accurate meterStartWh
    const meterStartWh = Math.round(meter.kwhTotal * 1000);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.chargingSession.create({
          data: {
            bookingId,
            chargerId: booking.chargerId,
            startedAt: new Date(),
            meterStartWh,
          },
        });
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'active' },
        });
      });
      await redis().del(readingsKey);
      logger.info(
        { bookingId, meterStartWh, powerW },
        'device_monitor: session started (threshold)',
      );
    } catch (err) {
      // Unique constraint violation = session already exists (race with manual start). Ignore.
      logger.warn({ err, bookingId }, 'device_monitor: start race; continuing');
    }
  } else if (sessionExists && !booking.session!.endedAt && allBelowStop) {
    await endMonitoredSession(booking.session!.id, booking.chargerId);
    await redis().del(readingsKey).catch(() => {});
    return; // don't reschedule — done
  }

  // Update device heartbeat
  const device = await prisma.shellDevice.findUnique({ where: { chargerId: booking.chargerId } });
  if (device) {
    await prisma.shellDevice.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        lastMeterKwh: meter.kwhTotal,
        status: 'active',
      },
    });
  }

  await rescheduleNext(bookingId, POLL_INTERVAL_MS);
}

/**
 * Booking window expired without any charging detected. Driver showed up but
 * never plugged in (or hardware never reported above-threshold). Mark booking
 * completed at $0 and cancel the Stripe pre-auth so the driver isn't held.
 */
async function closeOutNoChargeBooking(
  bookingId: string,
  stripePaymentIntentId: string | null,
): Promise<void> {
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'completed', capturedAmountCents: 0 },
  });

  // Cancel pre-auth (skip dev-bypass synthetic PIs)
  if (stripePaymentIntentId && !stripePaymentIntentId.startsWith('pi_dev_')) {
    try {
      const Stripe = (await import('stripe')).default;
      const key = process.env.STRIPE_SECRET_KEY;
      if (key) {
        const stripe = new Stripe(key, { apiVersion: '2024-06-20' });
        await stripe.paymentIntents.cancel(
          stripePaymentIntentId,
          undefined,
          { idempotencyKey: `cancel:${bookingId}:no_charge` },
        );
      }
    } catch (err) {
      logger.warn({ err, bookingId }, 'no_charge_close: stripe cancel failed');
      Sentry.captureException(err);
    }
  }

  logger.info({ bookingId }, 'device_monitor: closed out no-charge booking');
}

async function endMonitoredSession(sessionId: string, chargerId: string): Promise<void> {
  const session = await prisma.chargingSession.findUnique({ where: { id: sessionId } });
  if (!session || session.endedAt) return;

  // Read the latest device meter directly via the driver (most up-to-date),
  // falling back to the last DB-cached value if the driver is unreachable.
  const driver = await getDriver(chargerId);
  let kwhTotal: number | null = null;
  if (driver) {
    try {
      const m = await driver.getMeter();
      kwhTotal = m.kwhTotal;
    } catch {
      // fall through to DB cache
    }
  }
  if (kwhTotal == null) {
    const device = await prisma.shellDevice.findUnique({ where: { chargerId } });
    kwhTotal = device?.lastMeterKwh ?? null;
  }

  const meterStopWh = kwhTotal != null ? Math.round(kwhTotal * 1000) : null;
  const finalKwh = meterStopWh != null
    ? Math.max(0, (meterStopWh - session.meterStartWh) / 1000)
    : null;

  await prisma.chargingSession.update({
    where: { id: sessionId },
    data: { endedAt: new Date(), meterStopWh, finalKwh },
  });

  await bookingsQueue().add('settle_session', { sessionId }, DEFAULT_REPEAT_OPTS);

  logger.info(
    { sessionId, finalKwh, meterStopWh },
    'device_monitor: session ended (threshold), settle enqueued',
  );
}

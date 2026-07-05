/**
 * shelly_start / shelly_stop / shelly_meter_poll jobs — Tier 1 lifecycle.
 *
 *  shelly_start: read fresh meter via RPC → relay ON → create ChargingSession → schedule first meter poll
 *  shelly_stop:  relay OFF → fresh meter read → stamp endedAt + finalKwh → enqueue settle_session
 *  shelly_meter_poll: every 30s during active session → record MeterValue row + update device.lastMeterKwh
 */

import type { Job } from 'bullmq';
import { prisma } from '@edna/db';
import { getDriver } from '../lib/device-registry.js';
import { bookingsQueue, DEFAULT_REPEAT_OPTS } from '../lib/queues.js';
import { logger } from '../logger.js';
import { Sentry } from '../sentry.js';

const POLL_INTERVAL_MS = 30_000;

export interface ShellyStartPayload {
  bookingId: string;
}

export interface ShellyStopPayload {
  bookingId: string;
  sessionId: string;
}

export interface ShellyMeterPollPayload {
  sessionId: string;
  bookingId: string;
}

export async function handleShellyStart(job: Job<ShellyStartPayload>): Promise<void> {
  const { bookingId } = job.data;

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { charger: true, session: true },
  });

  if (booking.status !== 'confirmed') {
    logger.warn({ bookingId, status: booking.status }, 'shelly_start: booking not confirmed; skip');
    return;
  }

  if (booking.session) {
    logger.warn({ bookingId, sessionId: booking.session.id }, 'shelly_start: session already exists; skip');
    return;
  }

  const driver = await getDriver(booking.chargerId);
  if (!driver) {
    logger.error({ bookingId, chargerId: booking.chargerId }, 'shelly_start: no device found');
    Sentry.captureMessage(`shelly_start: no device for charger ${booking.chargerId}`);
    // Mark booking as errored so the driver UI can surface a real failure
    // instead of hanging in 'confirmed' forever.
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'errored', declineReason: 'no_device' },
    });
    return;
  }

  // CRITICAL: read meter BEFORE turning relay on. Driver.getMeter() does a
  // synchronous RPC if no push-status has arrived yet, so meterStartWh
  // reflects the device's actual cumulative kWh at session start — not 0.
  let meterStartWh: number;
  try {
    const startMeter = await driver.getMeter();
    meterStartWh = Math.round(startMeter.kwhTotal * 1000);
  } catch (err) {
    logger.error({ err, bookingId }, 'shelly_start: failed to read meter; aborting');
    Sentry.captureException(err);
    throw err; // BullMQ will retry
  }

  // Now turn the plug on
  try {
    await driver.start();
  } catch (err) {
    logger.error({ err, bookingId }, 'shelly_start: relay command failed');
    Sentry.captureException(err);
    throw err; // BullMQ retries; no session created so safe to retry
  }

  // Create session + flip booking to active in a transaction so the two states
  // can't get out of sync if the worker crashes between writes.
  const session = await prisma.$transaction(async (tx) => {
    const s = await tx.chargingSession.create({
      data: {
        bookingId,
        chargerId: booking.chargerId,
        startedAt: new Date(),
        meterStartWh,
      },
    });
    await tx.booking.update({ where: { id: bookingId }, data: { status: 'active' } });
    return s;
  });

  logger.info({ bookingId, sessionId: session.id, meterStartWh }, 'shelly_start: session created');

  // Schedule first meter poll
  await bookingsQueue().add(
    'shelly_meter_poll',
    { sessionId: session.id, bookingId },
    { delay: POLL_INTERVAL_MS, jobId: `meter_poll_${session.id}`, ...DEFAULT_REPEAT_OPTS },
  );
}

export async function handleShellyStop(job: Job<ShellyStopPayload>): Promise<void> {
  const { bookingId, sessionId } = job.data;

  const session = await prisma.chargingSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { booking: { include: { charger: true } } },
  });

  if (session.endedAt) {
    logger.info({ sessionId }, 'shelly_stop: session already ended; skip');
    return;
  }

  const driver = await getDriver(session.booking.chargerId);

  // Read meter BEFORE turning off — captures the final cumulative reading
  // before the device deenergizes (which would otherwise lock the value at
  // its last push-status timestamp).
  let meterStopWh: number | null = null;
  if (driver) {
    try {
      const m = await driver.getMeter();
      meterStopWh = Math.round(m.kwhTotal * 1000);
    } catch (err) {
      logger.warn({ err, sessionId }, 'shelly_stop: meter read failed; will use last cached');
    }
    try {
      await driver.stop();
    } catch (err) {
      // Don't fail the whole stop on relay error — session must end and bill.
      logger.error({ err, sessionId }, 'shelly_stop: relay-off command failed (continuing)');
      Sentry.captureException(err);
    }
  }

  const finalKwh = meterStopWh != null
    ? Math.max(0, (meterStopWh - session.meterStartWh) / 1000)
    : null;

  await prisma.chargingSession.update({
    where: { id: session.id },
    data: { endedAt: new Date(), meterStopWh, finalKwh },
  });

  // Cancel any pending meter poll
  const bq = bookingsQueue();
  await bq.remove(`meter_poll_${sessionId}`).catch(() => {});

  // Hand off to settle_session (Stripe capture)
  await bq.add('settle_session', { sessionId }, DEFAULT_REPEAT_OPTS);

  logger.info({ sessionId, finalKwh, meterStopWh }, 'shelly_stop: session ended, settle enqueued');
}

// Auto-stop Tier 1 sessions this many ms after booking.endAt to prevent the
// relay from staying on indefinitely if the driver never clicks "Stop".
const TIER1_AUTO_STOP_BUFFER_MS = 5 * 60 * 1000;

export async function handleShellyMeterPoll(job: Job<ShellyMeterPollPayload>): Promise<void> {
  const { sessionId, bookingId } = job.data;

  const session = await prisma.chargingSession.findUnique({ where: { id: sessionId } });
  if (!session || session.endedAt) return;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { charger: true },
  });
  if (!booking || booking.status !== 'active') return;

  // BUG #16: Tier 1 auto-stop. If we're past booking.endAt + buffer, stop the
  // session ourselves so the relay doesn't stay on indefinitely.
  if (Date.now() > booking.endAt.getTime() + TIER1_AUTO_STOP_BUFFER_MS) {
    logger.info({ sessionId, bookingId }, 'meter poll: past booking endAt; auto-stopping');
    await bookingsQueue().add(
      'shelly_stop',
      { bookingId, sessionId },
      DEFAULT_REPEAT_OPTS,
    );
    return; // don't reschedule another poll
  }

  const driver = await getDriver(booking.chargerId);
  if (!driver) return;

  let meter;
  try {
    meter = await driver.getMeter();
  } catch (err) {
    logger.warn({ err, sessionId }, 'meter poll: getMeter failed; skipping this poll');
    // Still reschedule next poll
    await bookingsQueue().add(
      'shelly_meter_poll',
      { sessionId, bookingId },
      { delay: POLL_INTERVAL_MS, jobId: `meter_poll_${sessionId}`, ...DEFAULT_REPEAT_OPTS },
    );
    return;
  }

  const energyWh = Math.round(meter.kwhTotal * 1000);

  await prisma.meterValue.create({
    data: {
      sessionId,
      energyWh,
      powerW: Math.round(meter.powerW),
      ts: meter.timestamp,
    },
  });

  // Update ShellDevice.lastMeterKwh
  const device = await prisma.shellDevice.findUnique({ where: { chargerId: booking.chargerId } });
  if (device) {
    await prisma.shellDevice.update({
      where: { id: device.id },
      data: {
        lastMeterKwh: meter.kwhTotal,
        lastSeenAt: new Date(),
        status: 'active',
      },
    });
  }

  logger.debug(
    { sessionId, currentKwh: (energyWh - session.meterStartWh) / 1000, powerW: meter.powerW },
    'meter poll',
  );

  // Schedule next poll
  await bookingsQueue().add(
    'shelly_meter_poll',
    { sessionId, bookingId },
    { delay: POLL_INTERVAL_MS, jobId: `meter_poll_${sessionId}`, ...DEFAULT_REPEAT_OPTS },
  );
}

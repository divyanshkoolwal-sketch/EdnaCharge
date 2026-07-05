/** @file apps/worker/src/jobs/orphan-sweep.ts. */
import { prisma } from '@edna/db';
import { logger } from '../logger.js';
import { bookingsQueue, notificationsQueue } from '../lib/queues.js';

const SETTLE_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 86400, count: 100 },
} as const;

// How long past the booking's end a still-open session is considered abandoned.
const GRACE_MS = Number(process.env.ORPHAN_SWEEP_GRACE_MS ?? 15 * 60_000);
// Cap the lookback so the sweep query stays cheap: a session open for days is a
// data problem, not a live orphan we should keep re-capturing against.
const MAX_LOOKBACK_MS = Number(process.env.ORPHAN_SWEEP_LOOKBACK_MS ?? 24 * 60 * 60_000);
const BATCH = 50;

/**
 * Finalize charging sessions whose charger dropped its websocket before sending
 * StopTransaction. Without this a session stays open forever: the pre-auth is
 * never captured or released and the host is never paid. Runs on a repeatable
 * schedule from the worker. Idempotent — the endedAt stamp is conditional and
 * settleSessionById guards on capturedAmountCents.
 */
export async function sweepOrphanedSessions(): Promise<void> {
  const now = Date.now();
  const cutoff = new Date(now - GRACE_MS);
  const floor = new Date(now - MAX_LOOKBACK_MS);
  const orphans = await prisma.chargingSession.findMany({
    where: {
      endedAt: null,
      booking: { endAt: { lt: cutoff, gte: floor }, status: { in: ['active', 'confirmed'] } },
    },
    include: {
      meterValues: { orderBy: { ts: 'desc' }, take: 1 },
      booking: true,
      charger: true,
    },
    take: BATCH,
  });
  if (orphans.length === 0) return;
  logger.warn({ count: orphans.length }, 'orphan-sweep: finalizing abandoned sessions');

  for (const s of orphans) {
    try {
      // Bill whatever energy the last meter reading recorded; 0 if none was ever
      // reported, in which case settleSessionById cancels the pre-auth instead.
      const lastWh = s.meterValues[0]?.energyWh ?? null;
      const kwh = lastWh != null ? Math.max(0, (lastWh - s.meterStartWh) / 1000) : 0;
      const ended = await prisma.chargingSession.updateMany({
        where: { id: s.id, endedAt: null },
        data: {
          endedAt: new Date(),
          meterStopWh: lastWh,
          finalKwh: kwh,
          errorCode: 'orphaned_no_stop',
        },
      });
      if (ended.count !== 1) continue; // another path finalized it first
      await notificationsQueue()
        .add('session_stopped', {
          driverId: s.booking.driverId,
          hostId: s.charger.hostId,
          sessionId: s.id,
        })
        .catch((err) => logger.warn({ err, sessionId: s.id }, 'orphan-sweep: notify failed'));
      // Hand off to the RETRYABLE settle_session job rather than settling inline:
      // a settle failure here would otherwise be swallowed and never retried
      // (future sweeps skip endedAt != null), leaking the driver's pre-auth.
      try {
        await bookingsQueue().add(
          'settle_session',
          { sessionId: s.id },
          { ...SETTLE_JOB_OPTS, jobId: `settle:${s.id}` },
        );
      } catch (enqueueErr) {
        // Couldn't enqueue — revert endedAt so the next sweep retries instead of
        // stranding an ended-but-unsettled session.
        logger.error(
          { err: enqueueErr, sessionId: s.id },
          'orphan-sweep: enqueue settle failed; reverting endedAt',
        );
        await prisma.chargingSession
          .updateMany({ where: { id: s.id }, data: { endedAt: null } })
          .catch(() => {});
      }
    } catch (err) {
      logger.error({ err, sessionId: s.id }, 'orphan-sweep: failed to finalize session');
    }
  }

  // Re-sweep: sessions that ENDED but never settled (e.g. settle_session exhausted
  // all 5 retries — DB blip / Stripe outage). Those have endedAt set so the query
  // above skips them; without this the driver's pre-auth is stranded forever. Give
  // a longer grace, then re-enqueue settle WITHOUT the jobId (a retained failed
  // job would otherwise dedup the retry away). settleSessionById is idempotent.
  const RESWEEP_GRACE_MS = Number(process.env.ORPHAN_RESWEEP_GRACE_MS ?? 60 * 60_000);
  const stuck = await prisma.chargingSession.findMany({
    where: {
      // ended (endedAt set) but the booking never reached 'completed' → settle
      // never succeeded. (settleSessionById sets booking.status = 'completed'.)
      endedAt: { not: null, lt: new Date(now - RESWEEP_GRACE_MS), gte: floor },
      booking: { status: { in: ['active', 'confirmed'] } },
    },
    select: { id: true },
    take: BATCH,
  });
  if (stuck.length > 0) {
    logger.warn({ count: stuck.length }, 'orphan-sweep: re-settling ended-but-unsettled sessions');
    for (const s of stuck) {
      await bookingsQueue()
        .add('settle_session', { sessionId: s.id }, SETTLE_JOB_OPTS)
        .catch((err) => logger.error({ err, sessionId: s.id }, 'orphan-sweep: re-enqueue failed'));
    }
  }
}

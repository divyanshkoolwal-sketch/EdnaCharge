/** @file apps/csms/src/handlers/index.ts. */
import { randomInt } from 'node:crypto';
import { prisma } from '@edna/db';
import { logger } from '../logger.js';
import { bookingsQueue, notificationsQueue } from './queues.js';
import { mapOcppStatus } from './ocpp-values.js';
import { touchOcppConnectedAt } from './charger-liveness.js';
import { recordMeterValues } from './meter-values.js';
import type { Client, Ctx } from './types.js';

export type { Client, Ctx } from './types.js';

const SETTLEMENT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 86400, count: 100 },
} as const;

// Anti-theft authorization window: how long after the driver taps "Start
// charging" the charger has to present the minted idTag. Generous enough for a
// plug-in delay, short enough that a stale token cannot be replayed afterward.
const START_AUTH_WINDOW_MS = 15 * 60 * 1000;

async function chargerByCpId(cpId: string) {
  return prisma.charger.findUnique({ where: { ocppChargePointId: cpId } });
}

/**
 * The booking a charger is permitted to start RIGHT NOW, or null.
 *
 * A booking is startable only if the driver explicitly tapped "Start charging"
 * (which mints `ocppStartToken` + stamps `ocppAuthorizedAt`) and the charger is
 * presenting that exact token inside the window. This is what guarantees energy
 * only flows on an authorized tap — an unsolicited local/RFID start carries an
 * unknown idTag and is refused.
 */
async function authorizedBookingFor(chargerId: string, idTag?: string) {
  if (!idTag) return null;
  const now = Date.now();
  return prisma.booking.findFirst({
    where: {
      chargerId,
      ocppStartToken: idTag,
      status: { in: ['confirmed', 'active'] },
      ocppAuthorizedAt: { gte: new Date(Date.now() - START_AUTH_WINDOW_MS) },
      startAt: { lte: new Date(now + 5 * 60_000) },
      endAt: { gte: new Date(now - 5 * 60_000) },
    },
  });
}

export function bindHandlers(client: Client, ctx: Ctx): void {
  client.handle('BootNotification', async ({ params }) => {
    logger.info({ cpId: ctx.chargePointId, params }, 'BootNotification');
    // Defense-in-depth (physical layer): ask the charger to require central
    // authorization before a remote-started transaction delivers energy, and to
    // not free-vend on local plug-in. Best-effort and non-blocking — a charger
    // may answer NotSupported; the CSMS-side idTag gate below is the real
    // guarantee that we never start/bill an unauthorized session.
    void Promise.resolve(
      client.call('ChangeConfiguration', { key: 'AuthorizeRemoteTxRequests', value: 'true' }),
    ).catch((err) =>
      logger.info(
        { err, cpId: ctx.chargePointId },
        'ChangeConfiguration not applied (charger-dependent)',
      ),
    );
    return { currentTime: new Date().toISOString(), interval: 30, status: 'Accepted' };
  });

  client.handle('Heartbeat', async () => {
    await touchOcppConnectedAt(ctx.chargePointId);
    return { currentTime: new Date().toISOString() };
  });

  client.handle('StatusNotification', async ({ params }) => {
    const c = await chargerByCpId(ctx.chargePointId);
    if (!c) return {};
    const status = mapOcppStatus((params as { status?: string }).status);
    // Refresh liveness alongside any status change (chargers that only emit
    // StatusNotifications, no Heartbeat, still need to stay "connected").
    await prisma.charger.update({
      where: { id: c.id },
      data: { ocppConnectedAt: new Date(), ...(status ? { status } : {}) },
    });
    return {};
  });

  // Only authorize idTags minted by an explicit "Start charging" tap. An
  // unknown tag (local RFID swipe, plug-and-charge, replayed/old token) is
  // refused, so the charger won't energize for an unauthorized driver.
  client.handle('Authorize', async ({ params }) => {
    const c = await chargerByCpId(ctx.chargePointId);
    const idTag = (params as { idTag?: string }).idTag;
    const ok = c ? await authorizedBookingFor(c.id, idTag) : null;
    if (!ok) {
      logger.warn({ cpId: ctx.chargePointId, idTag }, 'Authorize refused: no authorized booking');
      return { idTagInfo: { status: 'Invalid' } };
    }
    return { idTagInfo: { status: 'Accepted' } };
  });

  client.handle('StartTransaction', async ({ params }) => {
    const c = await chargerByCpId(ctx.chargePointId);
    if (!c) throw new Error('Unknown chargePointId');
    const p = params as { meterStart?: number; timestamp?: string; idTag?: string };
    // Energy may ONLY begin for the booking the driver explicitly started. No
    // idTag match in-window → refuse (transactionId 0 stops a compliant charger
    // from delivering energy) and never create a billable session.
    const booking = await authorizedBookingFor(c.id, p.idTag);
    if (!booking) {
      logger.warn(
        { cpId: ctx.chargePointId, idTag: p.idTag },
        'StartTransaction refused: no authorized booking for this idTag (driver did not tap Start)',
      );
      return { idTagInfo: { status: 'Invalid' }, transactionId: 0 };
    }
    // One session per booking. A re-sent StartTransaction (network retry) is
    // idempotent; a replay after the session already ended is refused so the
    // same authorization can't be charged twice. (Booking.session is 1:1.)
    const existing = await prisma.chargingSession.findUnique({ where: { bookingId: booking.id } });
    if (existing) {
      if (existing.endedAt) return { idTagInfo: { status: 'Invalid' }, transactionId: 0 };
      return {
        transactionId: existing.ocppTransactionId ?? 0,
        idTagInfo: { status: 'Accepted' },
      };
    }
    // Cryptographically-random, non-guessable transaction id (int32 range so
    // it fits chargers that expect a 32-bit int). A guessable id would let a
    // second charger target another session's txId.
    const txId = randomInt(1, 2_147_483_647);
    const session = await prisma.chargingSession.create({
      data: {
        bookingId: booking.id,
        chargerId: c.id,
        // Use server receipt time for the billable window. Charger clocks can
        // be wrong or malicious; MeterValue rows still keep charger timestamps.
        startedAt: new Date(),
        meterStartWh: p.meterStart ?? 0,
        ocppTransactionId: txId,
      },
    });
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'active' } });
    await notificationsQueue().add('session_started', {
      driverId: booking.driverId,
      hostId: c.hostId,
      sessionId: session.id,
    });
    return { transactionId: session.ocppTransactionId ?? txId, idTagInfo: { status: 'Accepted' } };
  });

  client.handle('MeterValues', async ({ params }) => {
    const p = params as {
      transactionId?: number;
      meterValue?: Array<{
        timestamp: string;
        sampledValue: Array<{ value: string; measurand?: string; unit?: string }>;
      }>;
    };
    if (!p.transactionId || !p.meterValue) return {};
    const c = await chargerByCpId(ctx.chargePointId);
    if (!c) return {};
    const session = await prisma.chargingSession.findUnique({
      where: { ocppTransactionId: p.transactionId },
    });
    if (!session) return {};
    if (session.endedAt) {
      logger.info(
        { sessionId: session.id, transactionId: p.transactionId },
        'MeterValues ignored after session end',
      );
      return {};
    }
    // SECURITY: a charger may only report meter values for ITS OWN session.
    // Without this, any authenticated charger could inject/distort another
    // charger's session by guessing/observing its transactionId.
    if (session.chargerId !== c.id) {
      logger.warn(
        {
          cpId: ctx.chargePointId,
          transactionId: p.transactionId,
          sessionChargerId: session.chargerId,
        },
        'MeterValues refused: transactionId belongs to a different charger',
      );
      return {};
    }
    await recordMeterValues(session.id, p.meterValue);
    return {};
  });

  client.handle('StopTransaction', async ({ params }) => {
    const p = params as { transactionId?: number; meterStop?: number; timestamp?: string };
    if (!p.transactionId) return { idTagInfo: { status: 'Accepted' } };
    const c = await chargerByCpId(ctx.chargePointId);
    // AUDIT H3: StartTransaction's DB insert may not yet have committed when a
    // StopTransaction arrives under heavy load / network flip. Short-retry
    // with exponential backoff so we don't silently drop the stop and leave
    // the session open forever.
    let session = await prisma.chargingSession.findUnique({
      where: { ocppTransactionId: p.transactionId },
    });
    if (!session) {
      for (const delayMs of [100, 300, 900]) {
        await new Promise((r) => setTimeout(r, delayMs));
        session = await prisma.chargingSession.findUnique({
          where: { ocppTransactionId: p.transactionId },
        });
        if (session) break;
      }
    }
    if (!session) {
      logger.warn(
        { transactionId: p.transactionId, cpId: ctx.chargePointId },
        'StopTransaction: no matching session after retries; enqueueing deferred settle',
      );
      // Enqueue a delayed settle by transactionId so a late-committing
      // StartTransaction can be reconciled by a background job.
      await bookingsQueue().add(
        'settle_session_by_txid',
        {
          transactionId: p.transactionId,
          meterStop: p.meterStop,
          timestamp: new Date().toISOString(),
          // Pass the connecting charger so the deferred settle can verify the
          // stop came from the charger that actually owns the session.
          chargePointId: ctx.chargePointId,
        },
        { delay: 5_000, ...SETTLEMENT_JOB_OPTS },
      );
      return { idTagInfo: { status: 'Accepted' } };
    }
    // SECURITY: a charger may only stop ITS OWN session. Reject a stop for a
    // transactionId that belongs to a different charger (free-charging / metering
    // sabotage via a guessed/observed txId).
    if (c && session.chargerId !== c.id) {
      logger.warn(
        {
          cpId: ctx.chargePointId,
          transactionId: p.transactionId,
          sessionChargerId: session.chargerId,
        },
        'StopTransaction refused: transactionId belongs to a different charger',
      );
      return { idTagInfo: { status: 'Accepted' } };
    }
    if (session.endedAt) {
      logger.info(
        { sessionId: session.id, transactionId: p.transactionId },
        'StopTransaction ignored after session end',
      );
      await bookingsQueue().add(
      'settle_session',
      { sessionId: session.id },
      { ...SETTLEMENT_JOB_OPTS, jobId: `settle:${session.id}` },
    );
      return { idTagInfo: { status: 'Accepted' } };
    }
    // Guard against a meter register rollover / reset (meterStop < meterStart),
    // which would otherwise produce a negative finalKwh and a negative capture.
    const kwh = p.meterStop != null ? Math.max(0, (p.meterStop - session.meterStartWh) / 1000) : 0;
    const ended = await prisma.chargingSession.update({
      where: { id: session.id },
      data: {
        endedAt: new Date(),
        meterStopWh: p.meterStop ?? null,
        finalKwh: kwh,
      },
      include: { booking: true, charger: true },
    });
    await notificationsQueue().add('session_stopped', {
      driverId: ended.booking.driverId,
      hostId: ended.charger.hostId,
      sessionId: ended.id,
    });
    // Hand off settlement + Stripe capture to the worker.
    await bookingsQueue().add(
      'settle_session',
      { sessionId: session.id },
      { ...SETTLEMENT_JOB_OPTS, jobId: `settle:${session.id}` },
    );
    return { idTagInfo: { status: 'Accepted' } };
  });
}

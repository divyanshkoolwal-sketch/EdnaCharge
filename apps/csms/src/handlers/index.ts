import { prisma } from '@edna/db';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { supabase } from '../lib/supabase.js';
import { logger } from '../logger.js';

let _bookings: Queue | null = null;
function bookingsQueue(): Queue {
  if (_bookings) return _bookings;
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  _bookings = new Queue('bookings', { connection });
  return _bookings;
}

// ocpp-rpc v2 doesn't export a named server-client type. We type it structurally
// to avoid a runtime-only `any`.
export type Client = {
  handle: (method: string, handler: (ctx: { params: unknown }) => Promise<unknown>) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  close: (code?: number, reason?: string) => void;
  call: (method: string, params?: unknown, opts?: Record<string, unknown>) => Promise<unknown>;
  identity?: string;
  session: Record<string, unknown>;
};

type Ctx = { chargePointId: string };

// Anti-theft authorization window: how long after the driver taps "Start
// charging" the charger has to present the minted idTag. Generous enough for a
// plug-in delay, short enough that a stale token can't be replayed later.
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
  return prisma.booking.findFirst({
    where: {
      chargerId,
      ocppStartToken: idTag,
      status: { in: ['confirmed', 'active'] },
      ocppAuthorizedAt: { gte: new Date(Date.now() - START_AUTH_WINDOW_MS) },
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
      logger.info({ err, cpId: ctx.chargePointId }, 'ChangeConfiguration not applied (charger-dependent)'),
    );
    return { currentTime: new Date().toISOString(), interval: 30, status: 'Accepted' };
  });

  client.handle('Heartbeat', async () => ({ currentTime: new Date().toISOString() }));

  client.handle('StatusNotification', async ({ params }) => {
    const c = await chargerByCpId(ctx.chargePointId);
    if (!c) return {};
    const status = mapOcppStatus((params as { status?: string }).status);
    if (status) await prisma.charger.update({ where: { id: c.id }, data: { status } });
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
    const txId = Math.floor(Math.random() * 1_000_000_000);
    const session = await prisma.chargingSession.create({
      data: {
        bookingId: booking.id,
        chargerId: c.id,
        startedAt: p.timestamp ? new Date(p.timestamp) : new Date(),
        meterStartWh: p.meterStart ?? 0,
        ocppTransactionId: txId,
      },
    });
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'active' } });
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
    const session = await prisma.chargingSession.findUnique({
      where: { ocppTransactionId: p.transactionId },
    });
    if (!session) return {};
    for (const mv of p.meterValue) {
      const energy = mv.sampledValue.find(
        (s) => s.measurand === 'Energy.Active.Import.Register' || !s.measurand,
      );
      const power = mv.sampledValue.find((s) => s.measurand === 'Power.Active.Import');
      const voltage = mv.sampledValue.find((s) => s.measurand === 'Voltage');
      const current = mv.sampledValue.find((s) => s.measurand === 'Current.Import');
      const row = await prisma.meterValue.create({
        data: {
          sessionId: session.id,
          ts: new Date(mv.timestamp),
          energyWh: energy ? Math.round(Number(energy.value)) : 0,
          powerW: power ? Math.round(Number(power.value)) : 0,
          voltageV: voltage ? Number(voltage.value) : null,
          currentA: current ? Number(current.value) : null,
        },
      });
      const sb = supabase();
      if (sb) {
        await sb
          .channel(`session:${session.id}`)
          .send({ type: 'broadcast', event: 'meter_value', payload: row });
      }
    }
    return {};
  });

  client.handle('StopTransaction', async ({ params }) => {
    const p = params as { transactionId?: number; meterStop?: number; timestamp?: string };
    if (!p.transactionId) return { idTagInfo: { status: 'Accepted' } };
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
        { transactionId: p.transactionId, meterStop: p.meterStop, timestamp: p.timestamp },
        { delay: 5_000 },
      );
      return { idTagInfo: { status: 'Accepted' } };
    }
    // Guard against a meter register rollover / reset (meterStop < meterStart),
    // which would otherwise produce a negative finalKwh and a negative capture.
    const kwh = p.meterStop != null ? Math.max(0, (p.meterStop - session.meterStartWh) / 1000) : 0;
    await prisma.chargingSession.update({
      where: { id: session.id },
      data: {
        endedAt: p.timestamp ? new Date(p.timestamp) : new Date(),
        meterStopWh: p.meterStop ?? null,
        finalKwh: kwh,
      },
    });
    // Hand off settlement + Stripe capture to the worker.
    await bookingsQueue().add('settle_session', { sessionId: session.id });
    return { idTagInfo: { status: 'Accepted' } };
  });
}

function mapOcppStatus(s?: string): 'available' | 'occupied' | 'faulted' | 'offline' | null {
  switch (s) {
    case 'Available':
      return 'available';
    case 'Preparing':
    case 'Charging':
    case 'SuspendedEV':
    case 'SuspendedEVSE':
    case 'Finishing':
      return 'occupied';
    case 'Faulted':
    case 'Unavailable':
      return 'faulted';
    default:
      return null;
  }
}

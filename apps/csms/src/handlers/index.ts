import { prisma } from '@edna/db';
import { supabase } from '../lib/supabase.js';
import { logger } from '../logger.js';

// ocpp-rpc v2 doesn't export a named server-client type. We type it structurally
// to avoid a runtime-only `any`.
type Client = {
  handle: (method: string, handler: (ctx: { params: unknown }) => Promise<unknown>) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  close: (code?: number, reason?: string) => void;
  call: (method: string, params?: unknown, opts?: Record<string, unknown>) => Promise<unknown>;
  identity?: string;
  session: Record<string, unknown>;
};

type Ctx = { chargePointId: string };

async function chargerByCpId(cpId: string) {
  return prisma.charger.findUnique({ where: { ocppChargePointId: cpId } });
}

export function bindHandlers(client: Client, ctx: Ctx): void {
  client.handle('BootNotification', async ({ params }) => {
    logger.info({ cpId: ctx.chargePointId, params }, 'BootNotification');
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

  client.handle('Authorize', async () => ({ idTagInfo: { status: 'Accepted' } }));

  client.handle('StartTransaction', async ({ params }) => {
    const c = await chargerByCpId(ctx.chargePointId);
    if (!c) throw new Error('Unknown chargePointId');
    const p = params as { meterStart?: number; timestamp?: string };
    const booking = await prisma.booking.findFirst({
      where: { chargerId: c.id, status: 'confirmed' },
      orderBy: { startAt: 'asc' },
    });
    if (!booking) return { idTagInfo: { status: 'Invalid' }, transactionId: 0 };
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
    const session = await prisma.chargingSession.findUnique({
      where: { ocppTransactionId: p.transactionId },
    });
    if (!session) return { idTagInfo: { status: 'Accepted' } };
    const kwh = p.meterStop != null ? (p.meterStop - session.meterStartWh) / 1000 : 0;
    await prisma.chargingSession.update({
      where: { id: session.id },
      data: {
        endedAt: p.timestamp ? new Date(p.timestamp) : new Date(),
        meterStopWh: p.meterStop ?? null,
        finalKwh: kwh,
      },
    });
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

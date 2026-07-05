/**
 * Unit tests for OCPP 1.6 handlers in apps/csms/src/handlers/index.ts.
 *
 * These test the structural contract of each handler (input shape,
 * status enum mapping) without needing a real Postgres / Redis. The handler
 * code is mocked at the prisma boundary; we only assert that the right
 * Prisma calls fire with the right arguments and that OCPP responses match
 * the spec.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const findCharger = vi.fn(); // prisma.charger.findUnique
const findFirstBooking = vi.fn(); // prisma.booking.findFirst
const findSession = vi.fn(); // prisma.chargingSession.findUnique
const updateCharger = vi.fn();
const updateBooking = vi.fn();
const createSession = vi.fn();
const updateSession = vi.fn();
const createMeterValue = vi.fn();
const queueAdd = vi.fn();

vi.mock('@edna/db', () => ({
  prisma: {
    charger: { findUnique: findCharger, update: updateCharger },
    booking: { findFirst: findFirstBooking, update: updateBooking },
    chargingSession: {
      findUnique: findSession,
      create: createSession,
      update: updateSession,
    },
    meterValue: { create: createMeterValue },
  },
}));

vi.mock('../src/lib/supabase.js', () => ({
  supabase: () => null, // realtime broadcast disabled in tests
}));

vi.mock('ioredis', () => ({
  default: vi.fn(function (this: any) {
    this.quit = vi.fn();
    return this;
  }),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(function (this: any) {
    this.add = queueAdd;
    return this;
  }),
}));

const handler = {
  current: null as null | ((method: string, params: unknown) => Promise<unknown>),
  byMethod: {} as Record<string, (ctx: { params: unknown }) => Promise<unknown>>,
};
const fakeClient = {
  identity: 'cp-test123',
  session: {} as Record<string, unknown>,
  handle: vi.fn((method: string, h: (ctx: { params: unknown }) => Promise<unknown>) => {
    handler.byMethod[method] = h;
  }),
  on: vi.fn(),
  off: vi.fn(),
  close: vi.fn(),
  call: vi.fn().mockResolvedValue({}),
};

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient.call.mockResolvedValue({});
  handler.byMethod = {};
});

async function bindAndCall(method: string, params: unknown) {
  const { bindHandlers } = await import('../src/handlers/index.js');
  bindHandlers(fakeClient as any, { chargePointId: 'cp-test123' });
  const h = handler.byMethod[method];
  if (!h) throw new Error(`handler not bound: ${method}`);
  return h({ params });
}

describe('OCPP 1.6 handlers', () => {
  it('BootNotification returns Accepted + 30s heartbeat interval', async () => {
    const result = (await bindAndCall('BootNotification', {
      chargePointVendor: 'Wallbox',
      chargePointModel: 'Pulsar Plus',
    })) as { status: string; interval: number };
    expect(result.status).toBe('Accepted');
    expect(result.interval).toBe(30);
    expect(typeof result.currentTime).toBe('string');
  });

  it('BootNotification asks the charger to require remote-tx authorization', async () => {
    await bindAndCall('BootNotification', { chargePointVendor: 'v', chargePointModel: 'm' });
    expect(fakeClient.call).toHaveBeenCalledWith('ChangeConfiguration', {
      key: 'AuthorizeRemoteTxRequests',
      value: 'true',
    });
  });

  it('Heartbeat returns current time', async () => {
    const result = (await bindAndCall('Heartbeat', {})) as { currentTime: string };
    expect(typeof result.currentTime).toBe('string');
    expect(new Date(result.currentTime).getTime()).toBeGreaterThan(0);
  });

  it('Authorize accepts an idTag minted by an explicit Start tap', async () => {
    findCharger.mockResolvedValue({ id: 'charger-1' });
    findFirstBooking.mockResolvedValue({ id: 'booking-1' });
    const result = (await bindAndCall('Authorize', { idTag: 'abc123' })) as {
      idTagInfo: { status: string };
    };
    expect(result.idTagInfo.status).toBe('Accepted');
  });

  it('Authorize refuses an unknown idTag (no authorized booking)', async () => {
    findCharger.mockResolvedValue({ id: 'charger-1' });
    findFirstBooking.mockResolvedValue(null); // no booking matches the token/window
    const result = (await bindAndCall('Authorize', { idTag: 'stolen-or-local-rfid' })) as {
      idTagInfo: { status: string };
    };
    expect(result.idTagInfo.status).toBe('Invalid');
  });

  it('StatusNotification → maps OCPP status to ChargerStatus enum + persists', async () => {
    findCharger.mockResolvedValue({ id: 'charger-1' });
    // StatusNotification also refreshes ocppConnectedAt (liveness heartbeat), so
    // the charger stays "connected" even without an explicit Heartbeat.
    await bindAndCall('StatusNotification', { status: 'Available' });
    expect(updateCharger).toHaveBeenCalledWith({
      where: { id: 'charger-1' },
      data: { ocppConnectedAt: expect.any(Date), status: 'available' },
    });

    await bindAndCall('StatusNotification', { status: 'Charging' });
    expect(updateCharger).toHaveBeenLastCalledWith({
      where: { id: 'charger-1' },
      data: { ocppConnectedAt: expect.any(Date), status: 'occupied' },
    });

    await bindAndCall('StatusNotification', { status: 'Faulted' });
    expect(updateCharger).toHaveBeenLastCalledWith({
      where: { id: 'charger-1' },
      data: { ocppConnectedAt: expect.any(Date), status: 'faulted' },
    });
  });

  it('StatusNotification with unknown chargePointId is a no-op (no throw)', async () => {
    findCharger.mockResolvedValue(null);
    await expect(bindAndCall('StatusNotification', { status: 'Available' })).resolves.toEqual({});
    expect(updateCharger).not.toHaveBeenCalled();
  });

  it('StartTransaction creates a session + flips booking to active (authorized idTag)', async () => {
    findCharger.mockResolvedValue({ id: 'charger-1' });
    findFirstBooking.mockResolvedValue({ id: 'booking-1' });
    findSession.mockResolvedValue(null); // no prior session for this booking
    createSession.mockResolvedValue({ id: 'session-1', ocppTransactionId: 12345 });

    const result = (await bindAndCall('StartTransaction', {
      idTag: 'abc123',
      meterStart: 0,
      timestamp: '2026-01-01T00:00:00Z',
    })) as { transactionId: number; idTagInfo: { status: string } };

    expect(result.idTagInfo.status).toBe('Accepted');
    expect(typeof result.transactionId).toBe('number');
    expect(createSession).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: 'booking-1',
        chargerId: 'charger-1',
        meterStartWh: 0,
      }),
    });
    expect(updateBooking).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { status: 'active' },
    });
  });

  it('StartTransaction with no authorized booking returns Invalid + txn 0 (anti-theft)', async () => {
    findCharger.mockResolvedValue({ id: 'charger-1' });
    findFirstBooking.mockResolvedValue(null); // unknown idTag → not authorized

    const result = (await bindAndCall('StartTransaction', {
      idTag: 'unsolicited',
      meterStart: 0,
    })) as { transactionId: number; idTagInfo: { status: string } };

    expect(result.idTagInfo.status).toBe('Invalid');
    expect(result.transactionId).toBe(0);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('StartTransaction is idempotent on a network re-send (open session reused)', async () => {
    findCharger.mockResolvedValue({ id: 'charger-1' });
    findFirstBooking.mockResolvedValue({ id: 'booking-1' });
    findSession.mockResolvedValue({ id: 'session-1', ocppTransactionId: 777, endedAt: null });

    const result = (await bindAndCall('StartTransaction', {
      idTag: 'abc123',
      meterStart: 0,
    })) as { transactionId: number; idTagInfo: { status: string } };

    expect(result.idTagInfo.status).toBe('Accepted');
    expect(result.transactionId).toBe(777);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('StartTransaction refuses a replay after the session already ended', async () => {
    findCharger.mockResolvedValue({ id: 'charger-1' });
    findFirstBooking.mockResolvedValue({ id: 'booking-1' });
    findSession.mockResolvedValue({
      id: 'session-1',
      ocppTransactionId: 777,
      endedAt: new Date('2026-01-01T01:00:00Z'),
    });

    const result = (await bindAndCall('StartTransaction', {
      idTag: 'abc123',
      meterStart: 0,
    })) as { transactionId: number; idTagInfo: { status: string } };

    expect(result.idTagInfo.status).toBe('Invalid');
    expect(result.transactionId).toBe(0);
    expect(createSession).not.toHaveBeenCalled();
  });
});

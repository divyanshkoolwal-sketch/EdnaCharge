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

const findUniqueOrThrow = vi.fn();
const findFirst = vi.fn();
const findUnique = vi.fn();
const updateCharger = vi.fn();
const updateBooking = vi.fn();
const createSession = vi.fn();
const updateSession = vi.fn();
const createMeterValue = vi.fn();
const queueAdd = vi.fn();

vi.mock('@edna/db', () => ({
  prisma: {
    charger: { findUnique: findUnique, update: updateCharger },
    booking: { findFirst: findFirst, update: updateBooking },
    chargingSession: {
      findUnique: vi.fn().mockImplementation((args) => findUnique({ table: 'session', ...args })),
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
  call: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
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

  it('Heartbeat returns current time', async () => {
    const result = (await bindAndCall('Heartbeat', {})) as { currentTime: string };
    expect(typeof result.currentTime).toBe('string');
    expect(new Date(result.currentTime).getTime()).toBeGreaterThan(0);
  });

  it('Authorize accepts any idTag (Tier 3 trusts the booking flow)', async () => {
    const result = (await bindAndCall('Authorize', { idTag: 'EDNA-abc' })) as {
      idTagInfo: { status: string };
    };
    expect(result.idTagInfo.status).toBe('Accepted');
  });

  it('StatusNotification → maps OCPP status to ChargerStatus enum + persists', async () => {
    findUnique.mockResolvedValue({ id: 'charger-1' });
    await bindAndCall('StatusNotification', { status: 'Available' });
    expect(updateCharger).toHaveBeenCalledWith({
      where: { id: 'charger-1' },
      data: { status: 'available' },
    });

    await bindAndCall('StatusNotification', { status: 'Charging' });
    expect(updateCharger).toHaveBeenLastCalledWith({
      where: { id: 'charger-1' },
      data: { status: 'occupied' },
    });

    await bindAndCall('StatusNotification', { status: 'Faulted' });
    expect(updateCharger).toHaveBeenLastCalledWith({
      where: { id: 'charger-1' },
      data: { status: 'faulted' },
    });
  });

  it('StatusNotification with unknown chargePointId is a no-op (no throw)', async () => {
    findUnique.mockResolvedValue(null);
    await expect(bindAndCall('StatusNotification', { status: 'Available' })).resolves.toEqual({});
    expect(updateCharger).not.toHaveBeenCalled();
  });

  it('StartTransaction creates a session + flips booking to active', async () => {
    findUnique.mockResolvedValue({ id: 'charger-1' });
    findFirst.mockResolvedValue({ id: 'booking-1' });
    createSession.mockResolvedValue({ id: 'session-1', ocppTransactionId: 12345 });

    const result = (await bindAndCall('StartTransaction', {
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

  it('StartTransaction with no confirmed booking returns Invalid + txn 0', async () => {
    findUnique.mockResolvedValue({ id: 'charger-1' });
    findFirst.mockResolvedValue(null);

    const result = (await bindAndCall('StartTransaction', {
      meterStart: 0,
    })) as { transactionId: number; idTagInfo: { status: string } };

    expect(result.idTagInfo.status).toBe('Invalid');
    expect(result.transactionId).toBe(0);
    expect(createSession).not.toHaveBeenCalled();
  });
});

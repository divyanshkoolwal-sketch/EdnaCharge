/** @file apps/csms/test/session-lifecycle.e2e.test.ts — full OCPP 1.6 charging-session lifecycle across handlers. */

/*
 * Integration test: drives ONE charging session end-to-end across multiple OCPP
 * 1.6 handlers in a single flow — BootNotification → Authorize → StartTransaction
 * → MeterValues → StopTransaction — not each handler in isolation. Reuses the
 * handlers.unit.test.ts mock pattern (`vi.mock('@edna/db')` / `bindHandlers` /
 * `fakeClient`), but backs prisma with a stateful in-memory store so the
 * transactionId minted by StartTransaction is the one MeterValues/StopTransaction
 * resolve. Asserts the CROSS-handler seams: a session is created for an authorized
 * booking, meter values land on it, and StopTransaction ends + enqueues settle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Stateful in-memory store (shared across handler calls in one flow) ──────

type SessionRow = {
  id: string;
  bookingId: string;
  chargerId: string;
  startedAt: Date;
  meterStartWh: number;
  ocppTransactionId: number | null;
  endedAt: Date | null;
  meterStopWh: number | null;
  finalKwh: number | null;
};

const store = {
  charger: { id: 'charger-1', hostId: 'host-1', ocppChargePointId: 'cp-test123' },
  booking: { id: 'booking-1', driverId: 'driver-1' },
  sessionsByBookingId: new Map<string, SessionRow>(),
  sessionsByTxId: new Map<number, SessionRow>(),
  meterRows: [] as Array<Record<string, unknown>>,
};

// prisma mocks (same boundary as handlers.unit.test.ts, extended with the
// methods MeterValues/StopTransaction reach through: meterValue.create is hit
// by recordMeterValues; chargingSession.update returns include:{booking,charger}).
const findCharger = vi.fn(async () => store.charger);
const findFirstBooking = vi.fn(async () => store.booking); // authorized booking
const findSessionUnique = vi.fn(
  async ({ where }: { where: { bookingId?: string; ocppTransactionId?: number } }) => {
    if (where.bookingId) return store.sessionsByBookingId.get(where.bookingId) ?? null;
    if (where.ocppTransactionId != null)
      return store.sessionsByTxId.get(where.ocppTransactionId) ?? null;
    return null;
  },
);
const createSession = vi.fn(async ({ data }: { data: Partial<SessionRow> }) => {
  const row: SessionRow = {
    id: 'session-1',
    bookingId: data.bookingId!,
    chargerId: data.chargerId!,
    startedAt: data.startedAt ?? new Date(),
    meterStartWh: data.meterStartWh ?? 0,
    ocppTransactionId: data.ocppTransactionId ?? null,
    endedAt: null,
    meterStopWh: null,
    finalKwh: null,
  };
  store.sessionsByBookingId.set(row.bookingId, row);
  if (row.ocppTransactionId != null) store.sessionsByTxId.set(row.ocppTransactionId, row);
  return row;
});
const updateSession = vi.fn(
  async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
    const row = [...store.sessionsByBookingId.values()].find((s) => s.id === where.id)!;
    Object.assign(row, data);
    // StopTransaction updates with include:{ booking, charger }.
    return { ...row, booking: store.booking, charger: store.charger };
  },
);
const updateBooking = vi.fn(async () => ({}));
const updateCharger = vi.fn(async () => ({}));
const createMeterValue = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
  const row = { id: `mv-${store.meterRows.length + 1}`, ...data };
  store.meterRows.push(row);
  return row;
});
const queueAdd = vi.fn();

vi.mock('@edna/db', () => ({
  prisma: {
    charger: { findUnique: findCharger, update: updateCharger },
    booking: { findFirst: findFirstBooking, update: updateBooking },
    chargingSession: {
      findUnique: findSessionUnique,
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
  store.sessionsByBookingId.clear();
  store.sessionsByTxId.clear();
  store.meterRows.length = 0;
});

async function call(method: string, params: unknown) {
  const h = handler.byMethod[method];
  if (!h) throw new Error(`handler not bound: ${method}`);
  return h({ params });
}

describe('OCPP 1.6 session lifecycle (cross-handler integration)', () => {
  it('Boot → Authorize → Start → MeterValues → Stop settles one session end-to-end', async () => {
    const { bindHandlers } = await import('../src/handlers/index.js');
    bindHandlers(fakeClient as any, { chargePointId: 'cp-test123' });

    // 1) BootNotification: charger comes online, CSMS accepts + hardens config.
    const boot = (await call('BootNotification', {
      chargePointVendor: 'Wallbox',
      chargePointModel: 'Pulsar Plus',
    })) as { status: string; interval: number };
    expect(boot.status).toBe('Accepted');
    expect(boot.interval).toBe(30);
    expect(fakeClient.call).toHaveBeenCalledWith('ChangeConfiguration', {
      key: 'AuthorizeRemoteTxRequests',
      value: 'true',
    });

    // 2) Authorize: the minted idTag maps to an authorized booking → Accepted.
    const authz = (await call('Authorize', { idTag: 'tok-abc' })) as {
      idTagInfo: { status: string };
    };
    expect(authz.idTagInfo.status).toBe('Accepted');

    // 3) StartTransaction: a NEW billable session is created for that booking,
    //    the booking flips to active, and a session_started notification is
    //    enqueued. This is the first cross-handler seam.
    const start = (await call('StartTransaction', {
      idTag: 'tok-abc',
      meterStart: 1000,
      timestamp: '2026-07-04T10:00:00Z',
    })) as { transactionId: number; idTagInfo: { status: string } };
    expect(start.idTagInfo.status).toBe('Accepted');
    expect(typeof start.transactionId).toBe('number');
    expect(start.transactionId).toBeGreaterThan(0);
    const txId = start.transactionId;

    expect(createSession).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: 'booking-1',
        chargerId: 'charger-1',
        meterStartWh: 1000,
      }),
    });
    expect(updateBooking).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { status: 'active' },
    });
    expect(queueAdd).toHaveBeenCalledWith(
      'session_started',
      expect.objectContaining({ driverId: 'driver-1', hostId: 'host-1', sessionId: 'session-1' }),
    );

    // 4) MeterValues: two samples for THIS session's txId are persisted. The
    //    handler resolves the session by txId (created in step 3) and delegates
    //    to recordMeterValues → prisma.meterValue.create. Units are converted:
    //    2 kWh → 2000 Wh, 7.2 kW → 7200 W.
    await call('MeterValues', {
      transactionId: txId,
      meterValue: [
        {
          timestamp: '2026-07-04T10:10:00Z',
          sampledValue: [
            { value: '2', measurand: 'Energy.Active.Import.Register', unit: 'kWh' },
            { value: '7.2', measurand: 'Power.Active.Import', unit: 'kW' },
            { value: '240', measurand: 'Voltage' },
            { value: '30', measurand: 'Current.Import' },
          ],
        },
        {
          timestamp: '2026-07-04T10:20:00Z',
          sampledValue: [{ value: '3.5', measurand: 'Energy.Active.Import.Register', unit: 'kWh' }],
        },
      ],
    });
    expect(createMeterValue).toHaveBeenCalledTimes(2);
    expect(store.meterRows[0]).toMatchObject({
      sessionId: 'session-1',
      energyWh: 2000,
      powerW: 7200,
      voltageV: 240,
      currentA: 30,
    });
    expect(store.meterRows[1]).toMatchObject({ sessionId: 'session-1', energyWh: 3500 });

    // 5) StopTransaction: ends the session (endedAt + finalKwh from the meter
    //    delta), notifies both sides, and hands settlement to the worker. This
    //    is the second cross-handler seam: the same session created in step 3
    //    and metered in step 4 is now settled.
    const stop = (await call('StopTransaction', {
      transactionId: txId,
      meterStop: 5000, // 5000 - 1000 = 4000 Wh = 4 kWh
      timestamp: '2026-07-04T10:30:00Z',
    })) as { idTagInfo: { status: string } };
    expect(stop.idTagInfo.status).toBe('Accepted');

    expect(updateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1' },
        data: expect.objectContaining({
          endedAt: expect.any(Date),
          meterStopWh: 5000,
          finalKwh: 4,
        }),
      }),
    );
    // session_stopped notification + settle_session job are the follow-ups.
    expect(queueAdd).toHaveBeenCalledWith(
      'session_stopped',
      expect.objectContaining({ driverId: 'driver-1', hostId: 'host-1', sessionId: 'session-1' }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      'settle_session',
      { sessionId: 'session-1' },
      expect.objectContaining({ jobId: 'settle:session-1' }),
    );

    // The persisted session row reflects the whole lifecycle.
    const finalRow = store.sessionsByTxId.get(txId)!;
    expect(finalRow.endedAt).toBeInstanceOf(Date);
    expect(finalRow.finalKwh).toBe(4);
    expect(store.meterRows).toHaveLength(2);
  });

  it('MeterValues for a session owned by a DIFFERENT charger are refused (no persist)', async () => {
    const { bindHandlers } = await import('../src/handlers/index.js');
    bindHandlers(fakeClient as any, { chargePointId: 'cp-test123' });

    // Start a real session on charger-1.
    const start = (await call('StartTransaction', {
      idTag: 'tok-abc',
      meterStart: 0,
    })) as { transactionId: number };
    const txId = start.transactionId;
    expect(store.meterRows).toHaveLength(0);

    // Now the same connecting charger (cp-test123 → charger-1) is spoofed to a
    // DIFFERENT owner so the session.chargerId !== c.id guard trips.
    findCharger.mockResolvedValueOnce({ ...store.charger }); // StartTransaction already consumed the default
    store.sessionsByTxId.get(txId)!.chargerId = 'charger-2';

    await call('MeterValues', {
      transactionId: txId,
      meterValue: [
        {
          timestamp: '2026-07-04T10:10:00Z',
          sampledValue: [{ value: '9', measurand: 'Energy.Active.Import.Register', unit: 'kWh' }],
        },
      ],
    });
    // The cross-charger guard prevented any meter row from being written.
    expect(createMeterValue).not.toHaveBeenCalled();
    expect(store.meterRows).toHaveLength(0);
  });
});

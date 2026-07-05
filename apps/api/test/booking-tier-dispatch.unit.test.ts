/**
 * Tests for booking.startSession / stopSession tier-dispatch logic.
 *
 * Mocks Prisma + queues so we can verify which queue/job gets enqueued
 * for each (tier, deviceLinked, currentStatus) combination, without spinning
 * up the full DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

const findUniqueOrThrow = vi.fn();
const updateBooking = vi.fn();
const updateManyBooking = vi.fn();
const ocppQueueAdd = vi.fn();
const bookingsQueueAdd = vi.fn();

const userFindFirst = vi.fn(async () => ({
  id: 'driver-1',
  firebaseUid: 'fb-uid-1',
  fullName: 'Test Driver',
  avatarUrl: null,
}));

vi.mock('@edna/db', () => ({
  prisma: {
    user: {
      findFirst: userFindFirst,
      findFirstOrThrow: userFindFirst,
      // protectedProcedure now resolves identity via findUnique (firebaseUid)
      // instead of the old OR-lookup — see the account-takeover fix in trpc.ts.
      findUnique: userFindFirst,
      update: vi.fn(),
      create: vi.fn(),
    },
    booking: {
      findUniqueOrThrow,
      update: updateBooking,
      updateMany: updateManyBooking,
    },
    chargingSession: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('../src/lib/queues.js', () => ({
  ocppCommandsQueue: { add: ocppQueueAdd },
  bookingsQueue: { add: bookingsQueueAdd },
  notificationsQueue: { add: vi.fn() },
}));
vi.mock('../src/lib/stripe.js', () => ({
  stripe: vi.fn(),
  devBypassStripe: vi.fn(() => true),
}));
vi.mock('../src/lib/pricing.js', () => ({
  estimateBooking: vi.fn(),
}));
vi.mock('../src/sentry.js', () => ({ Sentry: { captureException: vi.fn() } }));
vi.mock('../src/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const USER_ID = 'driver-1';
const ctx = {
  userId: USER_ID,
  email: 'driver@test.local',
  authUser: {
    id: USER_ID,
    email: 'driver@test.local',
    name: 'Test Driver',
    avatarUrl: null,
    emailVerified: true,
  },
} as const;

function makeBooking(overrides: Partial<any> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    chargerId: 'charger-1',
    driverId: USER_ID,
    status: 'confirmed',
    startAt: new Date(),
    endAt: new Date(Date.now() + 3600_000),
    estimatedKwh: 5,
    estimatedCostCents: 140,
    platformFeeCents: 21,
    preauthAmountCents: 161,
    autoDeclineAt: new Date(Date.now() + 1800_000),
    stripePaymentIntentId: 'pi_dev_x',
    charger: {
      id: 'charger-1',
      hostId: 'host-1',
      hardwareTier: 'tier_3_native',
      ocppChargePointId: 'cp-charger1',
      shellDevice: null,
    },
    session: null,
    ...overrides,
  };
}

// Reach into the procedure handler. We call the underlying mutation by
// replicating the router's procedure logic for `startSession`.
async function callStartSession(input: { bookingId: string }, booking: any) {
  findUniqueOrThrow.mockResolvedValue(booking);
  updateBooking.mockResolvedValue({});
  // startSession status/token writes now use updateMany with an optimistic
  // `status: 'confirmed'` guard; count === 1 means the lock was won.
  updateManyBooking.mockResolvedValue({ count: 1 });

  const router = await import('../src/routers/booking.js');
  // The startSession handler is defined inline; re-import the router and call
  // it via createCaller. For purer unit tests, we just inspect the queue mocks.
  const caller = router.bookingRouter.createCaller(ctx as any);
  return caller.startSession(input);
}

beforeEach(() => {
  findUniqueOrThrow.mockReset();
  updateBooking.mockReset();
  updateManyBooking.mockReset();
  ocppQueueAdd.mockReset();
  bookingsQueueAdd.mockReset();
});

describe('booking.startSession tier dispatch', () => {
  it('Tier 3 with OCPP credentials → enqueues RemoteStartTransaction', async () => {
    const result = await callStartSession(
      { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
      makeBooking({ charger: { id: 'c1', hostId: 'h1', hardwareTier: 'tier_3_native', ocppChargePointId: 'cp-1', shellDevice: null } }),
    );
    expect(result).toEqual({ status: 'dispatched' });
    expect(ocppQueueAdd).toHaveBeenCalledWith('RemoteStartTransaction', expect.objectContaining({
      kind: 'RemoteStartTransaction',
      chargePointId: 'cp-1',
    }));
    expect(bookingsQueueAdd).not.toHaveBeenCalled();
  });

  it('Tier 3 WITHOUT OCPP credentials → throws PRECONDITION_FAILED (no silent fallthrough)', async () => {
    await expect(
      callStartSession(
        { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
        makeBooking({ charger: { id: 'c1', hostId: 'h1', hardwareTier: 'tier_3_native', ocppChargePointId: null, shellDevice: null } }),
      ),
    ).rejects.toThrow(TRPCError);
  });

  it('Tier 1 WITH device → enqueues shelly_start (not virtual)', async () => {
    const result = await callStartSession(
      { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
      makeBooking({
        charger: {
          id: 'c1', hostId: 'h1', hardwareTier: 'tier_1_smart_plug',
          ocppChargePointId: null,
          shellDevice: { id: 'd1', shellyDeviceId: 'shellyplus-x', status: 'active' },
        },
      }),
    );
    expect(result).toEqual({ status: 'dispatched' });
    expect(bookingsQueueAdd).toHaveBeenCalledWith('shelly_start', { bookingId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(ocppQueueAdd).not.toHaveBeenCalled();
  });

  it('Tier 1 WITHOUT device → throws PRECONDITION_FAILED (regression test for silent-virtual bug)', async () => {
    await expect(
      callStartSession(
        { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
        makeBooking({
          charger: { id: 'c1', hostId: 'h1', hardwareTier: 'tier_1_smart_plug', ocppChargePointId: null, shellDevice: null },
        }),
      ),
    ).rejects.toThrow(/No smart plug linked/);
    expect(bookingsQueueAdd).not.toHaveBeenCalled();
    expect(updateBooking).not.toHaveBeenCalled();
  });

  it('Tier 2 WITH device → enqueues device_monitor + marks active', async () => {
    const result = await callStartSession(
      { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
      makeBooking({
        charger: {
          id: 'c1', hostId: 'h1', hardwareTier: 'tier_2_bridge_kit',
          ocppChargePointId: null,
          shellDevice: { id: 'd1', shellyDeviceId: 'shellypro-em-y', status: 'active' },
        },
      }),
    );
    expect(result).toEqual({ status: 'monitoring' });
    expect(bookingsQueueAdd).toHaveBeenCalledWith(
      'device_monitor',
      { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
      expect.objectContaining({ jobId: 'monitor_550e8400-e29b-41d4-a716-446655440000' }),
    );
    expect(updateManyBooking).toHaveBeenCalledWith({
      where: { id: '550e8400-e29b-41d4-a716-446655440000', status: 'confirmed' },
      data: { status: 'active' },
    });
  });

  it('Tier 2 WITHOUT device → throws PRECONDITION_FAILED', async () => {
    await expect(
      callStartSession(
        { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
        makeBooking({
          charger: { id: 'c1', hostId: 'h1', hardwareTier: 'tier_2_bridge_kit', ocppChargePointId: null, shellDevice: null },
        }),
      ),
    ).rejects.toThrow(/No bridge kit linked/);
  });

  it('Tier 4 (unmetered) → marks active virtually (no device required)', async () => {
    const result = await callStartSession(
      { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
      makeBooking({
        charger: { id: 'c1', hostId: 'h1', hardwareTier: 'tier_4_unmetered', ocppChargePointId: null, shellDevice: null },
      }),
    );
    expect(result).toEqual({ status: 'started_virtual' });
    expect(updateManyBooking).toHaveBeenCalledWith({
      where: { id: '550e8400-e29b-41d4-a716-446655440000', status: 'confirmed' },
      data: { status: 'active' },
    });
    expect(ocppQueueAdd).not.toHaveBeenCalled();
    expect(bookingsQueueAdd).not.toHaveBeenCalled();
  });

  it('Booking not in confirmed state → throws BAD_REQUEST', async () => {
    await expect(
      callStartSession(
        { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
        makeBooking({ status: 'pending' }),
      ),
    ).rejects.toThrow(/not confirmed/);
  });

  it('Booking from a different driver → throws FORBIDDEN', async () => {
    await expect(
      callStartSession(
        { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
        makeBooking({ driverId: 'someone-else' }),
      ),
    ).rejects.toThrow(TRPCError);
  });
});

// ----- stopSession tests -----

const sessionFindUniqueOrThrow = vi.fn();
const sessionUpdate = vi.fn();
const chargingSessionMock = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
}));

async function callStopSession(input: { sessionId: string }, session: any) {
  // The chargingSession mock from the top-level mock object
  const dbModule = await import('@edna/db') as any;
  dbModule.prisma.chargingSession.findUniqueOrThrow.mockResolvedValue(session);
  dbModule.prisma.chargingSession.update.mockResolvedValue({});

  const router = await import('../src/routers/booking.js');
  const caller = router.bookingRouter.createCaller(ctx as any);
  return caller.stopSession(input);
}

function makeSession(overrides: Partial<any> = {}) {
  return {
    id: '660e8400-e29b-41d4-a716-446655440000',
    bookingId: '550e8400-e29b-41d4-a716-446655440000',
    chargerId: '770e8400-e29b-41d4-a716-446655440000',
    ocppTransactionId: null,
    startedAt: new Date(Date.now() - 600_000),
    endedAt: null,
    meterStartWh: 0,
    booking: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      driverId: USER_ID,
      chargerId: '770e8400-e29b-41d4-a716-446655440000',
    },
    charger: {
      id: '770e8400-e29b-41d4-a716-446655440000',
      hardwareTier: 'tier_3_native',
      ocppChargePointId: 'cp-x',
      shellDevice: null,
    },
    ...overrides,
  };
}

describe('booking.stopSession tier dispatch', () => {
  it('Tier 3 active session → enqueues RemoteStopTransaction', async () => {
    const result = await callStopSession(
      { sessionId: '660e8400-e29b-41d4-a716-446655440000' },
      makeSession({ ocppTransactionId: 12345 }),
    );
    expect(result).toEqual({ status: 'dispatched' });
    expect(ocppQueueAdd).toHaveBeenCalledWith('RemoteStopTransaction', expect.objectContaining({
      kind: 'RemoteStopTransaction',
      transactionId: 12345,
    }));
  });

  it('Tier 1 active session → enqueues shelly_stop with sessionId', async () => {
    const result = await callStopSession(
      { sessionId: '660e8400-e29b-41d4-a716-446655440000' },
      makeSession({
        charger: {
          id: 'c1', hardwareTier: 'tier_1_smart_plug',
          ocppChargePointId: null,
          shellDevice: { id: 'd1', shellyDeviceId: 'shellyplus-x' },
        },
      }),
    );
    expect(result).toEqual({ status: 'dispatched' });
    expect(bookingsQueueAdd).toHaveBeenCalledWith('shelly_stop', expect.objectContaining({
      sessionId: '660e8400-e29b-41d4-a716-446655440000',
    }));
  });

  it('Tier 4 stop → marks endedAt and returns stopped_virtual', async () => {
    const result = await callStopSession(
      { sessionId: '660e8400-e29b-41d4-a716-446655440000' },
      makeSession({
        charger: { id: 'c1', hardwareTier: 'tier_4_unmetered', ocppChargePointId: null, shellDevice: null },
      }),
    );
    expect(result).toEqual({ status: 'stopped_virtual' });
  });

  it('Stop from a different driver → throws FORBIDDEN', async () => {
    await expect(
      callStopSession(
        { sessionId: '660e8400-e29b-41d4-a716-446655440000' },
        makeSession({ booking: { id: 'b1', driverId: 'not-me', chargerId: 'c1' } }),
      ),
    ).rejects.toThrow(TRPCError);
  });
});

// Suppress unused warnings
void sessionFindUniqueOrThrow;
void sessionUpdate;
void chargingSessionMock;

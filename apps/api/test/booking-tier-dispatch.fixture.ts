/** Mocks and fixtures for booking tier dispatch tests. */
import { vi } from 'vitest';

const findUniqueOrThrow = vi.fn();
export const updateBooking = vi.fn();
export const updateManyBooking = vi.fn();
export const ocppQueueAdd = vi.fn();
export const bookingsQueueAdd = vi.fn();

const USER_ID = 'driver-1';
const userFindFirst = vi.fn(async () => ({
  id: USER_ID,
  fullName: 'Test Driver',
  avatarUrl: null,
}));

vi.mock('@edna/db', () => ({
  BookingStatus: {
    pending: 'pending',
    confirmed: 'confirmed',
    declined: 'declined',
    cancelled: 'cancelled',
    active: 'active',
    completed: 'completed',
    no_show: 'no_show',
    errored: 'errored',
  },
  prisma: {
    $transaction: vi.fn(async (fn) =>
      fn({
        booking: { updateMany: updateManyBooking },
        chargingSession: { create: vi.fn(async () => ({ id: 'session-new' })) },
      }),
    ),
    user: {
      findFirst: userFindFirst,
      findFirstOrThrow: userFindFirst,
      findUnique: userFindFirst,
      update: vi.fn(),
      create: vi.fn(),
    },
    userAccessGrant: {
      findUnique: vi.fn(async () => ({ userId: USER_ID })),
      count: vi.fn(async () => 1),
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
vi.mock('../src/lib/stripe.js', () => ({ stripe: vi.fn(), devBypassStripe: vi.fn(() => true) }));
vi.mock('../src/lib/pricing.js', () => ({ estimateBooking: vi.fn() }));
vi.mock('../src/sentry.js', () => ({ Sentry: { captureException: vi.fn() } }));
vi.mock('../src/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

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

export function resetBookingTierMocks() {
  findUniqueOrThrow.mockReset();
  updateBooking.mockReset();
  updateManyBooking.mockReset();
  ocppQueueAdd.mockReset();
  bookingsQueueAdd.mockReset();
}

export function makeBooking(overrides: Partial<any> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    chargerId: 'charger-1',
    driverId: USER_ID,
    status: 'confirmed',
    startAt: new Date(),
    endAt: new Date(Date.now() + 3600_000),
    stripePaymentIntentId: 'pi_dev_x',
    charger: {
      id: 'charger-1',
      hostId: 'host-1',
      hardwareTier: 'tier_3_native',
      ocppChargePointId: 'cp-charger1',
      ocppConnectedAt: new Date(),
      shellDevice: null,
    },
    session: null,
    ...overrides,
  };
}

export async function callStartSession(input: { bookingId: string }, booking: any) {
  findUniqueOrThrow.mockResolvedValue(booking);
  updateBooking.mockResolvedValue({});
  updateManyBooking.mockResolvedValue({ count: 1 });
  const router = await import('../src/routers/booking.js');
  const caller = router.bookingRouter.createCaller(ctx as any);
  return caller.startSession(input);
}

export function makeSession(overrides: Partial<any> = {}) {
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

export async function callStopSession(input: { sessionId: string }, session: any) {
  const dbModule = (await import('@edna/db')) as any;
  dbModule.prisma.chargingSession.findUniqueOrThrow.mockResolvedValue(session);
  dbModule.prisma.chargingSession.update.mockResolvedValue({});
  const router = await import('../src/routers/booking.js');
  const caller = router.bookingRouter.createCaller(ctx as any);
  return caller.stopSession(input);
}

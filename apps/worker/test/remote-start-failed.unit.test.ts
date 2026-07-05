/** @file apps/worker/test/remote-start-failed.unit.test.ts. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bookingFindUniqueOrThrow: vi.fn(),
  bookingUpdateMany: vi.fn(),
  chatThreadCreate: vi.fn(),
  chatMessageCreate: vi.fn(),
  notificationsAdd: vi.fn(),
}));

vi.mock('@edna/db', () => ({
  prisma: {
    booking: {
      findUniqueOrThrow: mocks.bookingFindUniqueOrThrow,
      updateMany: mocks.bookingUpdateMany,
    },
    chatThread: {
      create: mocks.chatThreadCreate,
    },
    chatMessage: {
      create: mocks.chatMessageCreate,
    },
  },
}));

vi.mock('../src/lib/queues.js', () => ({
  notificationsQueue: () => ({ add: mocks.notificationsAdd }),
}));

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function confirmedBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    driverId: 'driver-1',
    status: 'confirmed',
    stripePaymentIntentId: 'pi_dev_hold',
    charger: { hostId: 'host-1', title: 'Garage charger' },
    chatThread: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
  mocks.bookingUpdateMany.mockResolvedValue({ count: 1 });
  mocks.chatThreadCreate.mockResolvedValue({ id: 'thread-1' });
});

describe('handleRemoteStartFailed', () => {
  it('marks a confirmed booking errored, clears OCPP auth, writes chat, and notifies both sides', async () => {
    const { handleRemoteStartFailed } = await import('../src/jobs/remote-start-failed.js');
    mocks.bookingFindUniqueOrThrow.mockResolvedValue(confirmedBooking());

    await handleRemoteStartFailed({ bookingId: 'booking-1', reason: 'Rejected' });

    expect(mocks.bookingUpdateMany).toHaveBeenCalledWith({
      where: { id: 'booking-1', status: { in: ['pending', 'confirmed'] } },
      data: {
        status: 'errored',
        declineReason: 'Remote start failed',
        ocppStartToken: null,
        ocppAuthorizedAt: null,
      },
    });
    expect(mocks.chatThreadCreate).toHaveBeenCalledWith({ data: { bookingId: 'booking-1' } });
    expect(mocks.chatMessageCreate).toHaveBeenCalledWith({
      data: {
        threadId: 'thread-1',
        senderId: null,
        kind: 'system',
        body: 'Charging could not start on Garage charger. Your card hold was released.',
      },
    });
    expect(mocks.notificationsAdd).toHaveBeenCalledWith('booking_errored', {
      driverId: 'driver-1',
      hostId: 'host-1',
      bookingId: 'booking-1',
    });
  });

  it('leaves already-active bookings untouched when a late remote-start failure arrives', async () => {
    const { handleRemoteStartFailed } = await import('../src/jobs/remote-start-failed.js');
    mocks.bookingFindUniqueOrThrow.mockResolvedValue(confirmedBooking({ status: 'active' }));

    await handleRemoteStartFailed({ bookingId: 'booking-1', reason: 'Rejected' });

    expect(mocks.bookingUpdateMany).not.toHaveBeenCalled();
    expect(mocks.chatMessageCreate).not.toHaveBeenCalled();
    expect(mocks.notificationsAdd).not.toHaveBeenCalled();
  });
});

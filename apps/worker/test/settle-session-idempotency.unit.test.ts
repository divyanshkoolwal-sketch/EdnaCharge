/** @file apps/worker/test/settle-session-idempotency.unit.test.ts. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chargingSessionFindUniqueOrThrow: vi.fn(),
  chargingSessionUpdate: vi.fn(),
  bookingUpdate: vi.fn(),
  payoutUpsert: vi.fn(),
  stripeRetrieve: vi.fn(),
  stripeCapture: vi.fn(),
  stripeCancel: vi.fn(),
}));

vi.mock('@edna/db', () => ({
  prisma: {
    chargingSession: {
      findUniqueOrThrow: mocks.chargingSessionFindUniqueOrThrow,
      update: mocks.chargingSessionUpdate,
    },
    booking: {
      update: mocks.bookingUpdate,
    },
    payout: {
      upsert: mocks.payoutUpsert,
    },
  },
}));

vi.mock('stripe', () => ({
  default: vi.fn(function StripeMock(this: unknown) {
    return {
      paymentIntents: {
        retrieve: mocks.stripeRetrieve,
        capture: mocks.stripeCapture,
        cancel: mocks.stripeCancel,
      },
    };
  }),
}));

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy');
  mocks.chargingSessionUpdate.mockResolvedValue({});
  mocks.bookingUpdate.mockResolvedValue({});
  mocks.payoutUpsert.mockResolvedValue({});
});

describe('settleSessionById idempotency', () => {
  it('completes a previously captured booking and upserts payout without recapturing', async () => {
    const { settleSessionById } = await import('../src/jobs/settle-session.js');
    const startedAt = new Date('2026-07-04T10:00:00.000Z');
    const endedAt = new Date('2026-07-04T11:00:00.000Z');
    mocks.chargingSessionFindUniqueOrThrow.mockResolvedValue({
      id: 'session-1',
      bookingId: 'booking-1',
      startedAt,
      endedAt,
      finalKwh: 3,
      booking: {
        id: 'booking-1',
        chargerId: 'charger-1',
        stripePaymentIntentId: 'pi_real_123',
        stripeChargeId: null,
        stripeReceiptUrl: null,
        capturedAmountCents: 222,
        preauthAmountCents: 1000,
        ratePerKwhCents: 50,
        charger: {
          id: 'charger-1',
          hostId: 'host-1',
          powerKw: 7.2,
          pricePerKwhCents: 60,
          pricePerHourCents: null,
        },
      },
    });
    mocks.stripeRetrieve.mockResolvedValue({
      latest_charge: {
        id: 'ch_123',
        receipt_url: 'https://stripe.test/receipt',
        transfer: 'tr_123',
      },
    });

    await settleSessionById('session-1');

    expect(mocks.stripeRetrieve).toHaveBeenCalledWith('pi_real_123', {
      expand: ['latest_charge'],
    });
    expect(mocks.stripeCapture).not.toHaveBeenCalled();
    expect(mocks.chargingSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { finalCostCents: 150 },
    });
    expect(mocks.bookingUpdate).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: {
        status: 'completed',
        capturedAmountCents: 222,
        // Fee is reconciled onto the booking at settle so host screens (which
        // derive net as captured − platformFeeCents) match the actual payout.
        platformFeeCents: 23,
        stripeChargeId: 'ch_123',
        stripeReceiptUrl: 'https://stripe.test/receipt',
      },
    });
    expect(mocks.payoutUpsert).toHaveBeenCalledWith({
      where: { bookingId: 'booking-1' },
      create: {
        hostId: 'host-1',
        bookingId: 'booking-1',
        grossCents: 222,
        platformFeeCents: 23,
        netCents: 199,
        stripeTransferId: 'tr_123',
        status: 'pending',
      },
      update: {
        grossCents: 222,
        platformFeeCents: 23,
        netCents: 199,
        stripeTransferId: 'tr_123',
      },
    });
  });
});

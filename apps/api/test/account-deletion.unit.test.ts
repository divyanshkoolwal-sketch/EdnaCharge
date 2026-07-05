/** @file apps/api/test/account-deletion.unit.test.ts. */
import { describe, expect, it, vi } from 'vitest';
import {
  accountDeletionBlockingBookings,
  accountDeletionPaymentIntents,
  cancelAccountDeletionPaymentIntents,
  isAlreadyDeleted,
} from '../src/routers/auth/account-deletion.js';

describe('account deletion payment cleanup', () => {
  it('includes hosted bookings and dedupes self-hosted overlaps before canceling Stripe holds', () => {
    const refs = accountDeletionPaymentIntents([
      { id: 'driver-booking', status: 'pending', stripePaymentIntentId: 'pi_driver' },
      { id: 'hosted-booking', status: 'confirmed', stripePaymentIntentId: 'pi_guest' },
      { id: 'hosted-booking', status: 'confirmed', stripePaymentIntentId: 'pi_guest' },
      { id: 'dev-booking', status: 'pending', stripePaymentIntentId: 'pi_dev_local' },
      { id: 'empty-booking', status: 'pending', stripePaymentIntentId: null },
    ]);

    expect(refs).toEqual([
      { bookingId: 'driver-booking', paymentIntentId: 'pi_driver' },
      { bookingId: 'hosted-booking', paymentIntentId: 'pi_guest' },
    ]);
  });

  it('blocks destructive account deletion while any driver or hosted booking is active', () => {
    const refs = accountDeletionBlockingBookings([
      { id: 'driver-booking', status: 'confirmed', stripePaymentIntentId: 'pi_driver' },
      { id: 'active-booking', status: 'active', stripePaymentIntentId: 'pi_active' },
      { id: 'active-booking', status: 'active', stripePaymentIntentId: 'pi_active' },
    ]);

    expect(refs).toEqual([{ bookingId: 'active-booking' }]);
  });

  it('fails closed when a Stripe hold cannot be canceled', async () => {
    const cancelPaymentIntent = vi.fn(async () => {
      throw new Error('stripe unavailable');
    });

    await expect(
      cancelAccountDeletionPaymentIntents(
        [{ bookingId: 'booking-1', paymentIntentId: 'pi_hold' }],
        cancelPaymentIntent,
      ),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('resolves without throwing when there are no holds to cancel', async () => {
    const cancelPaymentIntent = vi.fn(async () => {});
    await expect(
      cancelAccountDeletionPaymentIntents([], cancelPaymentIntent),
    ).resolves.toBeUndefined();
    expect(cancelPaymentIntent).not.toHaveBeenCalled();
  });
});

describe('account deletion idempotent-resume guard', () => {
  it('treats an already-anonymized user (deletedAt set) as done', () => {
    expect(isAlreadyDeleted({ deletedAt: new Date('2026-01-01T00:00:00Z') })).toBe(true);
  });

  it('lets a live user proceed to deletion (deletedAt null)', () => {
    expect(isAlreadyDeleted({ deletedAt: null })).toBe(false);
  });
});

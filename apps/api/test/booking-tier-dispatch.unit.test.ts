/** Tests for booking start/stop dispatch by charger hardware tier. */
import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  bookingsQueueAdd,
  callStartSession,
  callStopSession,
  makeBooking,
  makeSession,
  ocppQueueAdd,
  resetBookingTierMocks,
  updateBooking,
  updateManyBooking,
} from './booking-tier-dispatch.fixture.js';

beforeEach(resetBookingTierMocks);

describe('booking.startSession tier dispatch', () => {
  it('Tier 3 with OCPP credentials enqueues RemoteStartTransaction', async () => {
    const result = await callStartSession(
      { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
      makeBooking({
        charger: {
          id: 'c1',
          hostId: 'h1',
          hardwareTier: 'tier_3_native',
          ocppChargePointId: 'cp-1',
          ocppConnectedAt: new Date(),
          shellDevice: null,
        },
      }),
    );
    expect(result).toEqual({ status: 'dispatched' });
    expect(ocppQueueAdd).toHaveBeenCalledWith(
      'RemoteStartTransaction',
      expect.objectContaining({
        kind: 'RemoteStartTransaction',
        chargePointId: 'cp-1',
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        idTag: expect.any(String),
      }),
      expect.objectContaining({
        attempts: 5,
        jobId: expect.stringContaining('remote-start:550e8400-e29b-41d4-a716-446655440000:'),
      }),
    );
    expect(bookingsQueueAdd).not.toHaveBeenCalled();
  });

  it('re-enqueues a still-valid OCPP start token before reporting dispatch', async () => {
    const result = await callStartSession(
      { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
      makeBooking({
        ocppStartToken: 'existing-token',
        ocppAuthorizedAt: new Date(),
        charger: {
          id: 'c1',
          hostId: 'h1',
          hardwareTier: 'tier_3_native',
          ocppChargePointId: 'cp-1',
          ocppConnectedAt: new Date(),
          shellDevice: null,
        },
      }),
    );

    expect(result).toEqual({ status: 'dispatched' });
    expect(updateManyBooking).not.toHaveBeenCalled();
    expect(ocppQueueAdd).toHaveBeenCalledWith(
      'RemoteStartTransaction',
      expect.objectContaining({
        chargePointId: 'cp-1',
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        idTag: 'existing-token',
      }),
      expect.objectContaining({
        jobId: 'remote-start:550e8400-e29b-41d4-a716-446655440000:existing-token',
      }),
    );
  });

  it('does not report dispatch when the OCPP queue enqueue fails', async () => {
    ocppQueueAdd.mockRejectedValueOnce(new Error('redis down'));

    await expect(
      callStartSession(
        { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
        makeBooking({
          ocppStartToken: 'existing-token',
          ocppAuthorizedAt: new Date(),
          charger: {
            id: 'c1',
            hostId: 'h1',
            hardwareTier: 'tier_3_native',
            ocppChargePointId: 'cp-1',
            ocppConnectedAt: new Date(),
            shellDevice: null,
          },
        }),
      ),
    ).rejects.toThrow(/start command/);
  });

  it('Tier 3 without OCPP credentials throws', async () => {
    await expect(
      callStartSession(
        { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
        makeBooking({
          charger: {
            id: 'c1',
            hostId: 'h1',
            hardwareTier: 'tier_3_native',
            ocppChargePointId: null,
            shellDevice: null,
          },
        }),
      ),
    ).rejects.toThrow(TRPCError);
  });

  it('Tier 3 with stale OCPP heartbeat refuses start before dispatching hardware command', async () => {
    await expect(
      callStartSession(
        { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
        makeBooking({
          charger: {
            id: 'c1',
            hostId: 'h1',
            hardwareTier: 'tier_3_native',
            ocppChargePointId: 'cp-1',
            ocppConnectedAt: new Date(Date.now() - 10 * 60_000),
            shellDevice: null,
          },
        }),
      ),
    ).rejects.toThrow(/not connected/);
    expect(updateManyBooking).not.toHaveBeenCalled();
    expect(ocppQueueAdd).not.toHaveBeenCalled();
  });

  it.each(['tier_1_smart_plug', 'tier_2_bridge_kit', 'tier_4_unmetered'] as const)(
    '%s start is rejected for OCPP-only MVP',
    async (hardwareTier) => {
      await expect(
        callStartSession(
          { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
          makeBooking({
            charger: {
              id: 'c1',
              hostId: 'h1',
              hardwareTier,
              ocppChargePointId: null,
              shellDevice: null,
            },
          }),
        ),
      ).rejects.toThrow(/OCPP-connected chargers only/);
      expect(bookingsQueueAdd).not.toHaveBeenCalled();
      expect(updateBooking).not.toHaveBeenCalled();
    },
  );

  it('Tier 1 start does not enqueue shelly jobs', async () => {
    await expect(
      callStartSession(
        { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
        makeBooking({
          charger: {
            id: 'c1',
            hostId: 'h1',
            hardwareTier: 'tier_1_smart_plug',
            ocppChargePointId: null,
            shellDevice: null,
          },
        }),
      ),
    ).rejects.toThrow(/OCPP-connected chargers only/);
    expect(bookingsQueueAdd).not.toHaveBeenCalled();
    expect(updateBooking).not.toHaveBeenCalled();
  });

  it('non-confirmed booking throws', async () => {
    await expect(
      callStartSession(
        { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
        makeBooking({ status: 'pending' }),
      ),
    ).rejects.toThrow(/not confirmed/);
  });

  it('booking from a different driver throws', async () => {
    await expect(
      callStartSession(
        { bookingId: '550e8400-e29b-41d4-a716-446655440000' },
        makeBooking({ driverId: 'someone-else' }),
      ),
    ).rejects.toThrow(TRPCError);
  });
});

describe('booking.stopSession tier dispatch', () => {
  it('Tier 3 active session enqueues RemoteStopTransaction', async () => {
    const result = await callStopSession(
      { sessionId: '660e8400-e29b-41d4-a716-446655440000' },
      makeSession({ ocppTransactionId: 12345 }),
    );
    expect(result).toEqual({ status: 'dispatched' });
    expect(ocppQueueAdd).toHaveBeenCalledWith(
      'RemoteStopTransaction',
      expect.objectContaining({ kind: 'RemoteStopTransaction', transactionId: 12345 }),
      expect.objectContaining({ attempts: 5 }),
    );
  });

  it('non-OCPP existing session stop is rejected', async () => {
    await expect(
      callStopSession(
        { sessionId: '660e8400-e29b-41d4-a716-446655440000' },
        makeSession({
          charger: {
            id: 'c1',
            hardwareTier: 'tier_4_unmetered',
            ocppChargePointId: null,
            shellDevice: null,
          },
        }),
      ),
    ).rejects.toThrow(/OCPP-connected chargers only/);
  });

  it('stop from a different driver throws', async () => {
    await expect(
      callStopSession(
        { sessionId: '660e8400-e29b-41d4-a716-446655440000' },
        makeSession({ booking: { id: 'b1', driverId: 'not-me', chargerId: 'c1' } }),
      ),
    ).rejects.toThrow(TRPCError);
  });
});

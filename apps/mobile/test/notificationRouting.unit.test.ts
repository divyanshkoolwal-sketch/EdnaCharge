/** @file apps/mobile/test/notificationRouting.unit.test.ts. */
import { describe, expect, it } from 'vitest';
import { notificationRouteFromData } from '../src/lib/notificationRouting';

describe('notificationRouteFromData', () => {
  it('routes host booking requests to the review screen', () => {
    expect(
      notificationRouteFromData({
        kind: 'new_booking_request',
        recipientRole: 'host',
        bookingId: 'booking-1',
      }),
    ).toEqual({ pathname: '/(host)/request/[id]', params: { id: 'booking-1' } });
  });

  it('routes chat pushes to the recipient side', () => {
    expect(
      notificationRouteFromData({
        kind: 'new_chat_message',
        recipientRole: 'host',
        bookingId: 'booking-1',
        threadId: 'thread-1',
      }),
    ).toEqual({ pathname: '/(host)/chat/[bookingId]', params: { bookingId: 'booking-1' } });
  });

  it('routes driver session pushes to the live session', () => {
    expect(
      notificationRouteFromData({
        kind: 'session_started',
        recipientRole: 'driver',
        sessionId: 'session-1',
      }),
    ).toEqual({ pathname: '/(driver)/session/[id]', params: { id: 'session-1' } });
  });

  it('routes remote-start errors to the recipient booking side', () => {
    expect(
      notificationRouteFromData({
        kind: 'booking_errored',
        recipientRole: 'host',
        bookingId: 'booking-1',
      }),
    ).toEqual({ pathname: '/(host)/request/[id]', params: { id: 'booking-1' } });
  });

  it('routes cancellation pushes to the driver booking detail', () => {
    expect(
      notificationRouteFromData({
        kind: 'booking_cancelled',
        recipientRole: 'driver',
        bookingId: 'booking-1',
      }),
    ).toEqual({ pathname: '/(driver)/booking/[id]', params: { id: 'booking-1' } });
  });

  it('falls back for legacy payloads without a kind', () => {
    expect(
      notificationRouteFromData({
        recipientRole: 'driver',
        bookingId: 'booking-1',
        threadId: 'thread-1',
      }),
    ).toEqual({ pathname: '/(driver)/chat/[bookingId]', params: { bookingId: 'booking-1' } });
  });
});

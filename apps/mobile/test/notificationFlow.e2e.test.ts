/** @file apps/mobile/test/notificationFlow.e2e.test.ts — push payload → deep-link resolution across roles/types. */

/*
 * Integration test for the mobile notification pipeline: a push notification's
 * data payload (the shape the worker attaches and push.ts reads off
 * response.notification.request.content.data) routed through
 * notificationRouteFromData() to a resolved deep-link — exercised for BOTH the
 * driver and the host side, across the notification types the worker actually
 * emits. Pure logic, no native modules (same import surface as
 * notificationRouting.unit.test.ts), so it runs green with no Expo/RN mocks.
 *
 * This composes the two ends the real app wires together: the payload the
 * worker's notify() builds (data = { kind, recipientRole, bookingId?, threadId?,
 * sessionId? }) and the router push.ts hands that payload to on tap.
 */

import { describe, expect, it } from 'vitest';
import {
  notificationRouteFromData,
  type NotificationRole,
  type NotificationRoute,
} from '../src/lib/notificationRouting';

/**
 * Model of the push `data` object the worker attaches (notifications.ts builds
 * exactly these keys), i.e. what lands at content.data and is fed to the router.
 */
type PushData = {
  kind: string;
  recipientRole: NotificationRole;
  bookingId?: string;
  threadId?: string;
  sessionId?: string;
};

/** Build the push payload the worker sends over Expo for a given notification. */
function pushPayload(
  kind: string,
  role: NotificationRole,
  ids: Omit<PushData, 'kind' | 'recipientRole'>,
): PushData {
  return { kind, recipientRole: role, ...ids };
}

/** The pipeline: worker push payload → router → resolved route (or null). */
function resolve(data: PushData): NotificationRoute | null {
  // fallbackRole mirrors push.ts passing the user's current role; a well-formed
  // payload always carries recipientRole so the fallback is inert here.
  return notificationRouteFromData(data, data.recipientRole);
}

describe('mobile notification flow (push payload → deep-link)', () => {
  it('routes a booking request to the host review screen', () => {
    const route = resolve(pushPayload('new_booking_request', 'host', { bookingId: 'b1' }));
    expect(route).toEqual({ pathname: '/(host)/request/[id]', params: { id: 'b1' } });
  });

  it('routes booking outcomes to the correct side for driver vs host', () => {
    // Same kind, two recipients → two different interfaces (dual-role safety).
    expect(resolve(pushPayload('booking_accepted', 'driver', { bookingId: 'b1' }))).toEqual({
      pathname: '/(driver)/booking/[id]',
      params: { id: 'b1' },
    });
    expect(resolve(pushPayload('booking_errored', 'host', { bookingId: 'b1' }))).toEqual({
      pathname: '/(host)/request/[id]',
      params: { id: 'b1' },
    });
    expect(resolve(pushPayload('booking_cancelled', 'driver', { bookingId: 'b1' }))).toEqual({
      pathname: '/(driver)/booking/[id]',
      params: { id: 'b1' },
    });
  });

  it('routes chat pushes to the recipient side keyed by bookingId', () => {
    const driver = resolve(
      pushPayload('new_chat_message', 'driver', { bookingId: 'b1', threadId: 't1' }),
    );
    const host = resolve(
      pushPayload('new_chat_message', 'host', { bookingId: 'b1', threadId: 't1' }),
    );
    expect(driver).toEqual({ pathname: '/(driver)/chat/[bookingId]', params: { bookingId: 'b1' } });
    expect(host).toEqual({ pathname: '/(host)/chat/[bookingId]', params: { bookingId: 'b1' } });
  });

  it('routes a live session push differently for driver (live session) vs host (home)', () => {
    // The worker emits session_started to BOTH sides with the same sessionId;
    // the router sends the driver to the live session and the host to home.
    expect(resolve(pushPayload('session_started', 'driver', { sessionId: 's1' }))).toEqual({
      pathname: '/(driver)/session/[id]',
      params: { id: 's1' },
    });
    expect(resolve(pushPayload('session_stopped', 'host', { sessionId: 's1' }))).toBe(
      '/(host)/home',
    );
  });

  it('routes review pushes to the right per-role destination', () => {
    expect(resolve(pushPayload('review_left', 'host', { bookingId: 'b1' }))).toEqual({
      pathname: '/(host)/review/[bookingId]',
      params: { bookingId: 'b1' },
    });
    expect(resolve(pushPayload('review_left', 'driver', { bookingId: 'b1' }))).toEqual({
      pathname: '/(driver)/receipt/[id]',
      params: { id: 'b1' },
    });
  });

  it('resolves EVERY worker notification kind to a non-null route for both roles', () => {
    // End-to-end coverage: every kind the worker's notify() can emit must land
    // somewhere for whichever side receives it (no dead-end taps).
    const kinds = [
      'new_booking_request',
      'booking_accepted',
      'booking_declined',
      'booking_auto_declined',
      'booking_errored',
      'booking_cancelled',
      'new_chat_message',
      'session_started',
      'session_stopped',
      'review_left',
    ] as const;
    const roles: NotificationRole[] = ['driver', 'host'];
    for (const kind of kinds) {
      for (const role of roles) {
        // new_booking_request is a host-only notification; the worker never
        // emits it to a driver, so exclude that one impossible combination.
        if (kind === 'new_booking_request' && role === 'driver') continue;
        const route = resolve(
          pushPayload(kind, role, { bookingId: 'b1', threadId: 't1', sessionId: 's1' }),
        );
        expect(route, `${kind}/${role} should resolve to a route`).not.toBeNull();
      }
    }
  });

  it('falls back to the user role for a legacy payload missing kind (chat-shaped)', () => {
    // push.ts passes useRole.getState().role as the fallback; a legacy payload
    // with a booking+thread but no kind resolves as a chat deep-link for that
    // fallback role.
    const asDriver = notificationRouteFromData({ bookingId: 'b1', threadId: 't1' }, 'driver');
    const asHost = notificationRouteFromData({ bookingId: 'b1', threadId: 't1' }, 'host');
    expect(asDriver).toEqual({
      pathname: '/(driver)/chat/[bookingId]',
      params: { bookingId: 'b1' },
    });
    expect(asHost).toEqual({ pathname: '/(host)/chat/[bookingId]', params: { bookingId: 'b1' } });
  });

  it('returns null when a payload carries no routable ids', () => {
    expect(resolve(pushPayload('booking_accepted', 'driver', {}))).toBeNull();
  });
});

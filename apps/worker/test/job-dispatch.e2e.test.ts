/** @file apps/worker/test/job-dispatch.e2e.test.ts — worker notification job dispatched end-to-end across types. */

/*
 * Integration test for the notifications job path (apps/worker/src/jobs/
 * notifications.ts) end-to-end: a BullMQ-shaped job flows through notify(),
 * which resolves recipients via prisma, writes the in-app feed row
 * (notification.create), and dispatches the Expo push over fetch(). We drive
 * several notification NAMES through the ONE notify() entry point and assert the
 * integration: the right users are looked up, the right feed rows are written
 * (with the correct recipientRole + deep-link ids), and a push is dispatched
 * with a payload the mobile router can consume.
 *
 * Fully deterministic — prisma and fetch are mocked; no Redis / Stripe / network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  bookingFindUnique: vi.fn(),
  chatThreadFindUnique: vi.fn(),
  notificationCreate: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@edna/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    booking: { findUnique: mocks.bookingFindUnique },
    chatThread: { findUnique: mocks.chatThreadFindUnique },
    notification: { create: mocks.notificationCreate },
  },
}));

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Build a minimal BullMQ Job-shaped object (only name + data are read). */
function job<T>(name: string, data: T) {
  return { name, data } as any;
}

/** Users are looked up by id; return one with a push token so a push fires. */
function userWithToken(id: string) {
  return { id, expoPushToken: `ExponentPushToken[${id}]` };
}

/** The push payload dispatched for a given user id, parsed from fetch. */
function pushPayloadFor(userToken: string): Record<string, unknown> | null {
  for (const [, init] of mocks.fetch.mock.calls) {
    const body = JSON.parse((init as { body: string }).body);
    if (body.to === userToken) return body;
  }
  return null;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.notificationCreate.mockResolvedValue({ id: 'notif-1' });
  mocks.fetch.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('notify() job dispatch (worker → prisma feed + expo push)', () => {
  it('new_booking_request writes a HOST feed row and pushes only the host', async () => {
    const { notify } = await import('../src/jobs/notifications.js');
    mocks.userFindUnique.mockResolvedValue(userWithToken('host-1'));

    await notify(job('new_booking_request', { hostId: 'host-1', bookingId: 'booking-1' }));

    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { id: 'host-1' } });
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'host-1',
        kind: 'new_booking_request',
        recipientRole: 'host',
        bookingId: 'booking-1',
        threadId: null,
        sessionId: null,
      }),
    });
    // Exactly one push, to the host, carrying the routing metadata.
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const payload = pushPayloadFor('ExponentPushToken[host-1]');
    expect(payload).toMatchObject({
      to: 'ExponentPushToken[host-1]',
      data: { kind: 'new_booking_request', recipientRole: 'host', bookingId: 'booking-1' },
    });
  });

  it('session_started fans out to BOTH driver and host with correct per-side roles', async () => {
    const { notify } = await import('../src/jobs/notifications.js');
    mocks.userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      userWithToken(where.id),
    );

    await notify(
      job('session_started', { driverId: 'driver-1', hostId: 'host-1', sessionId: 'session-1' }),
    );

    // Both recipients looked up and given a feed row keyed by sessionId.
    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { id: 'driver-1' } });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { id: 'host-1' } });
    expect(mocks.notificationCreate).toHaveBeenCalledTimes(2);
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'driver-1',
        recipientRole: 'driver',
        sessionId: 'session-1',
        bookingId: null,
      }),
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'host-1',
        recipientRole: 'host',
        sessionId: 'session-1',
      }),
    });
    // Two pushes: one per side, each with the recipient's own role.
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(pushPayloadFor('ExponentPushToken[driver-1]')).toMatchObject({
      data: { kind: 'session_started', recipientRole: 'driver', sessionId: 'session-1' },
    });
    expect(pushPayloadFor('ExponentPushToken[host-1]')).toMatchObject({
      data: { kind: 'session_started', recipientRole: 'host', sessionId: 'session-1' },
    });
  });

  it('new_chat_message resolves the thread → deep-links by bookingId and infers driver side', async () => {
    const { notify } = await import('../src/jobs/notifications.js');
    mocks.userFindUnique.mockResolvedValue(userWithToken('driver-1'));
    // Thread lookup drives BOTH the deep-link bookingId and the recipient side
    // (driverId === userId → 'driver'). This is the cross-model seam.
    mocks.chatThreadFindUnique.mockResolvedValue({
      booking: { id: 'booking-1', driverId: 'driver-1' },
    });

    await notify(
      job('new_chat_message', {
        userId: 'driver-1',
        threadId: 'thread-1',
        preview: 'See you at 5',
      }),
    );

    expect(mocks.chatThreadFindUnique).toHaveBeenCalledWith({
      where: { id: 'thread-1' },
      select: { booking: { select: { id: true, driverId: true } } },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'driver-1',
        kind: 'new_chat_message',
        recipientRole: 'driver',
        threadId: 'thread-1',
        bookingId: 'booking-1',
      }),
    });
    expect(pushPayloadFor('ExponentPushToken[driver-1]')).toMatchObject({
      body: 'See you at 5',
      data: {
        kind: 'new_chat_message',
        recipientRole: 'driver',
        threadId: 'thread-1',
        bookingId: 'booking-1',
      },
    });
  });

  it('booking_declined enriches the driver push body with the decline reason', async () => {
    const { notify } = await import('../src/jobs/notifications.js');
    mocks.userFindUnique.mockResolvedValue(userWithToken('driver-1'));
    // The declined path reads the booking to surface declineReason in the body.
    mocks.bookingFindUnique.mockResolvedValue({ id: 'booking-1', declineReason: 'not_available' });

    await notify(job('booking_declined', { driverId: 'driver-1', bookingId: 'booking-1' }));

    expect(mocks.bookingFindUnique).toHaveBeenCalledWith({ where: { id: 'booking-1' } });
    const payload = pushPayloadFor('ExponentPushToken[driver-1]');
    expect(payload).toMatchObject({ data: { kind: 'booking_declined', recipientRole: 'driver' } });
    // Underscores in the reason are humanized into the push body.
    expect(String((payload as { body: string }).body)).toContain('not available');
  });

  it('a missing recipient (user not found) writes no feed row and dispatches no push', async () => {
    const { notify } = await import('../src/jobs/notifications.js');
    mocks.userFindUnique.mockResolvedValue(null);

    await notify(job('booking_accepted', { driverId: 'ghost', bookingId: 'booking-1' }));

    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('a feed-row write failure still dispatches the push (best-effort persist)', async () => {
    const { notify } = await import('../src/jobs/notifications.js');
    mocks.userFindUnique.mockResolvedValue(userWithToken('driver-1'));
    mocks.notificationCreate.mockRejectedValueOnce(new Error('db down'));

    await notify(job('booking_accepted', { driverId: 'driver-1', bookingId: 'booking-1' }));

    // Persist threw, but the push still went out — decoupled by design.
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(pushPayloadFor('ExponentPushToken[driver-1]')).toMatchObject({
      data: { kind: 'booking_accepted', recipientRole: 'driver', bookingId: 'booking-1' },
    });
  });
});

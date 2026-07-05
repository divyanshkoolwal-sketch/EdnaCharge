import type { Job } from 'bullmq';
import { prisma } from '@edna/db';
import { logger } from '../logger.js';

type Payload =
  | { hostId: string; bookingId: string }
  | { driverId: string; bookingId: string }
  | { driverId: string; hostId: string; bookingId: string }
  | { userId: string; threadId: string; preview: string }
  | { driverId: string; hostId: string; sessionId: string }
  | { userId: string; bookingId: string };

type NotificationName =
  | 'new_booking_request'
  | 'booking_accepted'
  | 'booking_declined'
  | 'booking_auto_declined'
  | 'new_chat_message'
  | 'session_started'
  | 'session_stopped'
  | 'review_left';

export type NotificationJob = Job<Payload, void, NotificationName>;

type UserRef = { id: string; expoPushToken?: string | null };
type DeepLink = { bookingId?: string | null; threadId?: string | null; sessionId?: string | null };

/**
 * Deliver a notification: persist it to the in-app feed AND send the push.
 * Persisting is best-effort — a DB hiccup must not drop the push, and a push
 * failure must not drop the feed row (pushUser already swallows its errors).
 */
async function notifyUser(
  ref: UserRef,
  kind: NotificationName,
  title: string,
  body: string,
  link: DeepLink,
  recipientRole: 'driver' | 'host',
) {
  try {
    await prisma.notification.create({
      data: {
        userId: ref.id,
        kind,
        recipientRole,
        title,
        body,
        bookingId: link.bookingId ?? null,
        threadId: link.threadId ?? null,
        sessionId: link.sessionId ?? null,
      },
    });
  } catch (err) {
    logger.warn({ err, userId: ref.id, kind }, 'failed to persist notification');
  }
  const data: Record<string, string> = {};
  if (link.bookingId) data.bookingId = link.bookingId;
  if (link.threadId) data.threadId = link.threadId;
  if (link.sessionId) data.sessionId = link.sessionId;
  await pushUser(ref, title, body, data);
}

async function pushUser(ref: UserRef, title: string, body: string, data: Record<string, string>) {
  if (!ref.expoPushToken) {
    logger.debug({ userId: ref.id }, 'no expo push token; skipping');
    return;
  }
  // 10s timeout so a hung Expo push endpoint can't block the worker's job slot.
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: ref.expoPushToken, title, body, data }),
      signal: ctrl.signal,
    });
    if (!res.ok) logger.warn({ status: res.status }, 'expo push non-2xx');
  } catch (err) {
    logger.warn({ err }, 'expo push failed');
  } finally {
    clearTimeout(timeout);
  }
}

function hasStringProp<T extends string>(
  payload: Payload,
  prop: T,
): payload is Payload & Record<T, string> {
  return prop in payload && typeof payload[prop as keyof Payload] === 'string';
}

export async function notify(job: NotificationJob) {
  const name = job.name;
  const p = job.data;
  switch (name) {
    case 'new_booking_request': {
      // Booking requests only ever go to the host.
      if (!hasStringProp(p, 'hostId') || !hasStringProp(p, 'bookingId')) break;
      const u = await prisma.user.findUnique({ where: { id: p.hostId } });
      if (u) await notifyUser(u, name, 'New booking request', 'Tap to review.', { bookingId: p.bookingId }, 'host');
      break;
    }
    case 'booking_accepted': {
      // Accept/decline outcomes only ever go to the driver.
      if (!hasStringProp(p, 'driverId') || !hasStringProp(p, 'bookingId')) break;
      const u = await prisma.user.findUnique({ where: { id: p.driverId } });
      if (u) await notifyUser(u, name, 'Booking confirmed', "You're all set.", { bookingId: p.bookingId }, 'driver');
      break;
    }
    case 'booking_declined': {
      if (!hasStringProp(p, 'driverId') || !hasStringProp(p, 'bookingId')) break;
      const u = await prisma.user.findUnique({ where: { id: p.driverId } });
      const b = await prisma.booking.findUnique({ where: { id: p.bookingId } });
      const reason = b?.declineReason
        ? `Reason: ${b.declineReason.replace(/_/g, ' ')}`
        : 'Try a different charger nearby.';
      if (u) await notifyUser(u, name, 'Booking declined', reason, { bookingId: p.bookingId }, 'driver');
      break;
    }
    case 'booking_auto_declined': {
      if (!hasStringProp(p, 'driverId') || !hasStringProp(p, 'bookingId')) break;
      const u = await prisma.user.findUnique({ where: { id: p.driverId } });
      if (u) {
        await notifyUser(
          u,
          name,
          'Booking expired',
          "The host didn't respond in time. Try a different charger nearby.",
          { bookingId: p.bookingId },
          'driver',
        );
      }
      break;
    }
    case 'new_chat_message': {
      if (
        !hasStringProp(p, 'userId') ||
        !hasStringProp(p, 'threadId') ||
        !hasStringProp(p, 'preview')
      )
        break;
      const u = await prisma.user.findUnique({ where: { id: p.userId } });
      // Resolve the booking so a tap can deep-link to the chat (routed by
      // bookingId), and determine which side the recipient is on so the tap
      // opens the correct interface for a dual-role user.
      const thread = await prisma.chatThread.findUnique({
        where: { id: p.threadId },
        select: { booking: { select: { id: true, driverId: true } } },
      });
      const role = thread && thread.booking.driverId === p.userId ? 'driver' : 'host';
      if (u)
        await notifyUser(u, name, 'New message', p.preview, {
          threadId: p.threadId,
          bookingId: thread?.booking.id,
        }, role);
      break;
    }
    case 'session_started':
    case 'session_stopped': {
      if (
        !hasStringProp(p, 'driverId') ||
        !hasStringProp(p, 'hostId') ||
        !hasStringProp(p, 'sessionId')
      )
        break;
      for (const uid of [p.driverId, p.hostId]) {
        const u = await prisma.user.findUnique({ where: { id: uid } });
        if (u) {
          await notifyUser(
            u,
            name,
            name === 'session_started' ? 'Session started' : 'Session ended',
            name === 'session_started' ? 'Charging has begun.' : 'Your charging session has ended.',
            { sessionId: p.sessionId },
            uid === p.driverId ? 'driver' : 'host',
          );
        }
      }
      break;
    }
    case 'review_left': {
      if (!hasStringProp(p, 'userId') || !hasStringProp(p, 'bookingId')) break;
      const u = await prisma.user.findUnique({ where: { id: p.userId } });
      // The reviewed user is either the driver or the host on the booking.
      const b = await prisma.booking.findUnique({
        where: { id: p.bookingId },
        select: { driverId: true },
      });
      const role = b && b.driverId === p.userId ? 'driver' : 'host';
      if (u) await notifyUser(u, name, 'New review', 'Someone left you a review.', { bookingId: p.bookingId }, role);
      break;
    }
    default:
      logger.debug({ name }, 'unhandled notification kind');
  }
}

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

async function pushUser(ref: UserRef, title: string, body: string, data: Record<string, string>) {
  if (!ref.expoPushToken) {
    logger.debug({ userId: ref.id }, 'no expo push token; skipping');
    return;
  }
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: ref.expoPushToken, title, body, data }),
    });
    if (!res.ok) logger.warn({ status: res.status }, 'expo push non-2xx');
  } catch (err) {
    logger.warn({ err }, 'expo push failed');
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
      if (!hasStringProp(p, 'hostId') || !hasStringProp(p, 'bookingId')) break;
      const u = await prisma.user.findUnique({ where: { id: p.hostId } });
      if (u) await pushUser(u, 'New booking request', 'Tap to review.', { bookingId: p.bookingId });
      break;
    }
    case 'booking_accepted': {
      if (!hasStringProp(p, 'driverId') || !hasStringProp(p, 'bookingId')) break;
      const u = await prisma.user.findUnique({ where: { id: p.driverId } });
      if (u) await pushUser(u, 'Booking confirmed', "You're all set.", { bookingId: p.bookingId });
      break;
    }
    case 'booking_declined': {
      if (!hasStringProp(p, 'driverId') || !hasStringProp(p, 'bookingId')) break;
      const u = await prisma.user.findUnique({ where: { id: p.driverId } });
      if (u) await pushUser(u, 'Booking declined', '', { bookingId: p.bookingId });
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
      if (u) await pushUser(u, 'New message', p.preview, { threadId: p.threadId });
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
          await pushUser(u, name === 'session_started' ? 'Session started' : 'Session ended', '', {
            sessionId: p.sessionId,
          });
        }
      }
      break;
    }
    case 'review_left': {
      if (!hasStringProp(p, 'userId') || !hasStringProp(p, 'bookingId')) break;
      const u = await prisma.user.findUnique({ where: { id: p.userId } });
      if (u) await pushUser(u, 'New review', '', { bookingId: p.bookingId });
      break;
    }
    default:
      logger.debug({ name }, 'unhandled notification kind');
  }
}

import type { Job } from 'bullmq';
import { prisma } from '@edna/db';
import { logger } from '../logger.js';

type Payload =
  | { kind?: 'new_booking_request'; hostId: string; bookingId: string }
  | { kind?: 'booking_accepted'; driverId: string; bookingId: string }
  | { kind?: 'booking_declined'; driverId: string; bookingId: string }
  | { kind?: 'booking_auto_declined'; driverId: string; hostId: string; bookingId: string }
  | { kind?: 'new_chat_message'; userId: string; threadId: string; preview: string }
  | { kind?: 'session_started' | 'session_stopped'; driverId: string; hostId: string; sessionId: string }
  | { kind?: 'review_left'; userId: string; bookingId: string };

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

export async function notify(job: Job<Payload>) {
  const name = (job.name ?? '') as NonNullable<Payload['kind']>;
  const p = job.data as any;
  switch (name) {
    case 'new_booking_request': {
      const u = await prisma.user.findUnique({ where: { id: p.hostId } });
      if (u) await pushUser(u, 'New booking request', 'Tap to review.', { bookingId: p.bookingId });
      break;
    }
    case 'booking_accepted': {
      const u = await prisma.user.findUnique({ where: { id: p.driverId } });
      if (u) await pushUser(u, 'Booking confirmed', "You're all set.", { bookingId: p.bookingId });
      break;
    }
    case 'booking_declined': {
      const u = await prisma.user.findUnique({ where: { id: p.driverId } });
      if (u) await pushUser(u, 'Booking declined', '', { bookingId: p.bookingId });
      break;
    }
    case 'new_chat_message': {
      const u = await prisma.user.findUnique({ where: { id: p.userId } });
      if (u) await pushUser(u, 'New message', p.preview, { threadId: p.threadId });
      break;
    }
    case 'session_started':
    case 'session_stopped': {
      for (const uid of [p.driverId, p.hostId]) {
        const u = await prisma.user.findUnique({ where: { id: uid } });
        if (u) {
          await pushUser(
            u,
            name === 'session_started' ? 'Session started' : 'Session ended',
            '',
            { sessionId: p.sessionId },
          );
        }
      }
      break;
    }
    case 'review_left': {
      const u = await prisma.user.findUnique({ where: { id: p.userId } });
      if (u) await pushUser(u, 'New review', '', { bookingId: p.bookingId });
      break;
    }
    default:
      logger.debug({ name }, 'unhandled notification kind');
  }
}

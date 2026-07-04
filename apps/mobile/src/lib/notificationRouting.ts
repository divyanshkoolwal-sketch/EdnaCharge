/** @file apps/mobile/src/lib/notificationRouting.ts. */
export type NotificationRole = 'driver' | 'host';

export type NotificationRoute = string | { pathname: string; params?: Record<string, string> };

export type NotificationRouteData = {
  kind?: unknown;
  recipientRole?: unknown;
  bookingId?: unknown;
  threadId?: unknown;
  sessionId?: unknown;
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function role(value: unknown, fallback: NotificationRole): NotificationRole {
  return value === 'host' || value === 'driver' ? value : fallback;
}

export function notificationRouteFromData(
  data: NotificationRouteData,
  fallbackRole: NotificationRole = 'driver',
): NotificationRoute | null {
  const kind = str(data.kind);
  const bookingId = str(data.bookingId);
  const sessionId = str(data.sessionId);
  const side = role(data.recipientRole, fallbackRole);

  switch (kind) {
    case 'new_booking_request':
      return bookingId ? { pathname: '/(host)/request/[id]', params: { id: bookingId } } : null;
    case 'booking_accepted':
    case 'booking_declined':
    case 'booking_auto_declined':
    case 'booking_errored':
    case 'booking_cancelled':
      if (side === 'host') {
        return bookingId ? { pathname: '/(host)/request/[id]', params: { id: bookingId } } : null;
      }
      return bookingId ? { pathname: '/(driver)/booking/[id]', params: { id: bookingId } } : null;
    case 'new_chat_message':
      if (!bookingId) return null;
      return {
        pathname: side === 'host' ? '/(host)/chat/[bookingId]' : '/(driver)/chat/[bookingId]',
        params: { bookingId },
      };
    case 'session_started':
    case 'session_stopped':
      if (side === 'driver' && sessionId) {
        return { pathname: '/(driver)/session/[id]', params: { id: sessionId } };
      }
      return side === 'host' ? '/(host)/home' : null;
    case 'review_left':
      if (!bookingId) return null;
      return side === 'host'
        ? { pathname: '/(host)/review/[bookingId]', params: { bookingId } }
        : { pathname: '/(driver)/receipt/[id]', params: { id: bookingId } };
  }

  if (bookingId && str(data.threadId)) {
    return {
      pathname: side === 'host' ? '/(host)/chat/[bookingId]' : '/(driver)/chat/[bookingId]',
      params: { bookingId },
    };
  }
  if (sessionId) {
    return side === 'host'
      ? '/(host)/home'
      : { pathname: '/(driver)/session/[id]', params: { id: sessionId } };
  }
  if (bookingId) {
    return side === 'host'
      ? { pathname: '/(host)/request/[id]', params: { id: bookingId } }
      : { pathname: '/(driver)/booking/[id]', params: { id: bookingId } };
  }
  return null;
}

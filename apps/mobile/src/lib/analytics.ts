import PostHog from 'posthog-react-native';

let _client: PostHog | null = null;

export function initAnalytics(): void {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) {
    return;
  }
  _client = new PostHog(key, {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  });
}

export type EventName =
  | 'auth.signup.completed'
  | 'driver.profile.completed'
  | 'driver.payment.added'
  | 'host.onboarding.started'
  | 'host.charger_identification.submitted'
  | 'host.onboarding.completed'
  | 'charger.listed'
  | 'map.charger.viewed'
  | 'booking.requested'
  | 'booking.accepted'
  | 'booking.declined'
  | 'booking.auto_declined'
  | 'chat.message_sent'
  | 'session.started'
  | 'session.stopped'
  | 'review.submitted';

// PostHog's PostHogEventProperties type is internal and tightly typed
// (JsonType-only); coerce at the boundary. Values we pass in are JSON-safe
// in practice — strings/numbers/booleans/objects.
type PostHogProps = Parameters<PostHog['capture']>[1];

export function track(event: EventName, props: Record<string, unknown> = {}): void {
  _client?.capture(event, props as unknown as PostHogProps);
}

export function identify(
  userId: string,
  props: { role: 'driver' | 'host' } & Record<string, unknown>,
): void {
  _client?.identify(userId, props as unknown as PostHogProps);
}

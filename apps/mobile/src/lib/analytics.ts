import PostHog from 'posthog-react-native';

let _client: PostHog | null = null;

export function initAnalytics(): void {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) {
    console.warn('EXPO_PUBLIC_POSTHOG_KEY not set — analytics disabled');
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

export function track(event: EventName, props: Record<string, unknown> = {}): void {
  _client?.capture(event, props);
}

export function identify(userId: string, props: { role: 'driver' | 'host' } & Record<string, unknown>): void {
  _client?.identify(userId, props);
}

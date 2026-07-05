/** @file apps/mobile/src/lib/analytics.ts. */
import PostHog from 'posthog-react-native';

let _client: PostHog | null = null;

export type AnalyticsEvent =
  | 'sign_in_completed'
  | 'charger_published'
  | 'booking_requested'
  | 'booking_responded'
  | 'session_start_requested'
  | 'session_stop_requested'
  | 'payment_method_added'
  | 'host_onboarding_completed';

type AnalyticsUser = { id: string; email?: string; name?: string | null };
type AnalyticsValue = string | number | boolean | null;
type AnalyticsProps = Record<string, AnalyticsValue | undefined>;

function withoutUndefined(props: AnalyticsProps): Record<string, AnalyticsValue> {
  return Object.fromEntries(
    Object.entries(props).filter((entry): entry is [string, AnalyticsValue] => entry[1] !== undefined),
  );
}

export function initAnalytics(): void {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) {
    return;
  }
  _client = new PostHog(key, {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  });
}

export function identifyAnalytics(user: AnalyticsUser): void {
  try {
    _client?.identify(user.id, withoutUndefined({
      email: user.email,
      name: user.name,
    }));
  } catch {
    // Analytics must never affect app behavior.
  }
}

export function resetAnalytics(): void {
  try {
    _client?.reset();
  } catch {
    // Analytics must never affect app behavior.
  }
}

export function captureScreen(pathname: string): void {
  try {
    _client?.capture('$screen', { $screen_name: pathname });
  } catch {
    // Analytics must never affect app behavior.
  }
}

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  try {
    _client?.capture(event, withoutUndefined(props));
  } catch {
    // Analytics must never affect app behavior.
  }
}

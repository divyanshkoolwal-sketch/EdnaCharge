/** @file apps/api/src/lib/analytics.ts — server-side product analytics (PostHog). */
import { PostHog } from 'posthog-node';
import { flags } from '@edna/config';
import { logger } from '../logger.js';

// Backend product analytics. Complements the mobile PostHog client with
// server-authoritative events (a booking really was created, a session really
// settled) that the client can't be trusted to report. Gated by the
// BACKEND_ANALYTICS flag and POSTHOG_KEY; capture never throws into a request.

let client: PostHog | null = null;

export type ServerAnalyticsEvent =
  | 'booking_requested'
  | 'booking_responded'
  | 'session_settled'
  | 'host_onboarding_completed';

type Props = Record<string, string | number | boolean>;

export function initServerAnalytics(): void {
  const key = process.env.POSTHOG_KEY;
  if (!key || !flags.BACKEND_ANALYTICS) {
    logger.info('server analytics disabled (no POSTHOG_KEY or BACKEND_ANALYTICS off)');
    return;
  }
  client = new PostHog(key, {
    host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
    flushAt: 20,
    flushInterval: 10_000,
  });
  logger.info('server analytics (posthog) initialized');
}

/** Record a server-side event. Best-effort — analytics must never break a request. */
export function capture(distinctId: string, event: ServerAnalyticsEvent, props: Props = {}): void {
  try {
    client?.capture({ distinctId, event, properties: props });
  } catch {
    // Swallow — analytics is never on the critical path.
  }
}

export async function shutdownServerAnalytics(): Promise<void> {
  try {
    await client?.shutdown();
  } catch {
    // Best-effort flush on shutdown.
  }
}

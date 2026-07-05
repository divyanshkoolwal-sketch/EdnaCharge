/** Shared Sentry setup and PII scrubber for Node services. */
import * as Sentry from '@sentry/node';
import { createServiceLogger } from './logger.js';

type SentryLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type InitNodeSentryOptions = {
  dsn: string | undefined;
  dsnEnvName: string;
  service: string;
  logger: SentryLogger;
};

const PII_PATTERNS: { re: RegExp; replacement: string }[] = [
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: '<redacted-email>' },
  { re: /\+?\d[\d ()-]{8,}/g, replacement: '<redacted-phone>' },
  { re: /Bearer\s+[A-Za-z0-9._-]+/g, replacement: 'Bearer <redacted>' },
  { re: /sk_(test|live)_[A-Za-z0-9]+/g, replacement: '<redacted-stripe-key>' },
];

export function scrubSentryValue(value: unknown): unknown {
  if (typeof value === 'string') {
    let out = value;
    for (const { re, replacement } of PII_PATTERNS) out = out.replace(re, replacement);
    return out;
  }
  if (Array.isArray(value)) return value.map(scrubSentryValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/email|phone|token|password|secret/i.test(key)) {
        out[key] = '<redacted>';
        continue;
      }
      out[key] = scrubSentryValue(nested);
    }
    return out;
  }
  return value;
}

export function initNodeSentry({
  dsn,
  dsnEnvName,
  service,
  logger,
}: InitNodeSentryOptions): void {
  if (!dsn) {
    // In production a missing DSN means the service runs with NO error tracking —
    // surface that at error level so it trips log-based alerting instead of
    // hiding among warnings. In dev it's expected, so a warn is enough.
    const msg = `${dsnEnvName} not set - Sentry disabled for ${service}`;
    if (process.env.NODE_ENV === 'production') logger.error(msg);
    else logger.warn(msg);
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.message) breadcrumb.message = scrubSentryValue(breadcrumb.message) as string;
      if (breadcrumb.data) breadcrumb.data = scrubSentryValue(breadcrumb.data) as Record<string, unknown>;
      return breadcrumb;
    },
    beforeSend(event) {
      if (event.message) event.message = scrubSentryValue(event.message) as string;
      if (event.extra) event.extra = scrubSentryValue(event.extra) as Record<string, unknown>;
      if (event.request?.headers) {
        event.request.headers = scrubSentryValue(event.request.headers) as Record<string, string>;
      }
      // Scrub the thrown error's own message — captureException(new Error(`... ${email}`))
      // is the most common PII leak, and it lands in exception.values[].value, not
      // event.message.
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) ex.value = scrubSentryValue(ex.value) as string;
        }
      }
      return event;
    },
  });
  logger.info(`Sentry initialized for ${service}`);
}

export function initServiceSentry(
  service: string,
  dsnEnvName: string,
  logger: SentryLogger = createServiceLogger(service),
): void {
  initNodeSentry({
    dsn: process.env[dsnEnvName],
    dsnEnvName,
    service,
    logger,
  });
}

export { Sentry };

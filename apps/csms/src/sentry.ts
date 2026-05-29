import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

// PII scrubber — see apps/api/src/sentry.ts for the full doc.
const PII_PATTERNS: { re: RegExp; replacement: string }[] = [
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: '<redacted-email>' },
  { re: /\+?\d[\d ()-]{8,}/g, replacement: '<redacted-phone>' },
  { re: /Bearer\s+[A-Za-z0-9._-]+/g, replacement: 'Bearer <redacted>' },
];
function scrub(value: unknown): unknown {
  if (typeof value === 'string') {
    let out = value;
    for (const { re, replacement } of PII_PATTERNS) out = out.replace(re, replacement);
    return out;
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/email|phone|token|password|secret|firebaseUid/i.test(k)) {
        out[k] = '<redacted>';
        continue;
      }
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN_CSMS;
  if (!dsn) {
    logger.warn('SENTRY_DSN_CSMS not set — Sentry disabled for csms');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeBreadcrumb(b) {
      if (b.message) b.message = scrub(b.message) as string;
      if (b.data) b.data = scrub(b.data) as Record<string, unknown>;
      return b;
    },
    beforeSend(event) {
      if (event.message) event.message = scrub(event.message) as string;
      if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
      return event;
    },
  });
  logger.info('Sentry initialized for csms');
}

export { Sentry };

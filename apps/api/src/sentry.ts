import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

// Scrub PII before any event leaves the box. Email + phone are linked
// identifiers under our privacy manifest; we don't ship them to Sentry.
// Firebase UIDs aren't PII per se but pair with our internal user IDs to
// re-identify, so we redact them in breadcrumb messages too.
const PII_PATTERNS: { re: RegExp; replacement: string }[] = [
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: '<redacted-email>' },
  { re: /\+?\d[\d ()-]{8,}/g, replacement: '<redacted-phone>' },
  { re: /Bearer\s+[A-Za-z0-9._-]+/g, replacement: 'Bearer <redacted>' },
  { re: /sk_(test|live)_[A-Za-z0-9]+/g, replacement: '<redacted-stripe-key>' },
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
      // Drop sensitive keys outright.
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
  const dsn = process.env.SENTRY_DSN_API;
  if (!dsn) {
    logger.warn('SENTRY_DSN_API not set — Sentry disabled for api');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.message) {
        breadcrumb.message = scrub(breadcrumb.message) as string;
      }
      if (breadcrumb.data) breadcrumb.data = scrub(breadcrumb.data) as Record<string, unknown>;
      return breadcrumb;
    },
    beforeSend(event) {
      if (event.message) event.message = scrub(event.message) as string;
      if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
      if (event.request?.headers) {
        event.request.headers = scrub(event.request.headers) as Record<string, string>;
      }
      return event;
    },
  });
  logger.info('Sentry initialized for api');
}

export { Sentry };

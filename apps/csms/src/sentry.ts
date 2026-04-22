import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN_CSMS;
  if (!dsn) {
    logger.warn('SENTRY_DSN_CSMS not set — Sentry disabled for csms');
    return;
  }
  Sentry.init({ dsn, environment: process.env.NODE_ENV ?? 'development', tracesSampleRate: 0.1 });
  logger.info('Sentry initialized for csms');
}

export { Sentry };

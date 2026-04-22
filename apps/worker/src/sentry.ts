import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN_WORKER;
  if (!dsn) {
    logger.warn('SENTRY_DSN_WORKER not set — Sentry disabled for worker');
    return;
  }
  Sentry.init({ dsn, environment: process.env.NODE_ENV ?? 'development', tracesSampleRate: 0.1 });
  logger.info('Sentry initialized for worker');
}

export { Sentry };

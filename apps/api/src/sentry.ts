import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

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
  });
  logger.info('Sentry initialized for api');
}

export { Sentry };

import * as Sentry from '@sentry/react-native';

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    console.warn('EXPO_PUBLIC_SENTRY_DSN not set — Sentry disabled for mobile');
    return;
  }
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    enableNativeFramesTracking: true,
  });
}

export { Sentry };

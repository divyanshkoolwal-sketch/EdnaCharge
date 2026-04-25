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
    // enableNativeFramesTracking was removed from Sentry React Native ≥5.21;
    // native-frame tracking is now on by default. No flag needed.
  });
}

export { Sentry };

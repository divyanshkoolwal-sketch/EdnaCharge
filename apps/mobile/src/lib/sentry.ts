// Sentry React Native is temporarily stubbed out — Sentry-Cocoa 8.x has a
// known Xcode-26 / libc++ incompatibility (see Podfile note). Until we
// upgrade @sentry/react-native to a fix-bearing version, this module exposes
// a no-op API so the rest of the app keeps compiling unchanged. Backend
// services (api / csms / worker) still get full Sentry coverage server-side.

export function initSentry(): void {
  // intentionally empty
}

type Captureable = unknown;

export const Sentry = {
  captureException(_err: Captureable): void {},
  captureMessage(_msg: string): void {},
  flush(_timeoutMs?: number): Promise<boolean> {
    return Promise.resolve(true);
  },
};

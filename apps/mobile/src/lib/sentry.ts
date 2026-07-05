/** @file apps/mobile/src/lib/sentry.ts. */
// JS-level crash/error reporting to Sentry.
//
// Captures: uncaught JS exceptions (ErrorUtils global handler), React render/
// effect errors (via our app-wide <ErrorBoundary>, which calls captureException),
// and any explicit captureException/captureMessage calls. Events ship to
// Sentry's ingest API over HTTPS.
//
// JS-level rather than the native Sentry SDK: this reporter needs no native
// module, ships in the current binary, and covers the dominant crash class for
// this app: uncaught JS errors. True native-signal crashes (Obj-C/Swift/C++)
// require the native SDK later.
//
// The public API (initSentry / Sentry.captureException / captureMessage / flush)
// matches the native SDK-facing wrapper, so call sites stay stable.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const IS_DEV = typeof __DEV__ === 'undefined' ? process.env.NODE_ENV !== 'production' : __DEV__;
// Report from release builds (TestFlight / App Store). Off in local dev unless
// EXPO_PUBLIC_SENTRY_DEV=1, so dev noise doesn't pollute the project.
const DEV_OVERRIDE = process.env.EXPO_PUBLIC_SENTRY_DEV === '1';
const ENABLED = DSN.length > 0 && (!IS_DEV || DEV_OVERRIDE);

type Dsn = { host: string; projectId: string; publicKey: string };
type SentryUser = { id: string; email?: string | null; username?: string | null };
type Breadcrumb = {
  timestamp: number;
  category?: string;
  message?: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
};

export function parseDsn(dsn: string): Dsn | null {
  // https://<publicKey>@<host>/<projectId>
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
  if (!m) return null;
  return { publicKey: m[1]!, host: m[2]!, projectId: m[3]! };
}

const SENSITIVE = /(password|passwd|pwd|secret|token|authorization|api[_-]?key)/i;

// Value-level redaction. Key-based scrubbing misses sensitive data that lands
// inside a free-text string — an error message or a stack frame can carry an
// email, a JWT / access token, or a `Bearer <token>` header. Redact those
// patterns from any string we ship.
const VALUE_PATTERNS: Array<[RegExp, string]> = [
  // JWT / access token (three base64url segments).
  [/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[jwt-scrubbed]'],
  // Authorization: Bearer <token>
  [/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [scrubbed]'],
  // Email addresses.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email-scrubbed]'],
];
function scrubText(s: string): string {
  return VALUE_PATTERNS.reduce((acc, [re, repl]) => acc.replace(re, repl), s);
}

function scrub(obj: unknown, depth = 0): void {
  if (depth > 6 || obj == null || typeof obj !== 'object') return;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const rec = obj as Record<string, unknown>;
    if (SENSITIVE.test(key)) rec[key] = '[scrubbed]';
    else if (rec[key] && typeof rec[key] === 'object') scrub(rec[key], depth + 1);
    else if (typeof rec[key] === 'string') rec[key] = scrubText(rec[key] as string);
  }
}

let currentUser: SentryUser | null = null;
const breadcrumbs: Breadcrumb[] = [];
const MAX_BREADCRUMBS = 30;

function snapshot<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function eventId(): string {
  let s = '';
  for (let i = 0; i < 32; i += 1) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/** Build a Sentry event payload from an error or message. Exported for tests. */
export function buildEvent(
  input: unknown,
  level: 'error' | 'info' = 'error',
): Record<string, unknown> {
  const event: Record<string, unknown> = {
    event_id: eventId(),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level,
    environment: IS_DEV ? 'development' : 'production',
    release: process.env.EXPO_PUBLIC_APP_VERSION ?? undefined,
  };
  if (currentUser) event.user = snapshot(currentUser);
  if (breadcrumbs.length > 0) event.breadcrumbs = snapshot(breadcrumbs);
  if (input instanceof Error) {
    event.exception = { values: [{ type: input.name || 'Error', value: input.message }] };
    if (input.stack) event.extra = { stack: input.stack };
  } else if (typeof input === 'string') {
    event.message = input;
  } else {
    event.message = safeStringify(input);
  }
  scrub(event);
  return event;
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const dsnParts = parseDsn(DSN);

/** Fire-and-forget POST to Sentry's envelope endpoint. Never throws. */
function send(event: Record<string, unknown>): Promise<void> {
  if (!ENABLED || !dsnParts) return Promise.resolve();
  const { host, projectId, publicKey } = dsnParts;
  // Envelope format — the legacy /store/ endpoint is deprecated and rejected by
  // newer Sentry orgs. Newline-delimited: envelope header, item header, payload.
  const envHeader = JSON.stringify({
    event_id: event.event_id,
    sent_at: new Date().toISOString(),
  });
  const itemHeader = JSON.stringify({ type: 'event' });
  const body = `${envHeader}\n${itemHeader}\n${JSON.stringify(event)}`;
  return fetch(`https://${host}/api/${projectId}/envelope/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=edna-mobile/1.0, sentry_key=${publicKey}`,
    },
    body,
  })
    .then(() => undefined)
    .catch(() => undefined); // fail-safe: reporting must never crash the app
}

let started = false;

export function initSentry(): void {
  if (started || !ENABLED) return;
  started = true;
  // Hook uncaught JS errors. ErrorUtils is React Native's global error handler;
  // we report, then delegate to the previous handler (red box in dev / default
  // fatal handling in release) so behavior is unchanged.
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
    };
  };
  const eu = g.ErrorUtils;
  if (eu?.getGlobalHandler && eu.setGlobalHandler) {
    const prev = eu.getGlobalHandler();
    eu.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      void send(buildEvent(error, 'error'));
      prev?.(error, isFatal);
    });
  }
}

export const Sentry = {
  setUser(user: SentryUser | null): void {
    currentUser = user;
  },
  addBreadcrumb(crumb: Omit<Breadcrumb, 'timestamp'>): void {
    const next: Breadcrumb = { timestamp: Date.now() / 1000, ...crumb };
    scrub(next);
    breadcrumbs.push(next);
    if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
  },
  captureException(err: unknown): void {
    void send(buildEvent(err, 'error'));
  },
  captureMessage(msg: string): void {
    void send(buildEvent(msg, 'info'));
  },
  flush(_timeoutMs = 2000): Promise<boolean> {
    // Events are sent fire-and-forget; nothing to drain.
    return Promise.resolve(true);
  },
};

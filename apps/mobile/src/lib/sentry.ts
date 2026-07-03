// JS-level crash/error reporting to Sentry.
//
// Captures: uncaught JS exceptions (ErrorUtils global handler), React render/
// effect errors (via our app-wide <ErrorBoundary>, which calls captureException),
// and any explicit captureException/captureMessage calls. Events ship to
// Sentry's ingest API over HTTPS.
//
// Why JS-level rather than the @sentry/react-native NATIVE SDK: that SDK's
// native module does not autolink on this Expo + pnpm + static-frameworks stack
// (RN autolinking reports it "NOT in autolink deps" — the same integration
// friction that forced the original stub). This reporter needs NO native module,
// ships in the current binary, and covers the dominant crash class for this app
// — uncaught JS errors (the Host→Driver crash was exactly this). True
// native-signal crashes (Obj-C/Swift/C++) are out of scope and would need the
// native SDK in a future EAS-verified effort.
//
// The public API (initSentry / Sentry.captureException / captureMessage / flush)
// is unchanged from the prior stub, so every call site keeps working.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
// Report from release builds (TestFlight / App Store). Off in local dev unless
// EXPO_PUBLIC_SENTRY_DEV=1, so dev noise doesn't pollute the project.
const DEV_OVERRIDE = process.env.EXPO_PUBLIC_SENTRY_DEV === '1';
const ENABLED = DSN.length > 0 && (!__DEV__ || DEV_OVERRIDE);

type Dsn = { host: string; projectId: string; publicKey: string };

export function parseDsn(dsn: string): Dsn | null {
  // https://<publicKey>@<host>/<projectId>
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
  if (!m) return null;
  return { publicKey: m[1]!, host: m[2]!, projectId: m[3]! };
}

const SENSITIVE = /(password|passwd|pwd|secret|token|authorization|api[_-]?key)/i;

// Value-level redaction. Key-based scrubbing misses sensitive data that lands
// inside a free-text string — an error message or a stack frame can carry an
// email, a JWT/Firebase ID token, or a `Bearer <token>` header. Redact those
// patterns from any string we ship.
const VALUE_PATTERNS: Array<[RegExp, string]> = [
  // JWT / Firebase ID token (three base64url segments).
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
    environment: __DEV__ ? 'development' : 'production',
    release: process.env.EXPO_PUBLIC_APP_VERSION ?? undefined,
  };
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

/** Fire-and-forget POST to Sentry's store endpoint. Never throws. */
function send(event: Record<string, unknown>): Promise<void> {
  if (!ENABLED || !dsnParts) return Promise.resolve();
  const { host, projectId, publicKey } = dsnParts;
  return fetch(`https://${host}/api/${projectId}/store/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=edna-mobile/1.0, sentry_key=${publicKey}`,
    },
    body: JSON.stringify(event),
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

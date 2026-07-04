/** @file apps/mobile/src/lib/logger.ts — structured, PII-scrubbing client logger. */
//
// Mobile counterpart to the server pino logger. Emits structured log entries and
// scrubs PII (emails, JWTs, Bearer tokens, and sensitive keys) from both the
// message and any context object before anything reaches the console or a future
// remote log sink. Use this instead of raw console.* so client logs never leak
// user data — mirrors the redaction the server logger and Sentry scrubber apply.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

const SENSITIVE_KEY = /(password|passwd|pwd|secret|token|authorization|api[_-]?key|email|phone)/i;
const VALUE_PATTERNS: Array<[RegExp, string]> = [
  // JWT / access token (three base64url segments).
  [/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[jwt-scrubbed]'],
  [/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [scrubbed]'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email-scrubbed]'],
];

function scrubText(s: string): string {
  return VALUE_PATTERNS.reduce((acc, [re, repl]) => acc.replace(re, repl), s);
}

function scrubContext(input: LogContext, depth = 0): LogContext {
  if (depth > 5) return {};
  const out: LogContext = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key)) out[key] = '[scrubbed]';
    else if (typeof value === 'string') out[key] = scrubText(value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = scrubContext(value as LogContext, depth + 1);
    } else out[key] = value;
  }
  return out;
}

const IS_DEV = typeof __DEV__ === 'undefined' ? process.env.NODE_ENV !== 'production' : __DEV__;

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: scrubText(message),
    ...(context ? { ctx: scrubContext(context) } : {}),
  };
  // Release builds emit a single structured line (drain-friendly); dev keeps the
  // object form so it's readable in Metro / Flipper.
  const line: unknown = IS_DEV ? entry : JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, context?: LogContext): void => {
    if (IS_DEV) emit('debug', message, context);
  },
  info: (message: string, context?: LogContext): void => emit('info', message, context),
  warn: (message: string, context?: LogContext): void => emit('warn', message, context),
  error: (message: string, context?: LogContext): void => emit('error', message, context),
};

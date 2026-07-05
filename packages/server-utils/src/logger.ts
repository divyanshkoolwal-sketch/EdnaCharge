/** Shared pino logger factory for Node services. */
import pino from 'pino';

// Best-effort redaction of PII/secrets that slip into logged objects (error
// payloads, request context). Complements the Sentry scrubber for stdout logs.
const REDACT_PATHS = [
  'email',
  'phone',
  'password',
  'token',
  'secret',
  'authorization',
  '*.email',
  '*.phone',
  '*.password',
  '*.token',
  '*.secret',
  '*.authorization',
  'req.headers.authorization',
  'headers.authorization',
  'user.email',
  'user.phone',
];

export function createServiceLogger(service: string) {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '<redacted>' },
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
    base: { service },
  });
}

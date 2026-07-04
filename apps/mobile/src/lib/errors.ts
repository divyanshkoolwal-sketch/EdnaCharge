/** @file apps/mobile/src/lib/errors.ts. */
// Single source of truth for surfacing tRPC / Supabase / generic errors to the
// user. Centralised so we never again show raw zod validation arrays or
// "UNAUTHORIZED" verbatim. Every screen should call `handleError(err, opts)`
// from a useMutation onError handler instead of `Alert.alert('Oops', e.message)`.

import { Alert } from 'react-native';
import { useAuth } from '../state/auth';
import { Sentry } from './sentry';

export type ErrorOptions = {
  /** Human label of the feature being attempted, e.g. "Payments", "Booking". */
  feature?: string;
  /** Optional custom title for the alert; defaults to "Something went wrong". */
  title?: string;
  /** If false, suppress the alert and just log. Useful when the caller wants
   *  to render an inline error instead. */
  silent?: boolean;
};

type AnyErr = Error & {
  data?: { code?: string; httpStatus?: number; zodError?: unknown };
  shape?: { data?: { code?: string } };
  message?: string;
};

const FRIENDLY: Record<string, string> = {
  UNAUTHORIZED: 'Your session expired. Please sign in again.',
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: 'That item was not found.',
  CONFLICT: 'This request was already resolved. Refresh and try again.',
  PRECONDITION_FAILED: 'A required step is missing.',
  TIMEOUT: 'The server took too long to respond. Try again.',
  TOO_MANY_REQUESTS: "You're going too fast. Wait a moment and retry.",
  INTERNAL_SERVER_ERROR: 'Something went wrong on our end. Try again shortly.',
  SERVICE_UNAVAILABLE: 'This feature is temporarily unavailable.',
  BAD_REQUEST: 'That request was invalid.',
};

const REPORT_FEATURE = /^(auth|booking|session|payment|payment methods|stripe)$/i;

function classify(err: unknown): { code: string | null; raw: AnyErr } {
  const e = err as AnyErr;
  const code =
    e?.data?.code ?? e?.shape?.data?.code ?? null;
  return { code, raw: e };
}

function parseZodMessage(message: string): string | null {
  // tRPC serializes zod failures as JSON-stringified arrays of issues. We
  // surface only the first issue's path + message so the user sees something
  // like "year: Required" rather than 30 lines of brackets.
  if (!message.startsWith('[')) return null;
  try {
    const issues = JSON.parse(message) as Array<{ path: (string | number)[]; message: string }>;
    const first = issues[0];
    if (!first) return null;
    const path = first.path.length ? first.path.join('.') : 'input';
    return `${path}: ${first.message}`;
  } catch {
    return null;
  }
}

export function handleError(err: unknown, opts: ErrorOptions = {}): void {
  const { code, raw } = classify(err);
  const rawMessage = raw?.message ?? '';
  if (opts.feature && REPORT_FEATURE.test(opts.feature)) {
    Sentry.addBreadcrumb({
      category: 'app.failure',
      message: opts.feature,
      level: 'error',
      data: { code },
    });
    Sentry.captureException(err);
  }

  // 1. Auth failure — sign the user out so the auth listener routes back to
  //    Welcome. The tRPC fetch wrapper has already tried a refresh; if we got
  //    here the refresh also failed.
  if (code === 'UNAUTHORIZED' || /UNAUTHORIZED/i.test(rawMessage)) {
    void useAuth.getState().signOut().catch(() => {
      useAuth.getState().setSession(null);
    });
    if (!opts.silent) {
      Alert.alert('Signed out', 'Your session expired. Please sign in again.');
    }
    return;
  }

  if (opts.silent) {
    console.warn('[handleError]', { code, message: rawMessage, opts });
    return;
  }

  // 1b. Network / offline failure — a bare fetch rejection ("Network request
  //     failed" / "Failed to fetch") is not user-friendly. Show a clear message.
  if (!code && /network request failed|failed to fetch|network error/i.test(rawMessage)) {
    Alert.alert(opts.title ?? "You're offline", 'Check your connection and try again.');
    return;
  }

  // 2. Server-side validation (zod) — extract the first useful field.
  const zod = parseZodMessage(rawMessage);
  if (zod) {
    Alert.alert(opts.title ?? "Check your input", zod);
    return;
  }

  // 3. Stripe-style 503 — show a feature-specific friendly message.
  if (code === 'SERVICE_UNAVAILABLE') {
    Alert.alert(
      opts.title ?? `${opts.feature ?? 'This feature'} unavailable`,
      rawMessage || 'Try again in a moment.',
    );
    return;
  }

  // 4. Known tRPC code — friendly text. Only surface the server's own message
  //    when it isn't a stack/internal dump (guards e.g. INTERNAL_SERVER_ERROR).
  if (code && FRIENDLY[code]) {
    const body = rawMessage && !looksLikeServerStack(rawMessage) ? rawMessage : FRIENDLY[code]!;
    Alert.alert(opts.title ?? FRIENDLY[code]!, body);
    return;
  }

  // 5. Default — show a clean friendly message. NEVER spill the raw server
  //    message: dev-mode Prisma / TRPC errors include stack traces, file
  //    paths, and SQL — none of which the user should see. Log the full
  //    detail to the console for debugging instead.
  console.warn('[handleError uncategorised]', { code, message: rawMessage, raw });
  Alert.alert(
    opts.title ?? 'Something went wrong',
    looksLikeServerStack(rawMessage)
      ? `${opts.feature ? `${opts.feature} ` : ''}is temporarily unavailable. Try again in a moment.`
      : rawMessage || 'Please try again.',
  );
}

/** Detect Prisma / TRPC / Node stack traces so we don't surface them to users. */
function looksLikeServerStack(msg: string): boolean {
  if (!msg) return false;
  if (msg.length > 200) return true;
  return (
    msg.includes('Invalid `prisma.') ||
    msg.includes('node_modules') ||
    msg.includes('TRPCError:') ||
    msg.includes("Can't reach database server") ||
    /^\s*\d+\s+(const|let|var|→|→ )/m.test(msg)
  );
}

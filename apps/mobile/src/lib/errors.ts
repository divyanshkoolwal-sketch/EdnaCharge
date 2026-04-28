// Single source of truth for surfacing tRPC / Supabase / generic errors to the
// user. Centralised so we never again show raw zod validation arrays or
// "UNAUTHORIZED" verbatim. Every screen should call `handleError(err, opts)`
// from a useMutation onError handler instead of `Alert.alert('Oops', e.message)`.

import { Alert } from 'react-native';
import { supabase } from './supabase';

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

  // 1. Auth failure — sign the user out so the auth listener routes back to
  //    Welcome. The tRPC fetch wrapper has already tried a refresh; if we got
  //    here the refresh also failed.
  if (code === 'UNAUTHORIZED' || /UNAUTHORIZED/i.test(rawMessage)) {
    void supabase?.auth.signOut().catch(() => {});
    if (!opts.silent) {
      Alert.alert('Signed out', 'Your session expired. Please sign in again.');
    }
    return;
  }

  if (opts.silent) {
    console.warn('[handleError]', { code, message: rawMessage, opts });
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

  // 4. Known tRPC code — friendly text.
  if (code && FRIENDLY[code]) {
    Alert.alert(opts.title ?? FRIENDLY[code]!, rawMessage || FRIENDLY[code]!);
    return;
  }

  // 5. Default — generic with the raw message preserved (useful for support).
  Alert.alert(
    opts.title ?? 'Something went wrong',
    rawMessage || 'Please try again.',
  );
  console.warn('[handleError uncategorised]', { code, raw });
}

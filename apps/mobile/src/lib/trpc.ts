/** @file apps/mobile/src/lib/trpc.ts. */
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../api/src/router';
import { getAuthToken, refreshAuthToken } from '../state/auth';

export const trpc = createTRPCReact<AppRouter>();

/**
 * Fetch wrapper around the tRPC HTTP client that:
 *  1. Attaches the current Supabase access token as `Authorization: Bearer …`.
 *  2. On HTTP 401 OR a body containing `"code":"UNAUTHORIZED"`, force-refreshes
 *     the token via `refreshAuthToken()` and retries the request once.
 *  3. If refresh also fails, returns the original 401 — `handleError`
 *     catches it and signs the user out via the auth listener.
 *
 * Without this wrapper, Supabase access tokens (1h TTL) silently expire and
 * every subsequent tRPC call returns UNAUTHORIZED until the user manually signs
 * in again. With it, the next call after expiry transparently refreshes.
 */
async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = await getAuthToken().catch(() => null);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const first = await fetch(input, { ...(init ?? {}), headers });
  // Detect auth failure from STATUS (rare) or the server's cheap `x-trpc-unauthorized`
  // header (set via responseMeta) — with httpBatchLink a per-procedure UNAUTHORIZED
  // is an HTTP 200, so we can't rely on status alone. This replaces the previous
  // clone()+regex scan of EVERY successful response body.
  if (first.status !== 401 && first.headers.get('x-trpc-unauthorized') !== '1') return first;

  let fresh: string | null = null;
  try {
    fresh = await refreshAuthToken();
  } catch {
    fresh = null;
  }
  if (!fresh) return first;

  const retryHeaders = new Headers(init?.headers);
  retryHeaders.set('Authorization', `Bearer ${fresh}`);
  return fetch(input, { ...(init ?? {}), headers: retryHeaders });
}

export function trpcClientConfig() {
  // localhost is a DEV-only fallback. A production build with no
  // EXPO_PUBLIC_API_URL must fail loudly rather than silently target the device.
  const url = process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? 'http://localhost:3000' : undefined);
  if (!url) throw new Error('EXPO_PUBLIC_API_URL is not set — production builds must define it.');
  return {
    links: [
      httpBatchLink({
        url: `${url}/trpc`,
        // The fetch wrapper handles auth per actual HTTP call, including its
        // forced-refresh retry.
        fetch: authFetch as typeof fetch,
      }),
    ],
  };
}

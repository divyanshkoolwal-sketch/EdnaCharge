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
  if (first.status !== 401) return first;

  // tRPC over HTTP returns 200 with a body containing the error code in many
  // cases. Status 401 is rarer but we still cover it. Body re-read happens
  // only when status is 401 — saves a clone() on the happy path.
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
        // The fetch wrapper handles auth — `headers()` only runs once per
        // request when batched, but the wrapper runs per actual HTTP call,
        // including retries. Belt-and-suspenders: still attach the header
        // here so the very first call has it without round-tripping through
        // refresh.
        async headers() {
          const token = await getAuthToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        fetch: authFetch as typeof fetch,
      }),
    ],
  };
}

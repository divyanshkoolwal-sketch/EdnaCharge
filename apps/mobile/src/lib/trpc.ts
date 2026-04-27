import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../api/src/router';
import { supabase } from './supabase';

export const trpc = createTRPCReact<AppRouter>();

// Wrap fetch so a stale Supabase access token (HTTP 401 / tRPC UNAUTHORIZED) is
// transparently recovered: refresh the session once, swap the bearer, and
// retry. If the refresh itself fails we sign the user out — the auth listener
// in app/_layout.tsx will route them back to /(auth)/welcome instead of
// surfacing a raw "UNAUTHORIZED" alert. This was the root cause of the demo's
// host-onboarding hang after ~1 h idle.
async function trpcFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  const buildHeaders = async (): Promise<Headers> => {
    const headers = new Headers(init?.headers);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  };

  const first = await fetch(input, { ...init, headers: await buildHeaders() });
  if (first.status !== 401) return first;

  // Either the token is stale (refresh works) or the user has been revoked
  // (refresh fails). Try once.
  const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
  if (refreshErr || !refreshed.session) {
    await supabase.auth.signOut().catch(() => {});
    return first;
  }

  return fetch(input, { ...init, headers: await buildHeaders() });
}

export function trpcClientConfig() {
  const url = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
  return {
    links: [
      httpBatchLink({
        url: `${url}/trpc`,
        fetch: trpcFetch,
      }),
    ],
  };
}

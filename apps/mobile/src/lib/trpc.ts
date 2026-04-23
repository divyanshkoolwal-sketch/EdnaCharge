import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../api/src/router';
import { supabase } from './supabase';

export const trpc = createTRPCReact<AppRouter>();

export function trpcClientConfig() {
  const url = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
  return {
    links: [
      httpBatchLink({
        url: `${url}/trpc`,
        async headers() {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  };
}

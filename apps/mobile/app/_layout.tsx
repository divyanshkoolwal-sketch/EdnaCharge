import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { trpc, trpcClientConfig } from '../src/lib/trpc';
import { initSentry } from '../src/lib/sentry';
import { initAnalytics } from '../src/lib/analytics';
import { registerPushToken } from '../src/lib/push';
import { bootstrapAuthListener } from '../src/state/auth';
import { useRole } from '../src/state/role';
import { supabase } from '../src/lib/supabase';

initSentry();
initAnalytics();

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => trpc.createClient(trpcClientConfig()));
  const hydrateRole = useRole((s) => s.hydrate);

  useEffect(() => {
    bootstrapAuthListener();
    void hydrateRole();
    void registerPushToken();

    // Proactively refresh the Supabase session whenever the app foregrounds.
    // The supabase-js auto-refresh timer can miss its window after long
    // backgrounding on iOS, so without this every protected tRPC call would
    // come back UNAUTHORIZED. Cheap (one HTTP call) and avoids the alert loop.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void supabase.auth.refreshSession();
      }
    });
    return () => sub.remove();
  }, [hydrateRole]);

  const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  return (
    <SafeAreaProvider>
      <StripeProvider publishableKey={stripeKey} merchantIdentifier="merchant.com.ednacharge">
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <Stack screenOptions={{ headerShown: false }} />
          </QueryClientProvider>
        </trpc.Provider>
      </StripeProvider>
    </SafeAreaProvider>
  );
}

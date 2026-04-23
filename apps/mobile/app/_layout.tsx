import '../global.css';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { trpc, trpcClientConfig } from '../src/lib/trpc';
import { initSentry } from '../src/lib/sentry';
import { initAnalytics } from '../src/lib/analytics';
import { registerPushToken } from '../src/lib/push';
import { bootstrapAuthListener } from '../src/state/auth';
import { useRole } from '../src/state/role';

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
  }, [hydrateRole]);

  const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  return (
    <StripeProvider publishableKey={stripeKey} merchantIdentifier="merchant.com.ednacharge">
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      </trpc.Provider>
    </StripeProvider>
  );
}

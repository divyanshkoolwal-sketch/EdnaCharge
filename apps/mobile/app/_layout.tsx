import { useEffect, useState } from 'react';
import { LogBox } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { trpc, trpcClientConfig } from '../src/lib/trpc';
import { initSentry } from '../src/lib/sentry';
import { initAnalytics } from '../src/lib/analytics';
import { registerPushToken } from '../src/lib/push';
import { bootstrapAuthListener, useAuth } from '../src/state/auth';
import { useRole } from '../src/state/role';

initSentry();
initAnalytics();

LogBox.ignoreLogs([
  'This method is deprecated (as well as all React Native Firebase namespaced API)',
]);

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => trpc.createClient(trpcClientConfig()));
  const hydrateRole = useRole((s) => s.hydrate);
  const session = useAuth((s) => s.session);

  useEffect(() => {
    const unsubscribe = bootstrapAuthListener();
    void hydrateRole();
    return unsubscribe;
  }, [hydrateRole]);

  useEffect(() => {
    if (session) void registerPushToken();
  }, [session]);

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

import { useEffect, useRef, useState } from 'react';
import { AppState, LogBox } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { trpc, trpcClientConfig } from '../src/lib/trpc';
import { initSentry } from '../src/lib/sentry';
import { initAnalytics } from '../src/lib/analytics';
import { registerPushToken } from '../src/lib/push';
import { bootstrapAuthListener, refreshAuthToken, useAuth } from '../src/state/auth';
import { useRole } from '../src/state/role';

initSentry();
initAnalytics();

LogBox.ignoreLogs([
  'This method is deprecated (as well as all React Native Firebase namespaced API)',
]);

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Treat data as fresh for 30s so re-entering a screen reads cache
            // instead of refetching (no blank flash). Polling screens set their
            // own refetchInterval, and mutations still invalidate explicitly.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => trpc.createClient(trpcClientConfig()));
  const hydrateRole = useRole((s) => s.hydrate);
  const session = useAuth((s) => s.session);
  const router = useRouter();
  const prevSession = useRef<typeof session>(session);

  useEffect(() => {
    const unsubscribe = bootstrapAuthListener();
    void hydrateRole();
    return unsubscribe;
  }, [hydrateRole]);

  useEffect(() => {
    if (session) void registerPushToken();
    if (prevSession.current && !session) {
      router.replace('/(auth)/welcome');
    }
    prevSession.current = session;
  }, [session, router]);

  // Force-refresh the Firebase ID token whenever the app foregrounds. Without
  // this, an app that's been backgrounded for >1h returns from suspend with an
  // expired token and the very first tRPC call fails. Combined with the 401
  // retry in trpc.ts, this gives users a seamless reentry.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && useAuth.getState().session) {
        void refreshAuthToken().catch(() => null);
      }
    });
    return () => sub.remove();
  }, []);

  const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider publishableKey={stripeKey} merchantIdentifier="merchant.com.ednacharge">
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
              <Stack screenOptions={{ headerShown: false }} />
            </QueryClientProvider>
          </trpc.Provider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

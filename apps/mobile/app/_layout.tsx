/** @file apps/mobile/app/_layout.tsx. */
import { useEffect, useRef, useState } from 'react';
import { AppState, LogBox } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { trpc, trpcClientConfig } from '../src/lib/trpc';
import { initSentry, Sentry } from '../src/lib/sentry';
import {
  captureScreen,
  identifyAnalytics,
  initAnalytics,
  resetAnalytics,
} from '../src/lib/analytics';
import { registerPushToken, subscribeNotificationResponses } from '../src/lib/push';
import type { NotificationRoute } from '../src/lib/notificationRouting';
import { bootstrapAuthListener, refreshAuthToken, useAuth } from '../src/state/auth';
import { useRole } from '../src/state/role';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { ToastProvider } from '../src/components/ui';

initSentry();
initAnalytics();

// Keep the native splash up until the first auth state resolves, so the app
// never flashes a white/empty frame before deciding welcome vs. home.
void SplashScreen.preventAutoHideAsync();

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
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const pathname = usePathname();

  // Reveal the app only once Supabase has reported the initial auth state.
  useEffect(() => {
    if (!authLoading) void SplashScreen.hideAsync().catch(() => undefined);
  }, [authLoading]);
  const prevSession = useRef<typeof session>(session);

  useEffect(() => {
    const unsubscribe = bootstrapAuthListener();
    void hydrateRole();
    return unsubscribe;
  }, [hydrateRole]);

  useEffect(() => {
    if (session) {
      identifyAnalytics({
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      });
      Sentry.setUser({
        id: session.user.id,
        email: session.user.email,
        username: session.user.name,
      });
      void registerPushToken();
    }
    if (prevSession.current && !session) {
      // Signed out: wipe all cached query data so the next screen can never show
      // the previous user's data, then send them to welcome.
      resetAnalytics();
      Sentry.setUser(null);
      queryClient.clear();
      router.replace('/(auth)/welcome');
    }
    prevSession.current = session;
  }, [session, router, queryClient]);

  // Deep links from notification taps must wait until auth has resolved to a
  // signed-in session. On a cold start the tap can fire before Supabase reports
  // auth state and before index.tsx runs its role-based redirect; navigating
  // then races (and can discard) the link. Buffer it and flush once ready.
  const pendingDeepLink = useRef<NotificationRoute | null>(null);
  useEffect(() => {
    const handle = (href: NotificationRoute) => {
      const st = useAuth.getState();
      if (st.loading || !st.session) {
        pendingDeepLink.current = href;
        return;
      }
      router.push(href as never);
    };
    return subscribeNotificationResponses(handle);
  }, [router]);

  useEffect(() => {
    if (!authLoading && session && pendingDeepLink.current) {
      const href = pendingDeepLink.current;
      pendingDeepLink.current = null;
      router.push(href as never);
    }
  }, [authLoading, session, router]);

  useEffect(() => {
    captureScreen(pathname);
    Sentry.addBreadcrumb({ category: 'navigation', message: pathname });
  }, [pathname]);

  // Force-refresh the Supabase access token whenever the app foregrounds. Without
  // this, an app that's been backgrounded for >1h returns from suspend with an
  // expired token and the very first tRPC call fails. Combined with the 401
  // retry in trpc.ts, this gives users a seamless reentry.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && useAuth.getState().session) {
        Sentry.addBreadcrumb({ category: 'app.lifecycle', message: 'foreground' });
        void refreshAuthToken().catch(() => null);
      }
    });
    return () => sub.remove();
  }, []);

  // Only PRODUCTION requires a live Stripe key. Preview/dev builds run with an
  // empty key (payments disabled, same as dev) so internal/TestFlight testers
  // can't transact against the live Stripe account — set a Stripe TEST key in the
  // preview profile only once a test-backed staging API exists.
  const isProd = process.env.EXPO_PUBLIC_ENV === 'production';
  const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
  if (!stripeKey && isProd) {
    throw new Error('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set for this production build.');
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider publishableKey={stripeKey} merchantIdentifier="merchant.com.ednacharge">
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
              <ToastProvider>
                <ErrorBoundary>
                  {/* Top-level groups are switched via router.replace (never
                      pushed), so the edge swipe-back between them is always
                      wrong — disabling it stops a signed-out user from swiping
                      back into their old account, and stops swiping from the app
                      back into the auth flow. */}
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(auth)" options={{ gestureEnabled: false }} />
                    <Stack.Screen name="(driver)" options={{ gestureEnabled: false }} />
                    <Stack.Screen name="(host)" options={{ gestureEnabled: false }} />
                  </Stack>
                </ErrorBoundary>
                <OfflineBanner />
              </ToastProvider>
            </QueryClientProvider>
          </trpc.Provider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

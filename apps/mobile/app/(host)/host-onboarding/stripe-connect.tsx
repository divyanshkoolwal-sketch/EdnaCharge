import { useEffect, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { Screen, Body, Muted, Stepper } from '../../../src/components/ui';
import { ChevronLeft } from '../../../src/components/icons/Icon';
import { useTheme } from '../../../src/theme/useTheme';
import { trpc } from '../../../src/lib/trpc';
import { handleError } from '../../../src/lib/errors';

export default function StripeConnect() {
  const router = useRouter();
  const { c } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  const start = trpc.auth.startHostOnboarding.useMutation();
  const status = trpc.auth.hostOnboardingStatus.useQuery(undefined, {
    enabled: !!url,
    refetchInterval: 3000,
  });

  const utils = trpc.useUtils();
  // Advance to "done" exactly once, whether we get there via the Stripe redirect
  // (host finished the form) or the status poll (account fully enabled).
  const advanced = useRef(false);
  const finish = () => {
    if (advanced.current) return;
    advanced.current = true;
    utils.auth.getSession.invalidate();
    router.replace('/(host)/host-onboarding/done');
  };

  useEffect(() => {
    start.mutate(undefined, {
      onSuccess: (d) => {
        // Dev bypass: server already flipped the host role + onboarding flag.
        // Skip the WebView entirely and let the user proceed.
        if (d.devBypass) {
          finish();
          return;
        }
        setUrl(d.url);
      },
      onError: (e) => handleError(e, { feature: 'Stripe' }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status.data?.status === 'complete') finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data?.status]);

  if (!url) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Pressable onPress={() => router.back()} style={{ position: 'absolute', top: 60, left: 24 }}>
          <ChevronLeft />
        </Pressable>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 3,
            borderColor: c.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator color={c.ink} />
        </View>
        <Body style={{ fontWeight: '700', marginTop: 18 }}>Preparing payouts…</Body>
        <Muted style={{ fontSize: 12, marginTop: 6 }}>Stripe Connect</Muted>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.bg }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 10 }}>
          <Stepper count={3} current={2} label="STEP 3 OF 3" />
        </View>
      </SafeAreaView>
      <WebView
        source={{ uri: url }}
        style={{ flex: 1 }}
        onNavigationStateChange={(nav) => {
          // Stripe redirects to our return URL when the host finishes the payout
          // form — advance automatically (no manual "I'm done" tap needed). The
          // status poll above is the backup once the account is fully enabled.
          if (nav.url.includes('/stripe/onboarding/return')) {
            finish();
          } else if (nav.url.includes('/stripe/onboarding/refresh')) {
            // Link expired → fetch a fresh onboarding link.
            setUrl(null);
            start.mutate(undefined, {
              onSuccess: (d) => {
                if (!d.devBypass) setUrl(d.url);
              },
              onError: (e) => handleError(e, { feature: 'Stripe' }),
            });
          }
        }}
      />
    </View>
  );
}

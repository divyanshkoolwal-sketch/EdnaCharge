/** @file apps/mobile/app/(host)/host-onboarding/stripe-connect.tsx. */
import { useEffect, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { Screen, Body, Muted, Button, Card, CTABar, Stepper } from '../../../src/components/ui';
import { ChevronLeft } from '../../../src/components/icons/Icon';
import { useTheme } from '../../../src/theme/useTheme';
import { trpc } from '../../../src/lib/trpc';
import { handleError } from '../../../src/lib/errors';
import { track } from '../../../src/lib/analytics';

export default function StripeConnect() {
  const router = useRouter();
  const { c } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  const [returnedFromStripe, setReturnedFromStripe] = useState(false);
  const openedUrl = useRef<string | null>(null);
  const start = trpc.auth.startHostOnboarding.useMutation();
  const status = trpc.auth.hostOnboardingStatus.useQuery(undefined, {
    enabled: !!url,
    refetchInterval: 3000,
  });

  const utils = trpc.useUtils();
  // Advance to "done" exactly once, only after the status poll confirms the
  // account is actually charges_enabled && payouts_enabled. The Stripe return
  // URL means the form was submitted, not that payouts are enabled yet.
  const advanced = useRef(false);
  const finish = () => {
    if (advanced.current) return;
    advanced.current = true;
    track('host_onboarding_completed');
    utils.auth.getSession.invalidate();
    router.replace('/(host)/host-onboarding/done');
  };

  useEffect(() => {
    start.mutate(undefined, {
      onSuccess: (d) => {
        // Dev bypass: server already flipped the host role + onboarding flag.
        // Skip the hosted browser flow entirely and let the user proceed.
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

  useEffect(() => {
    if (!url || openedUrl.current === url) return;
    openedUrl.current = url;
    void WebBrowser.openBrowserAsync(url, {
      dismissButtonStyle: 'cancel',
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    })
      .catch(() => undefined)
      .finally(() => {
        setReturnedFromStripe(true);
        void status.refetch();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

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
        <Muted style={{ fontSize: 12, marginTop: 6 }}>
          {returnedFromStripe ? 'Checking payout status' : 'Stripe Connect'}
        </Muted>
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={{ paddingBottom: 130 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <View style={{ marginTop: 12 }}>
        <Stepper count={3} current={2} label="STEP 3 OF 3" />
      </View>
      <View style={{ marginTop: 60, alignItems: 'center' }}>
        <ActivityIndicator color={c.ink} size="large" />
        <Body style={{ fontWeight: '700', marginTop: 18 }}>Setting up payouts</Body>
        <Muted style={{ fontSize: 12, marginTop: 6, textAlign: 'center' }}>
          {returnedFromStripe
            ? 'Checking Stripe Connect status'
            : 'Stripe Connect should open in your browser.'}
        </Muted>
      </View>
      <Card padding={14} style={{ marginTop: 24 }}>
        <Body style={{ fontWeight: '700', fontSize: 14 }}>Browser closed?</Body>
        <Muted style={{ marginTop: 6, lineHeight: 18 }}>
          Finish the Stripe-hosted payout setup, then return here and check status. If the link
          expired, get a fresh one.
        </Muted>
        <View style={{ marginTop: 12, gap: 8 }}>
          <Button
            label="Reopen Stripe"
            variant="secondary"
            height={42}
            fontSize={13}
            onPress={() =>
              WebBrowser.openBrowserAsync(url, {
                dismissButtonStyle: 'cancel',
                presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
              }).catch(() => undefined)
            }
          />
          <Button
            label="Get fresh link"
            variant="secondary"
            height={42}
            fontSize={13}
            loading={start.isPending}
            onPress={() => {
              setUrl(null);
              openedUrl.current = null;
              start.mutate(undefined, {
                onSuccess: (d) => {
                  if (d.devBypass) finish();
                  else setUrl(d.url);
                },
                onError: (e) => handleError(e, { feature: 'Stripe' }),
              });
            }}
          />
        </View>
      </Card>
      <CTABar>
        <Button label="I'm done - check status" onPress={() => status.refetch()} />
      </CTABar>
    </Screen>
  );
}

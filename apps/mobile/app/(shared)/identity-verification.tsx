/**
 * Identity verification screen — Stripe Identity hosted flow.
 *
 * Used by both driver and host onboarding. Mirrors the WebView + 3s status
 * polling pattern from `(host)/host-onboarding/stripe-connect.tsx`.
 *
 * Behavior:
 *  - Tapping "Verify now" creates a Stripe verification session and opens it
 *    in a WebView. We poll `auth.identityVerificationStatus` until Stripe's
 *    webhook flips the row to `verified` / `requires_input`.
 *  - In dev-bypass mode (no real Stripe keys), the server marks the user
 *    verified instantly and we skip the WebView.
 *  - "Skip for now" routes the user forward without verifying. Booking and
 *    listing remain locked behind the unverified status.
 *
 * Query param `next` controls where to go after success/skip; defaults to map.
 */

import { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Button,
  Body,
  Muted,
  H1,
  Card,
  CTABar,
  Row,
} from '../../src/components/ui';
import { ChevronLeft, Check } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';
import { handleError } from '../../src/lib/errors';
import { SuccessCheckIllo } from '../../src/components/illustrations/HomeCharger';

type View_ = 'intro' | 'webview' | 'success' | 'requires_input';

export default function IdentityVerification() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const { c } = useTheme();
  const [view, setView] = useState<View_>('intro');
  const [url, setUrl] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const status = trpc.auth.identityVerificationStatus.useQuery(undefined, {
    refetchInterval: view === 'webview' ? 3000 : false,
  });

  const start = trpc.auth.startIdentityVerification.useMutation({
    onSuccess: async (d) => {
      utils.auth.getSession.invalidate();
      utils.auth.identityVerificationStatus.invalidate();
      if (d.alreadyVerified) {
        setView('success');
        return;
      }
      if (d.devBypass) {
        // Server already marked us verified — skip WebView.
        setView('success');
        return;
      }
      if (!d.url) return;

      // Open Stripe's hosted page in SFSafariViewController. Plain
      // react-native-webview doesn't work — Stripe's CSP blocks the page,
      // and iOS WebView camera permissions are unreliable. SFSafari has
      // full camera support and the same first-party cookies as Safari.
      setUrl(d.url);
      setView('webview');
      try {
        await WebBrowser.openBrowserAsync(d.url, {
          // Match-key with our brand color; lets the modal feel native.
          dismissButtonStyle: 'cancel',
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        });
        // Re-fetch status the moment the user dismisses the browser. The
        // webhook may already have flipped the row.
        utils.auth.identityVerificationStatus.invalidate();
      } catch {
        // User force-closed the browser — leave them on the polling screen.
      }
    },
    onError: (e) => handleError(e, { feature: 'ID verification' }),
  });

  // Watch for Stripe webhook to flip status while WebView is open.
  useEffect(() => {
    if (view !== 'webview') return;
    if (status.data?.status === 'verified') {
      utils.auth.getSession.invalidate();
      setView('success');
    } else if (status.data?.status === 'requires_input') {
      setView('requires_input');
    }
  }, [status.data?.status, view, utils]);

  // Whitelist of routes the verify screen is allowed to land on. Anything
  // else (e.g. a deeplink with a tampered `next` param) falls back to map.
  const ALLOWED_NEXT = new Set([
    '/(driver)/map',
    '/(driver)/profile',
    '/(host)/home',
    '/(host)/profile',
    '/(host)/host-onboarding/charger-identification',
  ]);

  const goNext = () => {
    const requested = params.next;
    const dest = requested && ALLOWED_NEXT.has(requested) ? requested : '/(driver)/map';
    router.replace(dest as never);
  };

  const goBack = () => {
    if (view === 'webview') {
      setView('intro');
      setUrl(null);
      return;
    }
    router.back();
  };

  // ─── INTRO ────────────────────────────────────────────────────────────────
  if (view === 'intro') {
    const alreadyVerified = status.data?.status === 'verified';
    return (
      <Screen scroll contentStyle={{ paddingBottom: 130 }}>
        <Pressable onPress={goBack} style={{ paddingTop: 8 }}>
          <ChevronLeft />
        </Pressable>
        <View style={{ marginTop: 26, alignItems: 'center' }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 24,
              backgroundColor: c.greenPill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check size={36} color={c.green2} />
          </View>
        </View>
        <H1 style={{ marginTop: 22, textAlign: 'center', fontSize: 26 }}>
          {alreadyVerified ? "You're verified" : 'Verify your identity'}
        </H1>
        <Muted style={{ marginTop: 10, textAlign: 'center', lineHeight: 20, paddingHorizontal: 18 }}>
          {alreadyVerified
            ? "Your ID is already on file. You're free to book or list chargers."
            : 'EdnaCharge uses Stripe to verify your government ID and a quick selfie. Takes about 30 seconds.'}
        </Muted>

        {!alreadyVerified ? (
          <View style={{ marginTop: 24, gap: 10 }}>
            <ChecklistRow text="Driver's license, ID card, or passport" />
            <ChecklistRow text="Quick selfie to match the photo" />
            <ChecklistRow text="Stripe handles the scan — your photos never touch our servers" />
          </View>
        ) : null}

        <Card padding={14} style={{ marginTop: 24 }}>
          <Body style={{ fontWeight: '700', fontSize: 14 }}>Why we ask</Body>
          <Muted style={{ marginTop: 6, lineHeight: 18 }}>
            Drivers must verify before booking; hosts must verify before listing a charger. You can skip this for now and verify later from your profile, but those actions stay locked until you do.
          </Muted>
        </Card>

        <CTABar>
          {alreadyVerified ? (
            <Button label="Continue" onPress={goNext} />
          ) : (
            <>
              <Button
                label="Verify now"
                onPress={() => start.mutate()}
                loading={start.isPending}
              />
              <Button
                label="Skip for now"
                variant="secondary"
                height={44}
                fontSize={14}
                onPress={goNext}
              />
            </>
          )}
        </CTABar>
      </Screen>
    );
  }

  // ─── WEBVIEW (Safari-handoff) ────────────────────────────────────────────
  // The Stripe-hosted page is in SFSafariViewController. While the user is
  // there, this screen shows a holding state with a "check status" button.
  // When they dismiss Safari, we auto-poll once via the WebBrowser callback;
  // they can also tap "I'm done — check status" to force a check.
  if (view === 'webview') {
    return (
      <Screen scroll contentStyle={{ paddingBottom: 130 }}>
        <Pressable onPress={goBack} style={{ paddingTop: 8 }}>
          <ChevronLeft />
        </Pressable>
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={c.ink} size="large" />
          <H1 style={{ marginTop: 22, fontSize: 22, textAlign: 'center' }}>
            Verifying your ID
          </H1>
          <Muted style={{ marginTop: 10, textAlign: 'center', maxWidth: 280, lineHeight: 20 }}>
            Stripe's hosted page should have opened in your browser. Complete the document scan and selfie there, then return to this screen.
          </Muted>
        </View>

        {url ? (
          <Card padding={14} style={{ marginTop: 24 }}>
            <Body style={{ fontWeight: '700', fontSize: 14 }}>Browser didn't open?</Body>
            <Muted style={{ marginTop: 6, lineHeight: 18 }}>
              Tap below to reopen the Stripe verification page.
            </Muted>
            <View style={{ marginTop: 12 }}>
              <Button
                label="Reopen verification"
                variant="secondary"
                height={42}
                fontSize={13}
                onPress={() =>
                  WebBrowser.openBrowserAsync(url, {
                    dismissButtonStyle: 'cancel',
                    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
                  }).catch(() => {})
                }
              />
            </View>
          </Card>
        ) : null}

        <CTABar>
          <Button
            label="I'm done — check status"
            onPress={() => status.refetch()}
          />
        </CTABar>
      </Screen>
    );
  }

  // ─── REQUIRES INPUT (failure) ─────────────────────────────────────────────
  if (view === 'requires_input') {
    return (
      <Screen scroll contentStyle={{ paddingBottom: 130 }}>
        <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
          <ChevronLeft />
        </Pressable>
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 24,
              backgroundColor: c.redPill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Body style={{ fontSize: 36, color: c.red, fontWeight: '800' }}>!</Body>
          </View>
        </View>
        <H1 style={{ marginTop: 20, textAlign: 'center', fontSize: 24 }}>
          Verification didn't pass
        </H1>
        <Muted style={{ marginTop: 10, textAlign: 'center', paddingHorizontal: 24, lineHeight: 20 }}>
          Stripe couldn't confirm your ID. Common reasons: blurry photo, glare on the document, or the selfie didn't match. Try again with better lighting.
        </Muted>
        {status.data?.failureReason ? (
          <Muted style={{ marginTop: 8, textAlign: 'center', fontSize: 11 }}>
            Reason: {status.data.failureReason.replace(/_/g, ' ')}
          </Muted>
        ) : null}
        <CTABar>
          <Button label="Try again" onPress={() => start.mutate()} loading={start.isPending} />
          <Button
            label="Skip for now"
            variant="secondary"
            height={44}
            fontSize={14}
            onPress={goNext}
          />
        </CTABar>
      </Screen>
    );
  }

  // ─── SUCCESS ──────────────────────────────────────────────────────────────
  return (
    <Screen style={{ paddingHorizontal: 24 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <SuccessCheckIllo size={140} />
        <H1 style={{ marginTop: 22, fontSize: 26 }}>You're verified.</H1>
        <Muted style={{ marginTop: 10, textAlign: 'center', maxWidth: 280, lineHeight: 20 }}>
          Your ID is on file. Booking and listing are now unlocked.
        </Muted>
      </View>
      <CTABar>
        <Button label="Continue" onPress={goNext} />
      </CTABar>
    </Screen>
  );
}

function ChecklistRow({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <Row gap={10} style={{ paddingHorizontal: 4 }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: c.greenPill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={12} color={c.green2} />
      </View>
      <Body style={{ flex: 1, fontSize: 13 }}>{text}</Body>
    </Row>
  );
}

/**
 * Identity verification screen — Stripe Identity hosted flow.
 *
 * Used by both driver and host onboarding. Mirrors the browser + 3s status
 * polling pattern from `(host)/host-onboarding/stripe-connect.tsx`.
 *
 * Behavior:
 *  - Tapping "Verify now" creates a Stripe verification session and opens it
 *    in the system browser. We poll `auth.identityVerificationStatus` until Stripe's
 *    webhook flips the row to `verified` / `requires_input`.
 *  - In dev-bypass mode (no real Stripe keys), the server marks the user
 *    verified instantly and we skip the browser.
 *  - "Skip verification" routes the user forward without verifying. Booking and
 *    listing remain locked behind the unverified status.
 *
 * Query param `next` controls where to go after success/skip; defaults to map.
 */

import { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Button, Body, Muted, H1, Card, CTABar } from '../../src/components/ui';
import { ChevronLeft, Check } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';
import { handleError } from '../../src/lib/errors';
import {
  ChecklistRow,
  VerificationRequiresInput,
  VerificationSuccess,
} from '../../src/features/profile/IdentityVerificationStates';

type ViewState = 'intro' | 'webview' | 'success' | 'requires_input';

export default function IdentityVerification() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const { c } = useTheme();
  const [view, setView] = useState<ViewState>('intro');
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
        // Server already marked us verified - skip the browser.
        setView('success');
        return;
      }
      if (!d.url) return;

      // Open Stripe's hosted page in SFSafariViewController. SFSafari has
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

  // Watch for Stripe webhook to flip status while the browser is open.
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
    '/(host)/add-charger',
    '/(host)/host-onboarding/charger-identification',
    '/(host)/host-onboarding/stripe-connect',
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
        <Muted
          style={{ marginTop: 10, textAlign: 'center', lineHeight: 20, paddingHorizontal: 18 }}
        >
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
            Drivers must verify before booking; hosts must verify before listing a charger. You can
            skip verification and complete it from your profile, but those actions stay locked until
            you do.
          </Muted>
        </Card>

        <CTABar>
          {alreadyVerified ? (
            <Button label="Continue" onPress={goNext} />
          ) : (
            <>
              <Button label="Verify now" onPress={() => start.mutate()} loading={start.isPending} />
              <Button
                label="Skip verification"
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
          <H1 style={{ marginTop: 22, fontSize: 22, textAlign: 'center' }}>Verifying your ID</H1>
          <Muted style={{ marginTop: 10, textAlign: 'center', maxWidth: 280, lineHeight: 20 }}>
            Stripe's hosted page should have opened in your browser. Complete the document scan and
            selfie there, then return to this screen.
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
          <Button label="I'm done — check status" onPress={() => status.refetch()} />
        </CTABar>
      </Screen>
    );
  }

  // ─── REQUIRES INPUT (failure) ─────────────────────────────────────────────
  if (view === 'requires_input') {
    return (
      <VerificationRequiresInput
        failureReason={status.data?.failureReason}
        loading={start.isPending}
        onBack={() => router.back()}
        onTryAgain={() => start.mutate()}
        onSkip={goNext}
      />
    );
  }

  // ─── SUCCESS ──────────────────────────────────────────────────────────────
  return <VerificationSuccess onContinue={goNext} />;
}

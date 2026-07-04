/** @file apps/mobile/app/(auth)/welcome.tsx. */
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Google from 'expo-auth-session/providers/google';
import { ResponseType } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Screen, Button, H1Lg, Body, Label, Muted, Row, StatusDot } from '../../src/components/ui';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';
import { authErrorMessage, googleAuthConfig, isAuthCancel, useAuth } from '../../src/state/auth';
import { routeAfterAuthSession } from '../../src/lib/authRouting';
import { useRole } from '../../src/state/role';
import { track } from '../../src/lib/analytics';
import { Sentry } from '../../src/lib/sentry';

WebBrowser.maybeCompleteAuthSession();

type AuthProvider = 'google' | 'apple';

export default function Welcome() {
  const router = useRouter();
  const { c } = useTheme();
  const signInWithGoogleToken = useAuth((s) => s.signInWithGoogleToken);
  const signInWithApple = useAuth((s) => s.signInWithApple);
  const [busyProvider, setBusyProvider] = useState<AuthProvider | null>(null);
  const utils = trpc.useUtils();
  const [, , promptGoogle] = Google.useAuthRequest(
    {
      iosClientId: googleAuthConfig.iosClientId,
      webClientId: googleAuthConfig.webClientId,
      scopes: ['openid', 'profile', 'email'],
      selectAccount: true,
      responseType: ResponseType.IdToken,
    },
    {
      native: `${googleAuthConfig.iosUrlScheme}:/oauthredirect`,
    },
  );

  const finishAuth = async (method: AuthProvider) => {
    const session = await utils.auth.getSession.fetch();
    track('sign_in_completed', { method });
    routeAfterAuthSession(router, session, useRole.getState().role);
  };

  const continueWithProvider = async (
    provider: AuthProvider,
    action: () => Promise<void>,
    label: string
  ) => {
    try {
      setBusyProvider(provider);
      await action();
      await finishAuth(provider);
    } catch (err) {
      if (!isAuthCancel(err)) {
        Sentry.addBreadcrumb({ category: 'auth.failure', message: provider });
        Sentry.captureException(err);
        Alert.alert(`${label} failed`, authErrorMessage(err));
      }
    } finally {
      setBusyProvider(null);
    }
  };

  const continueWithGoogle = async () => {
    try {
      setBusyProvider('google');
      const result = await promptGoogle();
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type !== 'success') {
        throw new Error(result.type === 'error' ? result.error?.message ?? 'Google sign-in failed.' : 'Google sign-in was not completed.');
      }
      const idToken = result.params.id_token ?? result.authentication?.idToken;
      if (!idToken) throw new Error('Google did not return an ID token.');
      await signInWithGoogleToken(idToken);
      await finishAuth('google');
    } catch (err) {
      if (!isAuthCancel(err)) {
        Sentry.addBreadcrumb({ category: 'auth.failure', message: 'google' });
        Sentry.captureException(err);
        Alert.alert('Google sign-in failed', authErrorMessage(err));
      }
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <Screen style={{ paddingHorizontal: 24, paddingBottom: 30 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 30 }}>
        <Image
          source={require('../../assets/logo.png')}
          contentFit="contain"
          accessibilityLabel="EdnaCharge"
          style={{ width: 220, height: 236 }}
        />
      </View>
      <View>
        <Label style={{ marginBottom: 6 }}>EDNACHARGE</Label>
        <H1Lg style={{ marginBottom: 10 }}>Charge where{'\n'}you live.</H1Lg>
        <Body style={{ marginBottom: 20 }}>
          Find, book, and pay for EV charging at homes near you.
        </Body>
        <View style={{ gap: 10 }}>
          <Row>
            <StatusDot />
            <Muted>Verified hosts</Muted>
          </Row>
          <Row>
            <StatusDot />
            <Muted>Pay only for what you use</Muted>
          </Row>
          <Row>
            <StatusDot />
            <Muted>Book in seconds</Muted>
          </Row>
        </View>
        <Button
          label="Continue with Google"
          loading={busyProvider === 'google'}
          disabled={busyProvider !== null}
          onPress={continueWithGoogle}
          style={{ marginTop: 20 }}
        />
        {/* Apple sign-in is iOS-only (expo-apple-authentication throws elsewhere),
            so never show it on Android where it would immediately fail. */}
        {Platform.OS === 'ios' ? (
          <Button
            label="Continue with Apple"
            variant="secondary"
            loading={busyProvider === 'apple'}
            disabled={busyProvider !== null}
            onPress={() => continueWithProvider('apple', signInWithApple, 'Apple sign-in')}
            style={{ marginTop: 10 }}
          />
        ) : null}
        {/* Group fast OAuth above; email below — clearer first-run choice. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
          <Muted style={{ fontSize: 11 }} accessibilityElementsHidden>
            or
          </Muted>
          <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
        </View>
        <Button
          label="Continue with email"
          variant="secondary"
          disabled={busyProvider !== null}
          onPress={() => router.push('/(auth)/sign-in')}
          style={{ marginTop: 10 }}
        />
        <Muted style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: c.muted2 }}>
          By continuing you agree to our{' '}
          <Muted
            onPress={() => router.push('/(shared)/legal?doc=terms' as never)}
            style={{ fontSize: 11, color: c.ink, textDecorationLine: 'underline' }}
          >
            Terms
          </Muted>{' '}
          &{' '}
          <Muted
            onPress={() => router.push('/(shared)/legal?doc=privacy' as never)}
            style={{ fontSize: 11, color: c.ink, textDecorationLine: 'underline' }}
          >
            Privacy Policy
          </Muted>
          .
        </Muted>
      </View>
    </Screen>
  );
}

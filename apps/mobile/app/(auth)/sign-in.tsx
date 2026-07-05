/** @file apps/mobile/app/(auth)/sign-in.tsx. */
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Button, CTABar, H1, Input, Muted } from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { trpc } from '../../src/lib/trpc';
import { authErrorMessage, useAuth } from '../../src/state/auth';
import { useTheme } from '../../src/theme/useTheme';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../../src/lib/passwordPolicy';
import { routeAfterAuthSession } from '../../src/lib/authRouting';
import { useRole } from '../../src/state/role';
import { track } from '../../src/lib/analytics';
import { Sentry } from '../../src/lib/sentry';

export default function SignIn() {
  const router = useRouter();
  const { c } = useTheme();
  const [mode, setMode] = useState<'sign-in' | 'create'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const signInWithEmail = useAuth((s) => s.signInWithEmail);
  const createAccountWithEmail = useAuth((s) => s.createAccountWithEmail);
  const sendPasswordReset = useAuth((s) => s.sendPasswordReset);
  const utils = trpc.useUtils();
  // Strong policy only at account CREATION. Sign-in keeps a low bar so existing
  // users with shorter (pre-policy) passwords are never locked out.
  const minLen = mode === 'create' ? MIN_PASSWORD_LENGTH : 6;
  const passwordTooShort = password.length > 0 && password.length < minLen;
  // Basic email format check so a malformed address fails fast client-side
  // instead of round-tripping to the auth server for an opaque error.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const emailInvalid = email.trim().length > 0 && !emailValid;
  const canSubmit = emailValid && password.length >= minLen;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      setBusy(true);
      if (mode === 'create') {
        // Min-length + breached-password (HIBP k-anonymity) screening before
        // we ever hand the password to Supabase. Fails open on network error.
        const pwError = await validateNewPassword(password);
        if (pwError) {
          Alert.alert('Choose a stronger password', pwError);
          setBusy(false);
          return;
        }
        await createAccountWithEmail(email, password);
        Alert.alert(
          'Verify your email',
          'We sent a verification link to your inbox. Open it, then sign in with your email and password.',
        );
        setMode('sign-in');
        setPassword('');
        return;
      } else {
        await signInWithEmail(email, password);
        track('sign_in_completed', { method: 'email' });
      }
      const session = await utils.auth.getSession.fetch();
      routeAfterAuthSession(router, session, useRole.getState().role);
    } catch (err) {
      Sentry.addBreadcrumb({ category: 'auth.failure', message: mode });
      Sentry.captureException(err);
      Alert.alert(
        mode === 'create' ? 'Account creation failed' : 'Sign-in failed',
        authErrorMessage(err)
      );
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'Add your email address first.');
      return;
    }
    try {
      setBusy(true);
      await sendPasswordReset(email);
      Alert.alert('Reset email sent', 'Check your inbox to reset your password.');
    } catch (err) {
      Alert.alert('Reset failed', authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboardAvoiding contentStyle={{ paddingBottom: 24 }}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        style={{ paddingTop: 8 }}
      >
        <ChevronLeft />
      </Pressable>
      <View style={{ marginTop: 24 }}>
        <H1>{mode === 'create' ? 'Create account' : 'Sign in'}</H1>
        <Muted style={{ marginTop: 8, fontSize: 14 }}>
          Use your email and password to continue.
        </Muted>
      </View>
      <View style={{ marginTop: 26, gap: 14 }}>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          error={emailInvalid ? 'Enter a valid email address.' : undefined}
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'create' ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
          autoCapitalize="none"
          autoComplete={mode === 'create' ? 'new-password' : 'password'}
          secureTextEntry
          textContentType={mode === 'create' ? 'newPassword' : 'password'}
          error={passwordTooShort ? `Use at least ${minLen} characters.` : undefined}
        />
        <View style={{ gap: 14 }}>
          {mode === 'sign-in' ? (
            <Pressable onPress={resetPassword} disabled={busy}>
              <Text style={{ color: c.ink, fontSize: 14, fontWeight: '600' }}>
                Forgot password?
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setMode(mode === 'create' ? 'sign-in' : 'create')}
            disabled={busy}
          >
            <Text style={{ color: c.muted, fontSize: 14 }}>
              {mode === 'create'
                ? 'Already have an account? Sign in'
                : 'New to EdnaCharge? Create account'}
            </Text>
          </Pressable>
        </View>
      </View>
      <CTABar>
        <Button
          label={mode === 'create' ? 'Create account' : 'Sign in'}
          loading={busy}
          disabled={!canSubmit}
          onPress={submit}
        />
      </CTABar>
    </Screen>
  );
}

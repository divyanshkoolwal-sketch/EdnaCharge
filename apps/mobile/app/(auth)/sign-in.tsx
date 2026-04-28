import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Button, CTABar, H1, Input, Muted } from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { trpc } from '../../src/lib/trpc';
import { authErrorMessage, useAuth } from '../../src/state/auth';
import { useTheme } from '../../src/theme/useTheme';

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
  const passwordTooShort = password.length > 0 && password.length < 6;
  const canSubmit = email.trim().length > 3 && password.length >= 6;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      setBusy(true);
      if (mode === 'create') {
        await createAccountWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      const session = await utils.auth.getSession.fetch();
      router.replace(session.driverProfile ? '/' : '/(auth)/driver-profile');
    } catch (err) {
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
    <Screen>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
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
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          autoCapitalize="none"
          autoComplete={mode === 'create' ? 'new-password' : 'password'}
          secureTextEntry
          textContentType={mode === 'create' ? 'newPassword' : 'password'}
          error={passwordTooShort ? 'Use at least 6 characters.' : undefined}
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

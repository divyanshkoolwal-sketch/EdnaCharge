import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { Screen, Button, CTABar, H1, Input, Muted } from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { trpc } from '../../src/lib/trpc';
import { authErrorMessage, useAuth } from '../../src/state/auth';

export default function PhoneSignIn() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] =
    useState<FirebaseAuthTypes.ConfirmationResult | null>(null);
  const sendPhoneCode = useAuth((s) => s.sendPhoneCode);
  const confirmPhoneCode = useAuth((s) => s.confirmPhoneCode);
  const utils = trpc.useUtils();

  const submitPhone = async () => {
    if (phone.trim().length < 8) return;
    try {
      setBusy(true);
      const result = await sendPhoneCode(phone);
      setConfirmation(result);
    } catch (err) {
      Alert.alert('Phone sign-in failed', authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!confirmation || code.trim().length < 4) return;
    try {
      setBusy(true);
      await confirmPhoneCode(confirmation, code);
      const session = await utils.auth.getSession.fetch();
      router.replace(session.driverProfile ? '/' : '/(auth)/driver-profile');
    } catch (err) {
      Alert.alert('Verification failed', authErrorMessage(err));
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
        <H1>{confirmation ? 'Enter code' : 'Phone sign in'}</H1>
        <Muted style={{ marginTop: 8, fontSize: 14 }}>
          {confirmation ? 'Use the verification code sent to your phone.' : 'Enter your mobile number to continue.'}
        </Muted>
      </View>
      <View style={{ marginTop: 26, gap: 14 }}>
        {confirmation ? (
          <Input
            label="Verification code"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            autoComplete="sms-otp"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
          />
        ) : (
          <Input
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 555 000 0000"
            autoComplete="tel"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
          />
        )}
      </View>
      <CTABar>
        <Button
          label={confirmation ? 'Verify code' : 'Send code'}
          loading={busy}
          disabled={confirmation ? code.trim().length < 4 : phone.trim().length < 8}
          onPress={confirmation ? submitCode : submitPhone}
        />
      </CTABar>
    </Screen>
  );
}

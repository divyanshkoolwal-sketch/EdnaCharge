import { useState } from 'react';
import { Pressable, View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Input, Button, CTABar, H1, Muted } from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { supabase } from '../../src/lib/supabase';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      Alert.alert('Oops', error.message);
      return;
    }
    router.push({ pathname: '/(auth)/otp', params: { email } });
  };

  return (
    <Screen keyboardAvoiding>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <View style={{ marginTop: 24 }}>
        <H1>Your email</H1>
        <Muted style={{ marginTop: 8, fontSize: 14 }}>
          We'll send you a 6-digit code.
        </Muted>
      </View>
      <View style={{ marginTop: 32 }}>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
      </View>
      <CTABar>
        <Button
          label="Send code"
          loading={busy}
          disabled={!email}
          onPress={submit}
        />
      </CTABar>
    </Screen>
  );
}

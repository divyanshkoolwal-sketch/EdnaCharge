import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
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
    <View className="flex-1 bg-white px-6 pt-20">
      <Text className="text-3xl font-bold mb-2">Your email</Text>
      <Text className="text-gray-600 mb-6">We'll send you a 6-digit code.</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        className="border border-gray-300 rounded-lg px-4 py-3 text-base"
      />
      <Pressable
        disabled={!email || busy}
        onPress={submit}
        className={`mt-6 rounded-full py-4 items-center ${busy || !email ? 'bg-gray-300' : 'bg-black'}`}
      >
        <Text className="text-white font-semibold">{busy ? 'Sending…' : 'Send code'}</Text>
      </Pressable>
    </View>
  );
}

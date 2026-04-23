import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { trpc } from '../../src/lib/trpc';

export default function Otp() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const utils = trpc.useUtils();

  const verify = async () => {
    if (!email || code.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setBusy(false);
    if (error) {
      Alert.alert('Bad code', error.message);
      return;
    }
    // Warm the cache for getSession so the profile router decides what to show next.
    const session = await utils.auth.getSession.fetch();
    if (!session.driverProfile) {
      router.replace('/(auth)/driver-profile');
    } else {
      router.replace('/');
    }
  };

  return (
    <View className="flex-1 bg-white px-6 pt-20">
      <Text className="text-3xl font-bold mb-2">Enter the code</Text>
      <Text className="text-gray-600 mb-6">Sent to {email}.</Text>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        placeholder="123456"
        className="border border-gray-300 rounded-lg px-4 py-3 text-2xl tracking-widest text-center"
      />
      <Pressable
        disabled={code.length !== 6 || busy}
        onPress={verify}
        className={`mt-6 rounded-full py-4 items-center ${busy || code.length !== 6 ? 'bg-gray-300' : 'bg-black'}`}
      >
        <Text className="text-white font-semibold">{busy ? 'Verifying…' : 'Continue'}</Text>
      </Pressable>
    </View>
  );
}

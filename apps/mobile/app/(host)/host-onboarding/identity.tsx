import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';

export default function Identity() {
  const router = useRouter();
  const [legalName, setName] = useState('');
  const [dob, setDob] = useState(''); // YYYY-MM-DD
  const [addressLine1, setA1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setZip] = useState('');

  const mut = trpc.auth.submitHostIdentity.useMutation({
    onSuccess: () => router.push('/(host)/host-onboarding/charger-identification'),
    onError: (e) => Alert.alert('Oops', e.message),
  });

  const submit = () => {
    if (!legalName || !dob || !addressLine1 || !city || !state || !postalCode) {
      return Alert.alert('Missing info', 'Fill in every field.');
    }
    mut.mutate({
      legalName,
      dob: new Date(`${dob}T00:00:00Z`).toISOString(),
      addressLine1,
      city,
      state,
      postalCode,
      country: 'US',
    });
  };

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, paddingTop: 80 }}>
      <Text className="text-3xl font-bold mb-2">Identity</Text>
      <Text className="text-gray-600 mb-6">Required for Stripe Connect payouts.</Text>
      <Field label="Legal full name">
        <TextInput value={legalName} onChangeText={setName} className={inputCls} />
      </Field>
      <Field label="Date of birth (YYYY-MM-DD)">
        <TextInput value={dob} onChangeText={setDob} placeholder="1990-05-21" className={inputCls} />
      </Field>
      <Field label="Street">
        <TextInput value={addressLine1} onChangeText={setA1} className={inputCls} />
      </Field>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field label="City">
            <TextInput value={city} onChangeText={setCity} className={inputCls} />
          </Field>
        </View>
        <View style={{ width: 90 }}>
          <Field label="State">
            <TextInput value={state} onChangeText={setState} autoCapitalize="characters" className={inputCls} />
          </Field>
        </View>
      </View>
      <Field label="ZIP">
        <TextInput value={postalCode} onChangeText={setZip} keyboardType="number-pad" className={inputCls} />
      </Field>

      <Pressable
        disabled={mut.isPending}
        onPress={submit}
        className={`mt-4 rounded-full py-4 items-center ${mut.isPending ? 'bg-gray-300' : 'bg-black'}`}
      >
        <Text className="text-white font-semibold">{mut.isPending ? 'Saving…' : 'Continue'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const inputCls = 'border border-gray-300 rounded-lg px-4 py-3 text-base';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="text-sm text-gray-600 mb-2">{label}</Text>
      {children}
    </View>
  );
}

import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../src/lib/trpc';
import type { ConnectorType } from '@edna/schemas';

const CONNECTORS: { value: ConnectorType; label: string }[] = [
  { value: 'j1772', label: 'J1772' },
  { value: 'nacs', label: 'NACS' },
  { value: 'tesla', label: 'Tesla' },
  { value: 'ccs1', label: 'CCS1' },
  { value: 'chademo', label: 'CHAdeMO' },
];

export default function DriverProfile() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [vehicleMake, setMake] = useState('');
  const [vehicleModel, setModel] = useState('');
  const [vehicleYear, setYear] = useState(String(new Date().getFullYear()));
  const [connector, setConnector] = useState<ConnectorType>('nacs');
  const [plate, setPlate] = useState('');

  const mut = trpc.auth.completeDriverProfile.useMutation({
    onSuccess: () => router.replace('/(driver)/map'),
    onError: (e) => Alert.alert('Oops', e.message),
  });

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, paddingTop: 80 }}>
      <Text className="text-3xl font-bold mb-6">Tell us about your ride</Text>

      <Field label="Your name">
        <TextInput value={fullName} onChangeText={setFullName} className={inputCls} />
      </Field>
      <Field label="Make">
        <TextInput value={vehicleMake} onChangeText={setMake} className={inputCls} />
      </Field>
      <Field label="Model">
        <TextInput value={vehicleModel} onChangeText={setModel} className={inputCls} />
      </Field>
      <Field label="Year">
        <TextInput
          value={vehicleYear}
          onChangeText={setYear}
          keyboardType="number-pad"
          className={inputCls}
        />
      </Field>
      <Field label="Connector">
        <View className="flex-row flex-wrap gap-2">
          {CONNECTORS.map((c) => (
            <Pressable
              key={c.value}
              onPress={() => setConnector(c.value)}
              className={`px-4 py-2 rounded-full border ${
                connector === c.value ? 'bg-black border-black' : 'border-gray-300'
              }`}
            >
              <Text className={connector === c.value ? 'text-white' : 'text-black'}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="License plate (optional)">
        <TextInput value={plate} onChangeText={setPlate} autoCapitalize="characters" className={inputCls} />
      </Field>

      <Pressable
        disabled={!fullName || !vehicleMake || !vehicleModel || mut.isPending}
        onPress={() =>
          mut.mutate({
            fullName,
            vehicleMake,
            vehicleModel,
            vehicleYear: Number(vehicleYear) || 0,
            connectorType: connector,
            licensePlate: plate || undefined,
          })
        }
        className={`mt-4 rounded-full py-4 items-center ${mut.isPending ? 'bg-gray-300' : 'bg-black'}`}
      >
        <Text className="text-white font-semibold">
          {mut.isPending ? 'Saving…' : 'Continue to map'}
        </Text>
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

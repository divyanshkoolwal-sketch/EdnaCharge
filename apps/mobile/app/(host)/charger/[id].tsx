import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';

export default function HostChargerEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = trpc.charger.get.useQuery({ id: id! }, { enabled: !!id });
  const ocpp = trpc.charger.ocppCredentials.useMutation();

  const revealCreds = () => {
    ocpp.mutate(
      { id: id! },
      {
        onSuccess: (d) =>
          Alert.alert(
            'OCPP credentials',
            `URL: ${d.wssUrl}\nID: ${d.chargePointId}\nPassword: ${d.password}`,
          ),
        onError: (e) => Alert.alert('Oops', e.message),
      },
    );
  };

  if (!q.data) return <View className="flex-1 bg-white" />;
  const c = q.data;
  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text className="text-3xl font-bold">{c.title}</Text>
      <Text className="text-gray-500 mt-1">
        {c.addressLine1}, {c.city}, {c.state} {c.postalCode}
      </Text>
      <Text className="mt-3">
        {c.connectorType.toUpperCase()} · {c.powerKw} kW · {c.hardwareTier}
      </Text>
      <Text className="mt-2">Status: {c.status}</Text>
      {c.hardwareTier === 'tier_3_native' && (
        <Pressable
          onPress={revealCreds}
          className="mt-6 bg-black rounded-full py-4 items-center"
        >
          <Text className="text-white font-semibold">Reveal OCPP credentials</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

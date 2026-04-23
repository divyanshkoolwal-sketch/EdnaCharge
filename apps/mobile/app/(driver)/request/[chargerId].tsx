import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';

export default function RequestBooking() {
  const { chargerId } = useLocalSearchParams<{ chargerId: string }>();
  const router = useRouter();
  const charger = trpc.charger.get.useQuery({ id: chargerId! }, { enabled: !!chargerId });

  const [hours, setHours] = useState(1);
  const [msg, setMsg] = useState('');

  const mut = trpc.booking.requestBooking.useMutation({
    onSuccess: (r) =>
      router.replace({ pathname: '/(driver)/booking/[id]', params: { id: r.booking.id } }),
    onError: (e) => Alert.alert('Oops', e.message),
  });

  const submit = () => {
    const start = new Date();
    const end = new Date(start.getTime() + hours * 3_600_000);
    mut.mutate({
      chargerId: chargerId!,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      message: msg || undefined,
    });
  };

  if (!charger.data) return <Center><ActivityIndicator /></Center>;
  const c = charger.data;
  const estKwh = c.powerKw * hours;
  const estCents = c.pricePerKwhCents ? c.pricePerKwhCents * estKwh : c.pricePerHourCents ? c.pricePerHourCents * hours : 0;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text className="text-3xl font-bold mb-6">Request booking</Text>
      <Text className="text-lg font-medium">{c.title}</Text>
      <Text className="text-gray-500">
        {c.connectorType.toUpperCase()} · {c.powerKw} kW
      </Text>

      <Text className="mt-6 mb-2 text-sm text-gray-600">Duration: {hours}h</Text>
      <View className="flex-row gap-2 flex-wrap">
        {[0.5, 1, 2, 3, 4, 8].map((h) => (
          <Pressable
            key={h}
            onPress={() => setHours(h)}
            className={`px-4 py-2 rounded-full border ${hours === h ? 'bg-black border-black' : 'border-gray-300'}`}
          >
            <Text className={hours === h ? 'text-white' : 'text-black'}>{h}h</Text>
          </Pressable>
        ))}
      </View>

      <Text className="mt-6 mb-2 text-sm text-gray-600">Message (optional)</Text>
      <TextInput
        value={msg}
        onChangeText={setMsg}
        multiline
        placeholder="e.g. arriving at 3:15, blue Model 3"
        className="border border-gray-300 rounded-xl px-4 py-3 min-h-[80px]"
      />

      <View className="mt-8 p-4 bg-gray-50 rounded-xl">
        <Row label="Estimated energy" value={`${estKwh.toFixed(1)} kWh`} />
        <Row label="Estimated cost" value={`$${(estCents / 100).toFixed(2)}`} />
        <Row label="Pre-auth (incl. 15% fee)" value={`$${((estCents * 1.15) / 100).toFixed(2)}`} />
      </View>

      <Pressable
        disabled={mut.isPending}
        onPress={submit}
        className={`mt-6 rounded-full py-4 items-center ${mut.isPending ? 'bg-gray-300' : 'bg-black'}`}
      >
        <Text className="text-white font-semibold">
          {mut.isPending ? 'Submitting…' : 'Send request'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const Center = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-1 items-center justify-center bg-white">{children}</View>
);
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between mb-1">
      <Text className="text-gray-600">{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

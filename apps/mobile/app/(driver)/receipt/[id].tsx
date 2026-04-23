import { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';

export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = trpc.booking.get.useQuery({ id: id! }, { enabled: !!id, refetchInterval: 3000 });
  const review = trpc.review.create.useMutation({
    onSuccess: () => router.replace('/(driver)/bookings'),
    onError: (e) => Alert.alert('Oops', e.message),
  });
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');

  if (!q.data) return <View className="flex-1 bg-white" />;
  const b = q.data;
  const captured = b.capturedAmountCents ?? null;
  const kwh = b.session?.finalKwh ?? 0;
  const energy = b.session?.finalCostCents ?? 0;
  const fee = b.platformFeeCents;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text className="text-3xl font-bold mb-2">Session complete</Text>
      <Text className="text-5xl font-bold mt-6">{kwh.toFixed(2)} kWh</Text>
      <View className="mt-6 p-4 bg-gray-50 rounded-xl">
        <Row label="Energy" value={`$${(energy / 100).toFixed(2)}`} />
        <Row label="Platform fee (15%)" value={`$${(fee / 100).toFixed(2)}`} />
        <Row
          label={captured != null ? 'Charged' : 'Settling…'}
          value={captured != null ? `$${(captured / 100).toFixed(2)}` : '—'}
        />
      </View>

      <Text className="mt-8 text-lg font-semibold">Rate your host</Text>
      <View className="flex-row gap-2 mt-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setStars(n)}>
            <Text className="text-3xl">{n <= stars ? '⭐️' : '☆'}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        placeholder="Anything you'd like to add?"
        className="mt-3 border border-gray-300 rounded-xl px-4 py-3 min-h-[80px]"
      />
      <Pressable
        onPress={() => review.mutate({ bookingId: b.id, stars, text: text || undefined })}
        disabled={review.isPending || b.status !== 'completed'}
        className={`mt-6 rounded-full py-4 items-center ${review.isPending || b.status !== 'completed' ? 'bg-gray-300' : 'bg-black'}`}
      >
        <Text className="text-white font-semibold">
          {b.status !== 'completed' ? 'Waiting for settlement…' : review.isPending ? 'Submitting…' : 'Submit review'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-gray-600">{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

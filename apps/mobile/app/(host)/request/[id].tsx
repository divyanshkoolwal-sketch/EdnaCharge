import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';

export default function HostRequestReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = trpc.booking.get.useQuery({ id: id! }, { enabled: !!id });
  const respond = trpc.booking.respond.useMutation({
    onSuccess: () => router.back(),
    onError: (e) => Alert.alert('Oops', e.message),
  });

  if (!q.data) return <View className="flex-1 bg-white" />;
  const b = q.data;
  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text className="text-3xl font-bold">{b.charger.title}</Text>
      <Text className="text-gray-500 mt-1">
        {new Date(b.startAt).toLocaleString()} → {new Date(b.endAt).toLocaleTimeString()}
      </Text>
      <Text className="mt-3">Estimated kWh: {b.estimatedKwh.toFixed(1)}</Text>
      <Text>Estimated earnings: ${((b.estimatedCostCents - b.platformFeeCents) / 100).toFixed(2)}</Text>
      {b.driverMessage ? (
        <View className="mt-4 p-4 bg-gray-50 rounded-xl">
          <Text className="text-gray-600 text-xs mb-1">Driver's message</Text>
          <Text>{b.driverMessage}</Text>
        </View>
      ) : null}

      {b.chatThread && (
        <Pressable
          onPress={() => router.push({ pathname: '/(driver)/chat/[bookingId]', params: { bookingId: b.id } })}
          className="mt-4 border border-gray-300 rounded-full py-3 items-center"
        >
          <Text>Open chat</Text>
        </Pressable>
      )}

      <Pressable
        disabled={respond.isPending}
        onPress={() => respond.mutate({ bookingId: b.id, decision: 'accept' })}
        className={`mt-6 rounded-full py-4 items-center ${respond.isPending ? 'bg-gray-300' : 'bg-black'}`}
      >
        <Text className="text-white font-semibold">Accept</Text>
      </Pressable>
      <Pressable
        disabled={respond.isPending}
        onPress={() =>
          respond.mutate({ bookingId: b.id, decision: 'decline', reason: 'not available' })
        }
        className="mt-3 border border-red-300 rounded-full py-3 items-center"
      >
        <Text className="text-red-700">Decline</Text>
      </Pressable>
    </ScrollView>
  );
}

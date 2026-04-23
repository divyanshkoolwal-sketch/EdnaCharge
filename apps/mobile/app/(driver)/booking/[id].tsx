import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = trpc.booking.get.useQuery({ id: id! }, { enabled: !!id, refetchInterval: 4000 });
  const start = trpc.booking.startSession.useMutation({
    onSuccess: () => q.refetch(),
    onError: (e) => Alert.alert('Oops', e.message),
  });
  const cancel = trpc.booking.cancel.useMutation({ onSuccess: () => q.refetch() });

  if (!q.data) return <View className="flex-1 bg-white" />;
  const b = q.data;
  const startable = b.status === 'confirmed';
  const hasSession = b.session !== null;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text className="text-3xl font-bold">{b.charger.title}</Text>
      <Text className="text-gray-500 mt-1">
        {new Date(b.startAt).toLocaleString()} → {new Date(b.endAt).toLocaleTimeString()}
      </Text>
      <Text className="mt-3">Status: {b.status}</Text>

      {b.chatThread && (
        <Pressable
          onPress={() => router.push({ pathname: '/(driver)/chat/[bookingId]', params: { bookingId: b.id } })}
          className="mt-4 border border-gray-300 rounded-full py-3 items-center"
        >
          <Text>Open chat with host</Text>
        </Pressable>
      )}

      {startable && !hasSession && (
        <Pressable
          onPress={() => start.mutate({ bookingId: b.id })}
          className="mt-6 bg-black rounded-full py-4 items-center"
        >
          <Text className="text-white font-semibold">Start session</Text>
        </Pressable>
      )}
      {b.session && (
        <Pressable
          onPress={() =>
            router.push({ pathname: '/(driver)/session/[id]', params: { id: b.session!.id } })
          }
          className="mt-4 bg-black rounded-full py-4 items-center"
        >
          <Text className="text-white font-semibold">View live session</Text>
        </Pressable>
      )}

      {['pending', 'confirmed'].includes(b.status) && (
        <Pressable
          onPress={() => cancel.mutate({ bookingId: b.id, reason: 'driver_cancel' })}
          className="mt-4 border border-red-300 rounded-full py-3 items-center"
        >
          <Text className="text-red-700">Cancel booking</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

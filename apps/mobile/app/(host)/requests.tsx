import { View, Text, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../src/lib/trpc';

export default function Requests() {
  const router = useRouter();
  const q = trpc.booking.list.useQuery({ role: 'host', status: 'pending' });
  return (
    <View className="flex-1 bg-white pt-20 px-6">
      <Text className="text-3xl font-bold mb-6">Requests</Text>
      <FlatList
        data={q.data?.rows ?? []}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/(host)/request/[id]', params: { id: item.id } })}
            className="border border-gray-200 rounded-xl p-4 mb-2"
          >
            <Text className="font-medium">{item.charger.title}</Text>
            <Text className="text-gray-500 text-sm">
              {new Date(item.startAt).toLocaleString()} · pending
            </Text>
            <Text className="text-gray-500 text-sm">
              ${(item.preauthAmountCents / 100).toFixed(2)} pre-auth
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text className="text-gray-500">No pending requests.</Text>}
      />
    </View>
  );
}

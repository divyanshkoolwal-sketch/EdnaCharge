import { View, Text, FlatList } from 'react-native';
import { trpc } from '../../src/lib/trpc';

export default function Earnings() {
  const q = trpc.booking.list.useQuery({ role: 'host', status: 'completed' });
  const total = (q.data?.rows ?? []).reduce((sum, b) => sum + (b.capturedAmountCents ?? 0), 0);
  return (
    <View className="flex-1 bg-white pt-20 px-6">
      <Text className="text-3xl font-bold mb-6">Earnings</Text>
      <Text className="text-gray-500">Lifetime gross</Text>
      <Text className="text-4xl font-bold">${(total / 100).toFixed(2)}</Text>
      <FlatList
        data={q.data?.rows ?? []}
        keyExtractor={(b) => b.id}
        className="mt-6"
        renderItem={({ item }) => (
          <View className="flex-row justify-between py-3 border-b border-gray-100">
            <Text>{new Date(item.startAt).toLocaleDateString()}</Text>
            <Text>${((item.capturedAmountCents ?? 0) / 100).toFixed(2)}</Text>
          </View>
        )}
      />
    </View>
  );
}

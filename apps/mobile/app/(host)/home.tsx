import { View, Text, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../src/lib/trpc';

export default function HostHome() {
  const router = useRouter();
  const chargers = trpc.charger.myChargers.useQuery();

  return (
    <View className="flex-1 bg-white pt-20 px-6">
      <Text className="text-3xl font-bold mb-6">Today</Text>
      <Text className="text-gray-600 mb-3">Your chargers</Text>
      <FlatList
        data={chargers.data ?? []}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/(host)/charger/[id]', params: { id: item.id } })}
            className="border border-gray-200 rounded-xl p-4 mb-2"
          >
            <Text className="font-medium">{item.title}</Text>
            <Text className="text-gray-500 text-sm">
              {item.connectorType.toUpperCase()} · {item.powerKw} kW · {item.status}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text className="text-gray-500">No chargers yet.</Text>}
      />
      <Pressable
        onPress={() => router.push('/(host)/add-charger')}
        className="mt-4 bg-black rounded-full py-4 items-center"
      >
        <Text className="text-white font-semibold">Add a charger</Text>
      </Pressable>
    </View>
  );
}

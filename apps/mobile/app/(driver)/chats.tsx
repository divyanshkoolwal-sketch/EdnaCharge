import { View, Text, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../src/lib/trpc';

export default function Chats() {
  const router = useRouter();
  const q = trpc.chat.listThreads.useQuery();
  return (
    <View className="flex-1 bg-white pt-20 px-6">
      <Text className="text-3xl font-bold mb-6">Chats</Text>
      <FlatList
        data={q.data ?? []}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => {
          const last = item.messages[0];
          return (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(driver)/chat/[bookingId]',
                  params: { bookingId: item.booking.id },
                })
              }
              className="border-b border-gray-100 py-4"
            >
              <Text className="font-medium">{item.booking.charger.title}</Text>
              <Text className="text-gray-500" numberOfLines={1}>
                {last?.body ?? '(no messages yet)'}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text className="text-gray-500">No threads yet.</Text>}
      />
    </View>
  );
}

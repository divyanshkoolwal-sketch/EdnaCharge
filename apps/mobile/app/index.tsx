import { Text, View } from 'react-native';
import { trpc } from '../src/lib/trpc';

export default function Index() {
  const health = trpc.health.useQuery();

  return (
    <View className="flex-1 items-center justify-center bg-white p-6">
      <Text className="text-2xl font-bold mb-4">EdnaCharge</Text>
      <Text className="text-base text-gray-600 mb-6">Phase 0 boot check</Text>
      {health.isLoading && <Text>Pinging api…</Text>}
      {health.error && <Text className="text-red-600">api unreachable: {health.error.message}</Text>}
      {health.data && (
        <Text className="text-green-700">
          api {health.data.status} @ {health.data.at}
        </Text>
      )}
    </View>
  );
}

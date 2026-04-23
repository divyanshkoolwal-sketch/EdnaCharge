import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useRole } from '../../../src/state/role';

export default function Done() {
  const router = useRouter();
  const setRole = useRole((s) => s.setRole);
  return (
    <View className="flex-1 bg-white px-6 pt-24 pb-12 justify-between">
      <View>
        <Text className="text-4xl font-bold">You're a host.</Text>
        <Text className="text-gray-600 mt-3 text-base">
          Let's list your first charger.
        </Text>
      </View>
      <Pressable
        onPress={() => {
          setRole('host');
          router.replace('/(host)/add-charger');
        }}
        className="bg-black rounded-full py-4 items-center"
      >
        <Text className="text-white font-semibold">Add charger</Text>
      </Pressable>
    </View>
  );
}

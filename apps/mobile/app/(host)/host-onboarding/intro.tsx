import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function Intro() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-white px-6 pt-20 pb-12 justify-between">
      <View>
        <Text className="text-3xl font-bold">Become a host</Text>
        <Text className="text-gray-600 mt-3">
          List your home charger in 5 minutes. Drivers book it, you earn 85% of every session.
        </Text>
        <View className="mt-6 gap-3">
          <Bullet>Typical hosts earn $40–$200/month.</Bullet>
          <Bullet>You decide the price, schedule, and house rules.</Bullet>
          <Bullet>Every request is yours to accept or decline.</Bullet>
        </View>
      </View>
      <Pressable
        onPress={() => router.push('/(host)/host-onboarding/identity')}
        className="bg-black rounded-full py-4 items-center"
      >
        <Text className="text-white font-semibold">Get started</Text>
      </Pressable>
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row gap-3">
      <Text>•</Text>
      <Text className="text-gray-700 flex-1">{children}</Text>
    </View>
  );
}

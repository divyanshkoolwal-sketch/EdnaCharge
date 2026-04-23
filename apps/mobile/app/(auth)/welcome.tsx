import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function Welcome() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-white px-6 justify-between pt-24 pb-12">
      <View>
        <Text className="text-4xl font-bold">Charge where you live.</Text>
        <Text className="text-lg text-gray-600 mt-3">
          Find, book, and pay for EV charging at homes near you.
        </Text>
      </View>
      <View className="gap-3">
        <Pressable
          onPress={() => router.push('/(auth)/sign-in')}
          className="bg-black rounded-full py-4 items-center"
        >
          <Text className="text-white font-semibold text-base">Continue with email</Text>
        </Pressable>
        <Text className="text-center text-gray-500 text-sm">
          By continuing you agree to our terms & privacy policy.
        </Text>
      </View>
    </View>
  );
}

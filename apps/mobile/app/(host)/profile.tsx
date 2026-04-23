import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useRole } from '../../src/state/role';
import { useAuth } from '../../src/state/auth';

export default function HostProfile() {
  const router = useRouter();
  const setRole = useRole((s) => s.setRole);
  const signOut = useAuth((s) => s.signOut);
  return (
    <View className="flex-1 bg-white pt-20 px-6">
      <Text className="text-3xl font-bold mb-6">Profile</Text>
      <Pressable
        onPress={() => {
          setRole('driver');
          router.replace('/(driver)/map');
        }}
        className="bg-black rounded-full py-4 items-center"
      >
        <Text className="text-white font-semibold">Switch to driver</Text>
      </Pressable>
      <Pressable
        onPress={() => signOut()}
        className="mt-3 border border-red-300 rounded-full py-3 items-center"
      >
        <Text className="text-red-700">Sign out</Text>
      </Pressable>
    </View>
  );
}

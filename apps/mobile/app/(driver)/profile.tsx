import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../src/lib/trpc';
import { useAuth } from '../../src/state/auth';
import { useRole } from '../../src/state/role';

export default function Profile() {
  const router = useRouter();
  const me = trpc.auth.getSession.useQuery();
  const setRole = useRole((s) => s.setRole);
  const signOut = useAuth((s) => s.signOut);
  const isHost = me.data?.roles.includes('host');

  return (
    <View className="flex-1 bg-white pt-20 px-6">
      <Text className="text-3xl font-bold mb-6">Profile</Text>
      <Text className="text-gray-500">{me.data?.email}</Text>

      {isHost ? (
        <Pressable
          onPress={() => {
            setRole('host');
            router.replace('/(host)/home');
          }}
          className="mt-6 bg-black rounded-full py-4 items-center"
        >
          <Text className="text-white font-semibold">Switch to host</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.push('/(host)/host-onboarding/intro')}
          className="mt-6 bg-black rounded-full py-4 items-center"
        >
          <Text className="text-white font-semibold">Become a host</Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => router.push('/(shared)/payment-methods')}
        className="mt-3 border border-gray-300 rounded-full py-3 items-center"
      >
        <Text>Payment methods</Text>
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

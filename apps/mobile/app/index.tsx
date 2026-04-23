import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../src/state/auth';
import { useRole } from '../src/state/role';

export default function Index() {
  const { session, loading } = useAuth();
  const role = useRole((s) => s.role);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }
  if (!session) return <Redirect href="/(auth)/welcome" />;
  return <Redirect href={role === 'host' ? '/(host)/home' : '/(driver)/map'} />;
}

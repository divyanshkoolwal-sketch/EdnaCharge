import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Screen } from '../src/components/ui';
import { useAuth } from '../src/state/auth';
import { useRole } from '../src/state/role';

export default function Index() {
  const { session, loading } = useAuth();
  const role = useRole((s) => s.role);

  if (loading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (!session) return <Redirect href="/(auth)/welcome" />;
  return <Redirect href={role === 'host' ? '/(host)/home' : '/(driver)/map'} />;
}

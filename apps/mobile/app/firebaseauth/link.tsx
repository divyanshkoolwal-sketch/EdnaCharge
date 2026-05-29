import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/ui';

export default function FirebaseAuthLink() {
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(auth)/phone' as never);
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </Screen>
  );
}

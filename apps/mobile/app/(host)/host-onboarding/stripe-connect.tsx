import { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';

export default function StripeConnect() {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const start = trpc.auth.startHostOnboarding.useMutation();
  const status = trpc.auth.hostOnboardingStatus.useQuery(undefined, {
    enabled: !!url,
    refetchInterval: 3000,
  });

  useEffect(() => {
    start.mutate(undefined, {
      onSuccess: (d) => setUrl(d.url),
      onError: (e) => Alert.alert('Stripe error', e.message),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status.data?.status === 'complete') router.replace('/(host)/host-onboarding/done');
  }, [status.data?.status, router]);

  if (!url) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
        <Text className="text-gray-600 mt-2">Preparing Stripe onboarding…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <WebView source={{ uri: url }} />
      <View className="p-4">
        <Pressable
          onPress={() => status.refetch()}
          className="rounded-full py-3 items-center border border-gray-300"
        >
          <Text>I'm done — check status</Text>
        </Pressable>
      </View>
    </View>
  );
}

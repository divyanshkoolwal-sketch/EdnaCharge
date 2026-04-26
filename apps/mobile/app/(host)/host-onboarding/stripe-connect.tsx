import { useEffect, useState } from 'react';
import { View, Pressable, Alert, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { Screen, Button, Body, Muted } from '../../../src/components/ui';
import { ChevronLeft } from '../../../src/components/icons/Icon';
import { useTheme } from '../../../src/theme/useTheme';
import { trpc } from '../../../src/lib/trpc';

export default function StripeConnect() {
  const router = useRouter();
  const { c } = useTheme();
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
    if (status.data?.status === 'complete')
      router.replace('/(host)/host-onboarding/done');
  }, [status.data?.status, router]);

  if (!url) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Pressable onPress={() => router.back()} style={{ position: 'absolute', top: 60, left: 24 }}>
          <ChevronLeft />
        </Pressable>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 3,
            borderColor: c.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator color={c.ink} />
        </View>
        <Body style={{ fontWeight: '700', marginTop: 18 }}>Preparing payouts…</Body>
        <Muted style={{ fontSize: 12, marginTop: 6 }}>Stripe Connect</Muted>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <WebView source={{ uri: url }} style={{ flex: 1 }} />
      <View style={{ padding: 16 }}>
        <Button
          label="I'm done — check status"
          variant="secondary"
          height={44}
          fontSize={13}
          onPress={() => status.refetch()}
        />
      </View>
    </View>
  );
}

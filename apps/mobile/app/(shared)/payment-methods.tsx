import { View, FlatList, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useStripe } from '@stripe/stripe-react-native';
import {
  Screen,
  Card,
  Button,
  CTABar,
  H1,
  Body,
  Muted,
  Row,
  Chip,
} from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';

export default function PaymentMethods() {
  const router = useRouter();
  const { c } = useTheme();
  const list = trpc.payment.listPaymentMethods.useQuery();
  const setup = trpc.payment.setupIntent.useMutation();
  const setDefault = trpc.payment.setDefault.useMutation({
    onSuccess: () => list.refetch(),
  });
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const utils = trpc.useUtils();

  const addCard = async () => {
    try {
      const { setupIntentClientSecret, customerId, ephemeralKey, publishableKey } =
        await setup.mutateAsync();
      if (!publishableKey) {
        Alert.alert('Stripe not configured', 'Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env');
        return;
      }
      const init = await initPaymentSheet({
        setupIntentClientSecret,
        customerId,
        customerEphemeralKeySecret: ephemeralKey,
        merchantDisplayName: 'EdnaCharge',
        allowsDelayedPaymentMethods: false,
      });
      if (init.error) return Alert.alert('Init failed', init.error.message);
      const present = await presentPaymentSheet();
      if (present.error && present.error.code !== 'Canceled') {
        return Alert.alert('Failed', present.error.message);
      }
      await utils.payment.listPaymentMethods.invalidate();
    } catch (err) {
      Alert.alert('Card storage unavailable', (err as Error).message);
    }
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <H1 style={{ marginTop: 14 }}>Payment methods</H1>
      <FlatList
        data={list.data?.paymentMethods ?? []}
        keyExtractor={(pm) => pm.id}
        contentContainerStyle={{ paddingTop: 18, paddingBottom: 130, gap: 10 }}
        ListEmptyComponent={
          <Muted style={{ textAlign: 'center', marginTop: 40 }}>
            {list.isLoading ? 'Loading…' : 'No cards yet.'}
          </Muted>
        }
        renderItem={({ item }) => {
          const isDefault = list.data?.defaultPaymentMethodId === item.id;
          return (
            <Pressable onPress={() => setDefault.mutate({ paymentMethodId: item.id })}>
              <Card padding={14}>
                <Row gap={12}>
                  <View
                    style={{
                      width: 44,
                      height: 30,
                      borderRadius: 6,
                      backgroundColor: c.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Body style={{ color: c.bg, fontSize: 9, fontWeight: '700' }}>
                      {item.brand.slice(0, 4).toUpperCase()}
                    </Body>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: '600', fontSize: 14 }}>
                      •••• {item.last4}
                    </Body>
                    <Muted style={{ fontSize: 11 }}>
                      Exp {String(item.expMonth).padStart(2, '0')}/{String(item.expYear).slice(-2)}
                    </Muted>
                  </View>
                  {isDefault ? <Chip label="Default" variant="green" /> : null}
                </Row>
              </Card>
            </Pressable>
          );
        }}
      />
      <CTABar>
        <Button label="+ Add card" onPress={addCard} loading={setup.isPending} />
      </CTABar>
    </Screen>
  );
}

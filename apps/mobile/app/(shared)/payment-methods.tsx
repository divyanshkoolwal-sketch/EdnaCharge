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
import { handleError } from '../../src/lib/errors';

export default function PaymentMethods() {
  const router = useRouter();
  const { c } = useTheme();
  const list = trpc.payment.listPaymentMethods.useQuery();
  const setup = trpc.payment.setupIntent.useMutation();
  const setDefault = trpc.payment.setDefault.useMutation({
    onSuccess: () => {
      list.refetch();
      // defaultPaymentMethodId lives on the User row; refetch session so any
      // screen that reads it (e.g. booking precondition) sees the new value.
      utils.auth.getSession.invalidate();
    },
    onError: (e) => handleError(e, { feature: 'Payment methods' }),
  });
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const utils = trpc.useUtils();
  const isDevBypass = list.data?.devBypass ?? false;

  const addCard = async () => {
    try {
      const result = await setup.mutateAsync();
      if (result.devBypass) {
        Alert.alert(
          'Dev mode',
          "Card storage is disabled because Stripe keys aren't configured. We'll use a placeholder card for the demo.",
        );
        await utils.payment.listPaymentMethods.invalidate();
        return;
      }
      const { setupIntentClientSecret, customerId, ephemeralKey, publishableKey } = result;
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
      if (init.error) {
        handleError(init.error, { feature: 'Payment methods', title: 'Init failed' });
        return;
      }
      const present = await presentPaymentSheet();
      if (present.error && present.error.code !== 'Canceled') {
        handleError(present.error, { feature: 'Payment methods' });
        return;
      }
      await utils.payment.listPaymentMethods.invalidate();
    } catch (err) {
      handleError(err, { feature: 'Payment methods' });
    }
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <H1 style={{ marginTop: 14 }}>Payment methods</H1>
      {isDevBypass ? (
        <View
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            backgroundColor: c.greenPill,
          }}
        >
          <Body style={{ fontSize: 12, color: c.green2, fontWeight: '700' }}>
            DEV MODE
          </Body>
          <Muted style={{ fontSize: 12, marginTop: 4 }}>
            Stripe keys aren't configured. A placeholder card is in use so the
            demo flow works end-to-end. Real card storage will activate when
            keys are dropped into .env.
          </Muted>
        </View>
      ) : null}
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
            <Pressable
              onPress={() =>
                isDevBypass
                  ? undefined
                  : setDefault.mutate({ paymentMethodId: item.id })
              }
            >
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
        <Button
          label={isDevBypass ? '+ Add card (disabled)' : '+ Add card'}
          onPress={addCard}
          loading={setup.isPending}
          disabled={isDevBypass}
        />
      </CTABar>
    </Screen>
  );
}

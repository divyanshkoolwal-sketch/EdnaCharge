/** @file apps/mobile/app/(shared)/payment-methods.tsx. */
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
  ErrorState,
} from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';
import { handleError } from '../../src/lib/errors';
import { track } from '../../src/lib/analytics';

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
  const detach = trpc.payment.detachPaymentMethod.useMutation({
    onSuccess: () => {
      list.refetch();
      utils.auth.getSession.invalidate();
    },
    onError: (e) => handleError(e, { feature: 'Payment methods' }),
  });
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const utils = trpc.useUtils();
  const isDevBypass = list.data?.devBypass ?? false;

  const confirmRemove = (paymentMethodId: string, last4: string) => {
    Alert.alert(
      'Remove card?',
      `Remove the card ending in ${last4}? You can add it again anytime.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => detach.mutate({ paymentMethodId }),
        },
      ],
    );
  };

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
        Alert.alert('Stripe not configured', 'Set STRIPE_PUBLISHABLE_KEY on the API service.');
        return;
      }
      // The payment sheet uses the app-root StripeProvider key
      // (EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY), but the SetupIntent was created on the
      // API's Stripe account. If those keys are from different accounts (e.g. a
      // test build against a live API), the sheet fails with an opaque "No such
      // setup_intent". Detect it here and surface an actionable message instead.
      const appKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
      if (appKey && publishableKey !== appKey) {
        Alert.alert(
          'Payment configuration mismatch',
          "This app build's Stripe key doesn't match the server's. Card setup can't proceed — please update the app or contact support.",
        );
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
      if (!present.error) track('payment_method_added');
      await utils.payment.listPaymentMethods.invalidate();
    } catch (err) {
      handleError(err, { feature: 'Payment methods' });
    }
  };

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        style={{ paddingTop: 8 }}
      >
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
          list.isError ? (
            <ErrorState
              title="Couldn't load your cards"
              subtitle="Check your connection and try again."
              onRetry={() => list.refetch()}
            />
          ) : (
            <Muted style={{ textAlign: 'center', marginTop: 40 }}>
              {list.isLoading ? 'Loading…' : 'No cards yet.'}
            </Muted>
          )
        }
        renderItem={({ item }) => {
          const isDefault = list.data?.defaultPaymentMethodId === item.id;
          return (
            <Card padding={14}>
              <Row gap={12}>
                {/* Tapping the card body sets it as the default payment method. */}
                <Pressable
                  onPress={() =>
                    isDevBypass ? undefined : setDefault.mutate({ paymentMethodId: item.id })
                  }
                  disabled={isDevBypass || isDefault}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isDefault
                      ? `Card ending ${item.last4}, default`
                      : `Set card ending ${item.last4} as default`
                  }
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
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
                    <Body style={{ fontWeight: '600', fontSize: 14 }}>•••• {item.last4}</Body>
                    <Muted style={{ fontSize: 11 }}>
                      Exp {String(item.expMonth).padStart(2, '0')}/{String(item.expYear).slice(-2)}
                    </Muted>
                  </View>
                  {isDefault ? (
                    <Chip label="Default" variant="green" />
                  ) : !isDevBypass ? (
                    <Muted style={{ fontSize: 11, fontWeight: '600', color: c.muted2 }}>
                      Set default
                    </Muted>
                  ) : null}
                </Pressable>
                {!isDevBypass ? (
                  <Pressable
                    onPress={() => confirmRemove(item.id, item.last4)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove card ending ${item.last4}`}
                  >
                    <Body style={{ color: c.red, fontSize: 13, fontWeight: '600' }}>Remove</Body>
                  </Pressable>
                ) : null}
              </Row>
            </Card>
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

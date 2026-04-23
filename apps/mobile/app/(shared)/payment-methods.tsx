import { View, Text, Pressable, Alert, FlatList } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { trpc } from '../../src/lib/trpc';

export default function PaymentMethods() {
  const list = trpc.payment.listPaymentMethods.useQuery();
  const setup = trpc.payment.setupIntent.useMutation();
  const setDefault = trpc.payment.setDefault.useMutation({
    onSuccess: () => list.refetch(),
  });
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const utils = trpc.useUtils();

  const addCard = async () => {
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
  };

  return (
    <View className="flex-1 bg-white pt-20 px-6">
      <Text className="text-3xl font-bold mb-6">Payment methods</Text>
      <FlatList
        data={list.data?.paymentMethods ?? []}
        keyExtractor={(pm) => pm.id}
        renderItem={({ item }) => {
          const isDefault = list.data?.defaultPaymentMethodId === item.id;
          return (
            <Pressable
              onPress={() => setDefault.mutate({ paymentMethodId: item.id })}
              className={`flex-row items-center justify-between p-4 mb-2 rounded-xl border ${
                isDefault ? 'border-black' : 'border-gray-200'
              }`}
            >
              <Text className="font-medium">
                {item.brand.toUpperCase()} •••• {item.last4}
              </Text>
              {isDefault ? <Text className="text-green-700">Default</Text> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text className="text-gray-500">No cards yet.</Text>}
      />
      <Pressable onPress={addCard} className="mt-4 bg-black rounded-full py-4 items-center">
        <Text className="text-white font-semibold">Add card</Text>
      </Pressable>
    </View>
  );
}

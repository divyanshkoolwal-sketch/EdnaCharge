import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';

export default function ChargerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = trpc.charger.get.useQuery({ id: id! }, { enabled: !!id });

  if (q.isLoading) return <Center><ActivityIndicator /></Center>;
  if (q.error) return <Center><Text>{q.error.message}</Text></Center>;
  const c = q.data!;

  const pricing = c.pricePerKwhCents
    ? `$${(c.pricePerKwhCents / 100).toFixed(2)}/kWh`
    : c.pricePerHourCents
      ? `$${(c.pricePerHourCents / 100).toFixed(2)}/hr`
      : '—';

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text className="text-3xl font-bold">{c.title}</Text>
      <Text className="text-gray-600 mt-1">
        Host: {c.host.fullName} · {c.connectorType.toUpperCase()} · {c.powerKw} kW
      </Text>
      <Text className="mt-2">{pricing}</Text>

      <Section title="Availability">
        <Text>{c.status === 'available' ? 'Available now' : c.status}</Text>
      </Section>

      {c.houseRules ? (
        <Section title="House rules">
          <Text>{c.houseRules}</Text>
        </Section>
      ) : null}

      <Section title="Recent reviews">
        {c.hostReviews.length === 0 ? (
          <Text className="text-gray-500">No reviews yet.</Text>
        ) : (
          c.hostReviews.map((r: { id: string; stars: number; text: string | null }) => (
            <View key={r.id} className="mb-2">
              <Text>⭐️ {r.stars} — {r.text ?? ''}</Text>
            </View>
          ))
        )}
      </Section>

      <Pressable
        onPress={() =>
          router.push({ pathname: '/(driver)/request/[chargerId]', params: { chargerId: c.id } })
        }
        className="mt-6 bg-black rounded-full py-4 items-center"
      >
        <Text className="text-white font-semibold">Request booking</Text>
      </Pressable>
    </ScrollView>
  );
}

const Center = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-1 items-center justify-center bg-white">{children}</View>
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-6">
      <Text className="text-sm text-gray-500 mb-2">{title}</Text>
      {children}
    </View>
  );
}

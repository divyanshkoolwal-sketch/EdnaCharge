import { View, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  H1,
  Card,
  Body,
  Muted,
  StatusPill,
  type Status,
  Row,
  Button,
} from '../../src/components/ui';
import { ChevronRight } from '../../src/components/icons/Icon';
import { ChargerIllo } from '../../src/components/illustrations/HomeCharger';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';

export default function HostChargers() {
  const router = useRouter();
  const { c } = useTheme();
  const q = trpc.charger.myChargers.useQuery();

  return (
    <Screen flush>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <H1 style={{ marginTop: 14 }}>Your chargers</H1>
      </View>
      <FlatList
        data={q.data ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 24, paddingTop: 16, gap: 10, paddingBottom: 100 }}
        ListEmptyComponent={
          <Muted style={{ textAlign: 'center', marginTop: 40 }}>
            {q.isLoading ? 'Loading…' : 'No chargers yet.'}
          </Muted>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/(host)/charger/[id]', params: { id: item.id } })
            }
          >
            <Card padding={14}>
              <Row gap={12}>
                <View style={{ width: 64 }}>
                  <ChargerIllo height={64} />
                </View>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700', fontSize: 14 }}>{item.title}</Body>
                  <Muted style={{ fontSize: 11, marginTop: 2 }}>
                    {item.addressLine1}, {item.city}
                  </Muted>
                  <Muted style={{ fontSize: 11 }}>
                    {item.connectorType.toUpperCase()} · {item.powerKw} kW
                  </Muted>
                  <View style={{ marginTop: 6 }}>
                    <StatusPill status={item.status as Status} />
                  </View>
                </View>
                <ChevronRight color={c.muted2} />
              </Row>
            </Card>
          </Pressable>
        )}
        ListFooterComponent={
          <Button
            label="+ Add another charger"
            onPress={() => router.push('/(host)/add-charger')}
            style={{ marginTop: 18 }}
          />
        }
      />
    </Screen>
  );
}

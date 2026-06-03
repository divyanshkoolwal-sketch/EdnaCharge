import { View, Pressable, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { handleError } from '../../src/lib/errors';
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
  List,
} from '../../src/components/ui';
import { ChevronRight } from '../../src/components/icons/Icon';
import { ChargerIllo } from '../../src/components/illustrations/HomeCharger';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';

type ChargerRow = {
  id: string;
  title: string;
  addressLine1: string;
  city: string;
  connectorType: string;
  powerKw: number;
  status: string;
  published: boolean;
};

export default function HostChargers() {
  const router = useRouter();
  const { c } = useTheme();
  const utils = trpc.useUtils();
  const q = trpc.charger.myChargers.useQuery();
  const setOnline = trpc.charger.setOnline.useMutation({
    onSuccess: () => {
      utils.charger.myChargers.invalidate();
      utils.charger.nearby.invalidate();
    },
    onError: (e) => handleError(e, { feature: 'Charger status' }),
  });

  return (
    <Screen flush>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <H1 style={{ marginTop: 14 }}>Your chargers</H1>
        <Muted style={{ marginTop: 4, fontSize: 12 }}>
          Toggle a charger online to make it visible to drivers nearby.
        </Muted>
      </View>
      <List
        data={(q.data ?? []) as ChargerRow[]}
        keyExtractor={(c) => c.id}
        estimatedItemSize={210}
        gap={10}
        contentContainerStyle={{ padding: 24, paddingTop: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <Muted style={{ textAlign: 'center', marginTop: 40 }}>
            {q.isLoading ? 'Loading…' : 'No chargers yet.'}
          </Muted>
        }
        renderItem={({ item }) => {
          const online = item.published;
          return (
            <Card padding={14}>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/(host)/charger/[id]', params: { id: item.id } })
                }
              >
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
              </Pressable>

              {/* Online/offline toggle inline on each row. */}
              <View
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: c.line,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Body style={{ fontSize: 13, fontWeight: '600' }}>
                    {online ? 'Online · visible on the map' : 'Offline · hidden from drivers'}
                  </Body>
                  <Muted style={{ fontSize: 11, marginTop: 2 }}>
                    {online
                      ? 'Drivers can find and book this charger right now.'
                      : "Drivers won't see this charger until you turn it back on."}
                  </Muted>
                </View>
                <Switch
                  value={online}
                  onValueChange={(next) => {
                    if (!next) {
                      Alert.alert(
                        'Take this charger offline?',
                        "Drivers won't see it on the map until you turn it back on. Existing bookings still complete.",
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Take offline',
                            style: 'destructive',
                            onPress: () => setOnline.mutate({ id: item.id, online: false }),
                          },
                        ],
                      );
                    } else {
                      setOnline.mutate({ id: item.id, online: true });
                    }
                  }}
                  trackColor={{ true: '#6BB36C', false: '#D6D6D9' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#D6D6D9"
                  disabled={setOnline.isPending}
                />
              </View>
            </Card>
          );
        }}
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

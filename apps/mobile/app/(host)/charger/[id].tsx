/** Host charger detail screen for visibility, pricing, and OCPP setup. */
import { Alert, Pressable, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Card,
  FrameSoft,
  H1,
  Body,
  Muted,
  Row,
  StatusPill,
  type Status,
  TierBadge,
  Button,
  SectionHeader,
  ErrorState,
} from '../../../src/components/ui';
import { ChevronLeft } from '../../../src/components/icons/Icon';
import { ChargerIllo } from '../../../src/components/illustrations/HomeCharger';
import { useTheme } from '../../../src/theme/useTheme';
import { trpc } from '../../../src/lib/trpc';
import { handleError } from '../../../src/lib/errors';
import { ConnectChargerCard } from '../../../src/features/chargers/ConnectChargerCard';

function tierForCharger(t: string): string {
  const m = /tier_(\d)/.exec(t);
  return m ? m[1]! : '?';
}

export default function HostChargerEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const utils = trpc.useUtils();
  const q = trpc.charger.get.useQuery({ id: id! }, { enabled: !!id });

  // Online/offline toggle — visible-on-map vs hidden-from-drivers.
  const setOnline = trpc.charger.setOnline.useMutation({
    onSuccess: () => {
      utils.charger.myChargers.invalidate();
      utils.charger.nearby.invalidate();
      utils.charger.get.invalidate({ id: id! });
    },
    onError: (e) => handleError(e, { feature: 'Charger status' }),
  });

  // Permanent unlist — kept around for fully decommissioning a charger.
  const unlist = trpc.charger.unlist.useMutation({
    onSuccess: () => {
      utils.charger.myChargers.invalidate();
      utils.charger.nearby.invalidate();
      utils.charger.get.invalidate({ id: id! });
      router.back();
    },
    onError: (e) => handleError(e, { feature: 'Unlist' }),
  });

  if (q.isError) {
    return (
      <Screen>
        <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }} hitSlop={10}>
          <ChevronLeft />
        </Pressable>
        <ErrorState onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  if (!q.data)
    return (
      <Screen>
        <View />
      </Screen>
    );
  const ch = q.data;
  const isUnlisted = !ch.published;

  const confirmUnlist = () => {
    Alert.alert(
      'Unlist this charger?',
      "Drivers won't see it on the map anymore. Existing bookings still complete normally.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlist',
          style: 'destructive',
          onPress: () => unlist.mutate({ id: id! }),
        },
      ],
    );
  };

  return (
    <Screen scroll contentStyle={{ paddingBottom: 30 }}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={{ paddingTop: 8 }}
      >
        <ChevronLeft />
      </Pressable>

      <View style={{ marginTop: 14 }}>
        <ChargerIllo height={140} />
      </View>
      <H1 style={{ marginTop: 14, fontSize: 22 }}>{ch.title}</H1>
      <Button
        label="Edit details"
        variant="secondary"
        height={40}
        fontSize={13}
        onPress={() =>
          router.push({ pathname: '/(host)/charger/edit/[id]', params: { id: ch.id } })
        }
        style={{ marginTop: 12 }}
      />
      <Row gap={6} style={{ marginTop: 4 }}>
        <Muted>
          {ch.addressLine1}, {ch.city}
        </Muted>
        <TierBadge tier={tierForCharger(ch.hardwareTier)} />
      </Row>

      <SectionHeader>Hardware</SectionHeader>
      <FrameSoft>
        <Row between style={{ marginBottom: 4 }}>
          <Muted>Connector</Muted>
          <Body>{ch.connectorType.toUpperCase()}</Body>
        </Row>
        <Row between>
          <Muted>Power</Muted>
          <Body>{ch.powerKw} kW</Body>
        </Row>
      </FrameSoft>

      <SectionHeader>Pricing</SectionHeader>
      <FrameSoft>
        <Row between>
          <Body style={{ fontWeight: '700' }}>
            ${ch.currentRateCents != null ? (ch.currentRateCents / 100).toFixed(2) : '—'}
          </Body>
          <Muted>/kWh now</Muted>
        </Row>
        <Muted style={{ fontSize: 12, marginTop: 8 }}>
          Set automatically by demand — you earn more at peak hours. You keep 85% of every session.
        </Muted>
      </FrameSoft>

      {ch.hardwareTier === 'tier_3_native' ? <ConnectChargerCard chargerId={ch.id} /> : null}

      <SectionHeader>Visibility</SectionHeader>
      <Card padding={14}>
        <Row between>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Body style={{ fontWeight: '700', fontSize: 14 }}>
              {ch.published ? 'Online' : 'Offline'}
            </Body>
            <Muted style={{ fontSize: 12, marginTop: 2 }}>
              {ch.published
                ? 'Drivers near you can find and book this charger.'
                : 'This charger is hidden from drivers on the map.'}
            </Muted>
          </View>
          <Switch
            value={ch.published}
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
                      onPress: () => setOnline.mutate({ id: id!, online: false }),
                    },
                  ],
                );
              } else {
                setOnline.mutate({ id: id!, online: true });
              }
            }}
            trackColor={{ true: '#6BB36C', false: '#D6D6D9' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#D6D6D9"
            disabled={setOnline.isPending}
          />
        </Row>
        <View
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: '#0F0F1010',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Muted style={{ fontSize: 12 }}>Current state:</Muted>
          <StatusPill status={ch.status as Status} />
        </View>
      </Card>

      <Button
        label={isUnlisted ? 'Already unlisted' : 'Unlist this charger'}
        variant="destructive-outline"
        height={44}
        fontSize={13}
        disabled={isUnlisted || unlist.isPending}
        loading={unlist.isPending}
        onPress={confirmUnlist}
        style={{ marginTop: 18 }}
      />
    </Screen>
  );
}

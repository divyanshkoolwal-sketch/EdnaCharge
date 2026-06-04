import { Alert, Pressable, Switch, Text, View } from 'react-native';
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
} from '../../../src/components/ui';
import { ChevronLeft, Edit } from '../../../src/components/icons/Icon';
import { ChargerIllo } from '../../../src/components/illustrations/HomeCharger';
import { useTheme } from '../../../src/theme/useTheme';
import { trpc } from '../../../src/lib/trpc';
import { handleError } from '../../../src/lib/errors';

function tierForCharger(t: string): string {
  const m = /tier_(\d)/.exec(t);
  return m ? m[1]! : '?';
}

// Live OCPP connection card. Polls connectionStatus so the host sees their
// charger flip to "Connected" the moment it dials into the CSMS. Credentials are
// viewed on demand (stable — viewing never rotates them); a separate, confirmed
// "Regenerate" action rotates them when the host deliberately wants new ones.
function ConnectChargerCard({ chargerId }: { chargerId: string }) {
  const { c } = useTheme();
  const status = trpc.charger.connectionStatus.useQuery(
    { id: chargerId },
    { refetchInterval: 5000 },
  );
  const details = trpc.charger.connectionDetails.useQuery(
    { id: chargerId },
    { enabled: false, retry: false },
  );
  const regen = trpc.charger.regenerateOcppCredentials.useMutation({
    onSuccess: () => details.refetch(),
    onError: (e) => handleError(e, { feature: 'OCPP credentials' }),
  });

  const connected = status.data?.connected ?? false;
  const creds = details.data;

  const confirmRegen = () =>
    Alert.alert(
      'Regenerate credentials?',
      "This creates a new password and invalidates the current one. If your charger is already configured, you'll need to update it with the new password.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', style: 'destructive', onPress: () => regen.mutate({ id: chargerId }) },
      ],
    );

  return (
    <>
      <SectionHeader>Connect your charger</SectionHeader>
      <Card padding={14}>
        <Row between>
          <Row gap={8}>
            <View
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: connected ? c.green2 : '#D4A82A',
              }}
            />
            <Body style={{ fontWeight: '700', fontSize: 14 }}>
              {connected ? 'Connected' : 'Waiting for your charger…'}
            </Body>
          </Row>
          {connected && status.data?.lastConnectedAt ? (
            <Muted style={{ fontSize: 11 }}>
              since {new Date(status.data.lastConnectedAt).toLocaleTimeString()}
            </Muted>
          ) : null}
        </Row>
        <Muted style={{ fontSize: 12, marginTop: 8, lineHeight: 18 }}>
          In your charger's OCPP settings, choose OCPP 1.6 (JSON over WebSocket) and enter the
          server URL, charge point ID, and password below. It'll show as connected here within a
          few seconds.
        </Muted>

        {creds ? (
          <View style={{ marginTop: 12, gap: 10 }}>
            <CredRow label="Server URL (OCPP 1.6J)" value={creds.wssUrl} />
            <CredRow label="Charge point ID" value={creds.chargePointId} />
            <CredRow label="Password" value={creds.password} />
            <Button
              label={regen.isPending ? 'Regenerating…' : 'Regenerate credentials'}
              variant="secondary"
              onPress={confirmRegen}
              loading={regen.isPending}
              height={40}
              fontSize={12}
            />
          </View>
        ) : (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Button
              label={details.isFetching ? 'Loading…' : 'Show connection details'}
              variant="secondary"
              onPress={() => details.refetch()}
              loading={details.isFetching}
              height={44}
              fontSize={13}
            />
            {details.error && !details.isFetching ? (
              <Button
                label={regen.isPending ? 'Regenerating…' : 'Regenerate credentials'}
                variant="secondary"
                onPress={confirmRegen}
                loading={regen.isPending}
                height={40}
                fontSize={12}
              />
            ) : null}
          </View>
        )}
      </Card>
    </>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View>
      <Muted style={{ fontSize: 11, marginBottom: 3 }}>{label}</Muted>
      <View
        style={{
          backgroundColor: c.chip,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 9,
        }}
      >
        <Text selectable style={{ fontSize: 13, color: c.ink, fontFamily: 'Courier' }}>
          {value}
        </Text>
      </View>
    </View>
  );
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

  if (!q.data) return <Screen><View /></Screen>;
  const ch = q.data;
  const isUnlisted = !ch.published;

  const confirmUnlist = () => {
    Alert.alert(
      'Unlist this charger?',
      'Drivers won\'t see it on the map anymore. Existing bookings still complete normally.',
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
      <Row between style={{ paddingTop: 8 }}>
        <Pressable onPress={() => router.back()}>
          <ChevronLeft />
        </Pressable>
        <Pressable>
          <Edit color={c.ink} />
        </Pressable>
      </Row>

      <View style={{ marginTop: 14 }}>
        <ChargerIllo height={140} />
      </View>
      <H1 style={{ marginTop: 14, fontSize: 22 }}>{ch.title}</H1>
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
            $
            {ch.pricePerKwhCents
              ? (ch.pricePerKwhCents / 100).toFixed(2)
              : ch.pricePerHourCents
                ? (ch.pricePerHourCents / 100).toFixed(2)
                : '—'}
          </Body>
          <Muted>{ch.pricePerKwhCents ? '/kWh' : '/hour'}</Muted>
        </Row>
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
                : "This charger is hidden from drivers on the map."}
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
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#0F0F1010', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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

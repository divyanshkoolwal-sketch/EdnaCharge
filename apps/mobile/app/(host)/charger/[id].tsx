import { Alert, Pressable, View } from 'react-native';
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

export default function HostChargerEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const utils = trpc.useUtils();
  const q = trpc.charger.get.useQuery({ id: id! }, { enabled: !!id });

  const ocpp = trpc.charger.ocppCredentials.useMutation();

  // Soft-unlist via dedicated server procedure. We don't truly delete because
  // completed bookings + receipts must remain referenceable.
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

  const revealCreds = () => {
    ocpp.mutate(
      { id: id! },
      {
        onSuccess: (d) =>
          Alert.alert(
            'OCPP credentials',
            `URL: ${d.wssUrl}\nID: ${d.chargePointId}\nPassword: ${d.password}\n\nPaste these into your charger's admin panel.`,
          ),
        onError: (e) => handleError(e, { feature: 'OCPP credentials' }),
      },
    );
  };

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
        <Row between style={{ marginBottom: 4 }}>
          <Muted>Power</Muted>
          <Body>{ch.powerKw} kW</Body>
        </Row>
        <Row between>
          <Muted>Tier</Muted>
          <Body>{ch.hardwareTier.replace('tier_', 'Tier ').replace('_', ' ')}</Body>
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

      <SectionHeader>Status</SectionHeader>
      <Card padding={12}>
        <Row gap={10}>
          <StatusPill status={ch.status as Status} />
          <View style={{ flex: 1 }} />
          <Body style={{ fontSize: 12, fontWeight: '600' }}>
            {isUnlisted ? 'Unlisted' : 'Live'}
          </Body>
        </Row>
      </Card>

      {ch.hardwareTier === 'tier_3_native' ? (
        <Button
          label="Reveal OCPP credentials"
          variant="secondary"
          onPress={revealCreds}
          loading={ocpp.isPending}
          height={44}
          fontSize={13}
          style={{ marginTop: 18 }}
        />
      ) : null}
      <Button
        label={isUnlisted ? 'Already unlisted' : 'Unlist this charger'}
        variant="destructive-outline"
        height={44}
        fontSize={13}
        disabled={isUnlisted || unlist.isPending}
        loading={unlist.isPending}
        onPress={confirmUnlist}
        style={{ marginTop: 10 }}
      />
    </Screen>
  );
}

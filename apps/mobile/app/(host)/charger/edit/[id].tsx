/** @file apps/mobile/app/(host)/charger/edit/[id].tsx. */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ConnectorType } from '@edna/schemas';
import {
  Screen,
  Card,
  Input,
  Button,
  CTABar,
  H1,
  Label,
  Row,
  Chip,
  ErrorState,
  useToast,
} from '../../../../src/components/ui';
import { ChevronLeft } from '../../../../src/components/icons/Icon';
import { trpc } from '../../../../src/lib/trpc';
import { handleError } from '../../../../src/lib/errors';

const CONNECTORS: ConnectorType[] = ['j1772', 'nacs', 'tesla', 'ccs1', 'chademo'];

type AvailabilityWindow = { dow: number; start: string; end: string };

const AVAILABILITY: Record<'all' | 'weekdays' | 'evenings', AvailabilityWindow[]> = {
  // Empty array = always available (the server treats [] as 24/7). This avoids
  // the old `23:59` exclusive-end preset, which left a one-minute gap at end of
  // day and rejected any booking window crossing midnight.
  all: [],
  weekdays: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: '08:00', end: '22:00' })),
  evenings: [
    ...[1, 2, 3, 4, 5].map((dow) => ({ dow, start: '17:00', end: '22:00' })),
    ...[0, 6].map((dow) => ({ dow, start: '08:00', end: '22:00' })),
  ],
};

type AvailabilityPreset = keyof typeof AVAILABILITY;

function parseAvailability(value: unknown): AvailabilityWindow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) =>
    row &&
    typeof row === 'object' &&
    typeof (row as AvailabilityWindow).dow === 'number' &&
    typeof (row as AvailabilityWindow).start === 'string' &&
    typeof (row as AvailabilityWindow).end === 'string'
      ? [
          {
            dow: (row as AvailabilityWindow).dow,
            start: (row as AvailabilityWindow).start,
            end: (row as AvailabilityWindow).end,
          },
        ]
      : [],
  );
}

function sameWindows(a: AvailabilityWindow[], b: AvailabilityWindow[]): boolean {
  return (
    a.length === b.length &&
    a.every((w, i) => w.dow === b[i]?.dow && w.start === b[i]?.start && w.end === b[i]?.end)
  );
}

export default function HostChargerEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const utils = trpc.useUtils();
  const q = trpc.charger.get.useQuery({ id: id! }, { enabled: !!id });
  const update = trpc.charger.update.useMutation({
    onSuccess: () => {
      utils.charger.get.invalidate({ id: id! });
      utils.charger.myChargers.invalidate();
      utils.charger.nearby.invalidate();
      toast.show('Charger updated', 'success');
      router.back();
    },
    onError: (e) => handleError(e, { feature: 'Edit charger' }),
  });

  const [title, setTitle] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [stateAbbr, setStateAbbr] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [connectorType, setConnectorType] = useState<ConnectorType>('j1772');
  const [powerKw, setPowerKw] = useState('7.2');
  const [gateCode, setGateCode] = useState('');
  const [houseRules, setHouseRules] = useState('');
  const [availability, setAvailability] = useState<AvailabilityWindow[]>([]);

  useEffect(() => {
    const ch = q.data;
    if (!ch) return;
    setTitle(ch.title);
    setAddressLine1(ch.addressLine1);
    setCity(ch.city);
    setStateAbbr(ch.state);
    setPostalCode(ch.postalCode);
    setConnectorType(ch.connectorType);
    setPowerKw(String(ch.powerKw));
    setGateCode(ch.gateCode ?? '');
    setHouseRules(ch.houseRules ?? '');
    // Load the charger's ACTUAL saved schedule so editing another field never
    // silently overwrites it. A schedule that matches no preset is preserved.
    setAvailability(parseAvailability(ch.availability));
  }, [q.data]);

  const selectedPreset: AvailabilityPreset | null =
    (Object.keys(AVAILABILITY) as AvailabilityPreset[]).find((k) =>
      sameWindows(availability, AVAILABILITY[k]),
    ) ?? null;

  const parsedPower = Number(powerKw);
  const formValid = useMemo(
    () =>
      title.trim().length >= 3 &&
      addressLine1.trim().length > 0 &&
      city.trim().length > 0 &&
      stateAbbr.trim().length > 0 &&
      postalCode.trim().length >= 3 &&
      Number.isFinite(parsedPower) &&
      parsedPower > 0 &&
      parsedPower <= 50,
    [addressLine1, city, parsedPower, postalCode, stateAbbr, title],
  );

  const save = () => {
    const ch = q.data;
    if (!ch) return;
    if (!formValid) {
      Alert.alert('Check the form', 'Fill in the required charger details.');
      return;
    }
    update.mutate({
      id: ch.id,
      patch: {
        title: title.trim(),
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        state: stateAbbr.trim(),
        postalCode: postalCode.trim(),
        country: ch.country,
        lat: ch.lat,
        lng: ch.lng,
        connectorType,
        powerKw: parsedPower,
        // Send null (not undefined) when erased so an intentional clear is
        // persisted — undefined would be dropped from the patch and keep the
        // old value.
        gateCode: gateCode.trim() || null,
        houseRules: houseRules.trim() || null,
        availability,
      },
    });
  };

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

  return (
    <Screen keyboardAvoiding contentStyle={{ paddingBottom: 130 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }} hitSlop={10}>
        <ChevronLeft />
      </Pressable>
      <H1 style={{ marginTop: 14 }}>Edit charger</H1>
      <View style={{ marginTop: 18, gap: 12 }}>
        <Input value={title} onChangeText={setTitle} placeholder="Title" />
        <Input value={addressLine1} onChangeText={setAddressLine1} placeholder="Street address" />
        <Row gap={8}>
          <View style={{ flex: 2 }}>
            <Input value={city} onChangeText={setCity} placeholder="City" />
          </View>
          <View style={{ flex: 1 }}>
            <Input value={stateAbbr} onChangeText={setStateAbbr} placeholder="ST" />
          </View>
          <View style={{ flex: 1 }}>
            <Input value={postalCode} onChangeText={setPostalCode} placeholder="ZIP" />
          </View>
        </Row>
        <View>
          <Label style={{ marginBottom: 8 }}>CONNECTOR</Label>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {CONNECTORS.map((cn) => (
              <Chip
                key={cn}
                label={cn.toUpperCase()}
                variant="outline"
                selected={connectorType === cn}
                onPress={() => setConnectorType(cn)}
              />
            ))}
          </Row>
        </View>
        <Input
          value={powerKw}
          onChangeText={setPowerKw}
          keyboardType="decimal-pad"
          placeholder="Power kW"
        />
        <Input value={gateCode} onChangeText={setGateCode} placeholder="Gate code" maxLength={32} />
        <Input
          value={houseRules}
          onChangeText={setHouseRules}
          placeholder="House rules"
          multiline
          maxLength={500}
          style={{ minHeight: 76, height: undefined, paddingTop: 14 }}
        />
        <Card padding={14}>
          <Label style={{ marginBottom: 10 }}>AVAILABILITY</Label>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <Chip
              label="All week"
              selected={selectedPreset === 'all'}
              onPress={() => setAvailability([...AVAILABILITY.all])}
            />
            <Chip
              label="Weekdays"
              selected={selectedPreset === 'weekdays'}
              onPress={() => setAvailability([...AVAILABILITY.weekdays])}
            />
            <Chip
              label="Evenings"
              selected={selectedPreset === 'evenings'}
              onPress={() => setAvailability([...AVAILABILITY.evenings])}
            />
          </Row>
          {selectedPreset === null ? (
            <Label style={{ marginTop: 8, opacity: 0.7 }}>
              Custom schedule kept. Pick a preset above to change it.
            </Label>
          ) : null}
        </Card>
      </View>
      <CTABar>
        <Button
          label="Save"
          loading={update.isPending}
          disabled={!formValid || update.isPending}
          onPress={save}
        />
      </CTABar>
    </Screen>
  );
}

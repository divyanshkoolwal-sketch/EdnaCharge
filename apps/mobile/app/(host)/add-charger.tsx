/** Host screen for publishing a new OCPP charger listing. */
import { useEffect, useRef, useState } from 'react';
import { View, Pressable, Alert, ActivityIndicator, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { handleError } from '../../src/lib/errors';
import {
  Screen,
  Card,
  Input,
  Button,
  CTABar,
  H1,
  Muted,
  Label,
  Chip,
  Row,
  useToast,
} from '../../src/components/ui';
import { ChevronLeft, Bolt } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { useUserLocation } from '../../src/state/userLocation';
import { hostEntryRoute } from '../../src/lib/hostEntry';
import { trpc } from '../../src/lib/trpc';
import { track } from '../../src/lib/analytics';
import type { ConnectorType } from '@edna/schemas';
import { AddChargerGate } from '../../src/features/chargers/AddChargerGate';
import {
  ChargerLocationPicker,
  type ChargerCameraRef,
} from '../../src/features/chargers/ChargerLocationPicker';

const CONNECTORS: ConnectorType[] = ['j1772', 'nacs', 'tesla', 'ccs1', 'chademo'];

export default function AddCharger() {
  const router = useRouter();
  const { c } = useTheme();
  const scheme = useColorScheme();
  const session = trpc.auth.getSession.useQuery();
  const utils = trpc.useUtils();
  const userCoords = useUserLocation((s) => s.coords);
  const toast = useToast();
  const cameraRef = useRef<ChargerCameraRef>(null);
  const create = trpc.charger.create.useMutation({
    onSuccess: (ch) => {
      utils.charger.nearby.invalidate();
      utils.charger.myChargers.invalidate();
      utils.auth.getSession.invalidate();
      track('charger_published', { chargerId: ch.id, connectorType: ch.connectorType });
      // The charger is created UNPUBLISHED/offline — it goes live only after the
      // host connects it to the CSMS on the detail screen. Don't claim "published".
      // Toast persists across navigation (provider is above the navigator).
      toast.show('Charger added — connect it to go live', 'success');
      // v1 is OCPP-only: every charger lands on its detail screen, where the
      // host connects it to the CSMS.
      router.replace({ pathname: '/(host)/charger/[id]', params: { id: ch.id } });
    },
    onError: (e) => handleError(e, { feature: 'Add charger' }),
  });

  const [title, setTitle] = useState('My home charger');
  const [addr, setAddr] = useState('');
  // Address fields start EMPTY — hardcoded city/state/zip defaults silently
  // geocoded a non-local host tens of km off their pin and failed server-side.
  const [city, setCity] = useState('');
  const [stateAbbr, setStateAbbr] = useState('');
  const [zip, setZip] = useState('');
  // Default the map pin to the user's current location if known, else a regional
  // center. Numeric state — keeps Mapbox + Number() coercion clean.
  const [lat, setLat] = useState<number>(userCoords?.lat ?? 37.6624);
  const [lng, setLng] = useState<number>(userCoords?.lng ?? -121.8747);
  // The host must EXPLICITLY confirm the pin (via the picker) — seeding it from
  // GPS is only a convenience, not a confirmation that it's on the charger.
  const [pinConfirmed, setPinConfirmed] = useState(false);

  useEffect(() => {
    // If we get a real user location after mount and the host hasn't moved
    // the pin yet (defaults still in place), recenter to them.
    if (userCoords && lat === 37.6624 && lng === -121.8747) {
      setLat(userCoords.lat);
      setLng(userCoords.lng);
      cameraRef.current?.setCamera({
        centerCoordinate: [userCoords.lng, userCoords.lat],
        zoomLevel: 15,
        animationDuration: 400,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCoords]);
  const [connector, setConn] = useState<ConnectorType>('j1772');
  const [powerKw, setPower] = useState('7.2');
  const [gateCode, setGateCode] = useState('');
  const parsedPowerKw = Number(powerKw);
  // Only an explicit pin confirmation counts (the picker clears this on any map
  // move), so a mis-dragged pin can't silently pass client validation.
  const locationConfirmed = pinConfirmed;
  const formValid =
    title.trim().length >= 3 &&
    addr.trim().length > 0 &&
    city.trim().length > 0 &&
    stateAbbr.trim().length > 0 &&
    zip.trim().length >= 3 &&
    Number.isFinite(parsedPowerKw) &&
    parsedPowerKw > 0 &&
    parsedPowerKw <= 50 &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    locationConfirmed;

  const submit = () => {
    if (title.trim().length < 3) return Alert.alert('Missing', 'Add a charger title.');
    if (!addr.trim()) return Alert.alert('Missing', 'Address is required.');
    if (!city.trim() || !stateAbbr.trim() || zip.trim().length < 3) {
      return Alert.alert('Missing', 'City, state, and ZIP are required.');
    }
    if (!Number.isFinite(parsedPowerKw) || parsedPowerKw <= 0 || parsedPowerKw > 50) {
      return Alert.alert('Invalid power', 'Enter a charger power rating between 0 and 50 kW.');
    }
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return Alert.alert('Invalid location', 'Move the pin to a valid charger location.');
    }
    if (!locationConfirmed) {
      return Alert.alert(
        'Confirm location',
        'Move the map pin to your charger, then tap Use this pin.',
      );
    }
    create.mutate({
      title: title.trim(),
      addressLine1: addr.trim(),
      city: city.trim(),
      state: stateAbbr.trim(),
      postalCode: zip.trim(),
      country: 'US',
      lat,
      lng,
      gateCode: gateCode.trim() || undefined,
      connectorType: connector,
      powerKw: parsedPowerKw,
      // v1 is OCPP-only — always a metered, per-kWh Tier 3 charger.
      hardwareTier: 'tier_3_native',
      // Pricing is set automatically by demand — hosts don't enter a rate.
      instantAvailable: true,
      availability: [],
    });
  };

  // Host-readiness gate. The host UI is reachable via a client-side role flag,
  // but the server only lets a user PUBLISH once they're a real host: Stripe
  // Connect payouts complete (grants the `host` role) AND identity verified.
  // Rather than let them fill the whole form and hit a dead-end "Not a host"
  // on Publish, gate here and route them to finish the missing step. These two
  // checks mirror the server's assertHost() exactly.
  const me = session.data;
  const isHost = !!me?.roles?.includes('host');
  const idVerified = me?.identityVerification?.status === 'verified';

  if (session.isLoading || !me) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (!isHost || !idVerified) {
    const needsPayouts = !isHost;
    return (
      <AddChargerGate
        needsPayouts={needsPayouts}
        onBack={() => router.back()}
        onContinue={() =>
          needsPayouts
            ? router.push(hostEntryRoute(me) as never)
            : router.push({
                pathname: '/(shared)/identity-verification',
                params: { next: '/(host)/add-charger' },
              } as never)
        }
      />
    );
  }

  return (
    <Screen keyboardAvoiding contentStyle={{ paddingBottom: 130 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      {/* This is a single-screen form, not a 5-step wizard — the old
            "STEP 4 OF 5" stepper was misleading. */}
      <View style={{ marginTop: 12 }}>
        <Label>LIST YOUR CHARGER</Label>
      </View>
      <H1 style={{ marginTop: 14 }}>List your charger</H1>
      <Card padding={16} style={{ marginTop: 16 }}>
        <Row gap={8} style={{ alignItems: 'center', marginBottom: 6 }}>
          <Bolt size={16} color={c.green2} />
          <Label style={{ color: c.green2 }}>AUTOMATIC PRICING</Label>
        </Row>
        <Muted style={{ fontSize: 13, lineHeight: 20 }}>
          EdnaCharge sets a fair market rate automatically based on demand and time of day — you
          earn more at peak hours and never have to manage prices. Drivers pay for the exact energy
          your charger meters, and you keep 85% of every session.
        </Muted>
      </Card>

      <View style={{ marginTop: 24, gap: 12 }}>
        <View>
          <Label style={{ marginBottom: 8 }}>TITLE</Label>
          <Input value={title} onChangeText={setTitle} />
        </View>
        <View>
          <Label style={{ marginBottom: 8 }}>ADDRESS</Label>
          <Input value={addr} onChangeText={setAddr} placeholder="14 Maple St" />
        </View>
        <Row gap={8}>
          <View style={{ flex: 2 }}>
            <Input value={city} onChangeText={setCity} placeholder="City" />
          </View>
          <View style={{ flex: 1 }}>
            <Input value={stateAbbr} onChangeText={setStateAbbr} placeholder="ST" />
          </View>
          <View style={{ flex: 1 }}>
            <Input value={zip} onChangeText={setZip} placeholder="ZIP" />
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
                selected={connector === cn}
                onPress={() => setConn(cn)}
              />
            ))}
          </Row>
        </View>
        <View>
          <Label style={{ marginBottom: 8 }}>POWER (kW)</Label>
          <Input
            value={powerKw}
            onChangeText={setPower}
            keyboardType="decimal-pad"
            placeholder="7.2"
          />
        </View>
        <View>
          <Label style={{ marginBottom: 8 }}>GATE CODE (OPTIONAL)</Label>
          <Muted style={{ fontSize: 11, marginBottom: 6 }}>
            Shared automatically with drivers once their booking is confirmed. Leave blank if not
            needed.
          </Muted>
          <Input
            value={gateCode}
            onChangeText={setGateCode}
            placeholder="e.g. 1234"
            autoCapitalize="characters"
            maxLength={32}
          />
        </View>
        <ChargerLocationPicker
          cameraRef={cameraRef}
          scheme={scheme}
          lat={lat}
          lng={lng}
          pinConfirmed={pinConfirmed}
          setLat={setLat}
          setLng={setLng}
          setPinConfirmed={setPinConfirmed}
        />
      </View>
      <CTABar>
        <Button
          label="Publish charger"
          loading={create.isPending}
          disabled={!formValid || create.isPending}
          onPress={submit}
        />
      </CTABar>
    </Screen>
  );
}

import { useEffect, useRef, useState } from 'react';
import { View, Pressable, ScrollView, Alert, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import Mapbox, {
  MapView,
  Camera,
  PointAnnotation,
} from '@rnmapbox/maps';
import type { CameraRef } from '@rnmapbox/maps/lib/typescript/src/components/Camera';
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
  Stepper,
  Chip,
  Row,
} from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { useUserLocation } from '../../src/state/userLocation';
import { trpc } from '../../src/lib/trpc';
import type { ConnectorType } from '@edna/schemas';

const STYLES = {
  light: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
};

const CONNECTORS: ConnectorType[] = ['j1772', 'nacs', 'tesla', 'ccs1', 'chademo'];

export default function AddCharger() {
  const router = useRouter();
  const { c } = useTheme();
  const scheme = useColorScheme();
  const session = trpc.auth.getSession.useQuery();
  const utils = trpc.useUtils();
  const userCoords = useUserLocation((s) => s.coords);
  const cameraRef = useRef<CameraRef>(null);
  const create = trpc.charger.create.useMutation({
    onSuccess: (ch) => {
      utils.charger.nearby.invalidate();
      utils.charger.myChargers.invalidate();
      utils.auth.getSession.invalidate();
      // v1 is OCPP-only: every charger lands on its detail screen, where the
      // host connects it to the CSMS.
      router.replace({ pathname: '/(host)/charger/[id]', params: { id: ch.id } });
    },
    onError: (e) => handleError(e, { feature: 'Add charger' }),
  });

  const [title, setTitle] = useState('My home charger');
  const [addr, setAddr] = useState('');
  const [city, setCity] = useState('Pleasanton');
  const [stateAbbr, setStateAbbr] = useState('CA');
  const [zip, setZip] = useState('94566');
  // Default the map pin to the user's current location if known, else
  // Pleasanton. Numeric state — keeps Mapbox + Number() coercion clean.
  const [lat, setLat] = useState<number>(userCoords?.lat ?? 37.6624);
  const [lng, setLng] = useState<number>(userCoords?.lng ?? -121.8747);

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
  const [pricePerKwh, setPKwh] = useState('28');
  const [gateCode, setGateCode] = useState('');

  useEffect(() => {
    const setup = session.data?.hostProfile?.hardwareSetup as
      | { connectorType?: ConnectorType; powerKw?: number }
      | undefined;
    if (setup?.connectorType) setConn(setup.connectorType);
    if (setup?.powerKw) setPower(String(setup.powerKw));
  }, [session.data]);

  const submit = () => {
    if (!addr) return Alert.alert('Missing', 'Address is required.');
    create.mutate({
      title,
      addressLine1: addr,
      city,
      state: stateAbbr,
      postalCode: zip,
      country: 'US',
      lat,
      lng,
      gateCode: gateCode.trim() || undefined,
      connectorType: connector,
      powerKw: Number(powerKw),
      // v1 is OCPP-only — always a metered, per-kWh Tier 3 charger.
      hardwareTier: 'tier_3_native',
      pricePerKwhCents: Number(pricePerKwh),
      instantAvailable: true,
      availability: [],
    });
  };

  return (
    <Screen keyboardAvoiding>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={{ marginTop: 12 }}>
          <Stepper count={5} current={3} label="STEP 4 OF 5" />
        </View>
        <H1 style={{ marginTop: 14 }}>Set your price</H1>
        <Card padding={18} style={{ marginTop: 16, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Muted>$</Muted>
            <H1 style={{ fontSize: 56, fontWeight: '800', letterSpacing: -2 }}>
              {(Number(pricePerKwh) / 100).toFixed(2)}
            </H1>
            <Muted>/kWh</Muted>
          </View>
          <View style={{ marginTop: 14, width: '100%' }}>
            <Input
              value={pricePerKwh}
              onChangeText={setPKwh}
              placeholder="28 (cents)"
              keyboardType="number-pad"
            />
          </View>
        </Card>
        <Muted style={{ fontSize: 12, marginTop: 12 }}>
          Drivers pay for the exact energy your charger meters — around $0.28/kWh on average.
        </Muted>

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
              Shared automatically with drivers once their booking is confirmed. Leave blank if not needed.
            </Muted>
            <Input
              value={gateCode}
              onChangeText={setGateCode}
              placeholder="e.g. 1234"
              autoCapitalize="characters"
              maxLength={32}
            />
          </View>
          <View>
            <Label style={{ marginBottom: 8 }}>LOCATION</Label>
            <Muted style={{ fontSize: 12, marginBottom: 8 }}>
              Drag the map to position the pin where the charger actually is.
            </Muted>
            <View
              style={{
                height: 220,
                borderRadius: 16,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: c.line,
              }}
            >
              <MapView
                style={{ flex: 1 }}
                styleURL={scheme === 'dark' ? STYLES.dark : STYLES.light}
                onCameraChanged={(s) => {
                  const center = s.properties.center as [number, number] | undefined;
                  if (!center) return;
                  setLng(center[0]);
                  setLat(center[1]);
                }}
              >
                <Camera
                  ref={cameraRef}
                  defaultSettings={{ centerCoordinate: [lng, lat], zoomLevel: 15 }}
                  animationDuration={0}
                />
                <PointAnnotation id="charger-pin" coordinate={[lng, lat]}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: c.green2,
                      borderWidth: 3,
                      borderColor: c.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: c.bg,
                      }}
                    />
                  </View>
                </PointAnnotation>
              </MapView>
            </View>
            <Muted style={{ fontSize: 11, marginTop: 6 }}>
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </Muted>
          </View>
        </View>
      </ScrollView>
      <CTABar>
        <Button label="Publish charger" loading={create.isPending} onPress={submit} />
      </CTABar>
    </Screen>
  );
}

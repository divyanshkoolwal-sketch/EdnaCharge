import { useEffect, useState } from 'react';
import { View, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
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
import { trpc } from '../../src/lib/trpc';
import type { ConnectorType, HardwareTier } from '@edna/schemas';

const CONNECTORS: ConnectorType[] = ['j1772', 'nacs', 'tesla', 'ccs1', 'chademo'];

export default function AddCharger() {
  const router = useRouter();
  const { c } = useTheme();
  const session = trpc.auth.getSession.useQuery();
  const create = trpc.charger.create.useMutation({
    onSuccess: (ch) =>
      router.replace({ pathname: '/(host)/charger/[id]', params: { id: ch.id } }),
    onError: (e) => Alert.alert('Oops', e.message),
  });

  const [title, setTitle] = useState('My home charger');
  const [addr, setAddr] = useState('');
  const [city, setCity] = useState('Pleasanton');
  const [stateAbbr, setStateAbbr] = useState('CA');
  const [zip, setZip] = useState('94566');
  const [lat, setLat] = useState('37.6624');
  const [lng, setLng] = useState('-121.8747');
  const [connector, setConn] = useState<ConnectorType>('j1772');
  const [powerKw, setPower] = useState('7.2');
  const [tier, setTier] = useState<HardwareTier>('tier_3_native');
  const [pricePerKwh, setPKwh] = useState('28');
  const [pricePerHour, setPHour] = useState('500');

  useEffect(() => {
    const setup = session.data?.hostProfile?.hardwareSetup as
      | { hardwareTier?: HardwareTier; connectorType?: ConnectorType; powerKw?: number }
      | undefined;
    if (setup?.hardwareTier) setTier(setup.hardwareTier);
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
      lat: Number(lat),
      lng: Number(lng),
      connectorType: connector,
      powerKw: Number(powerKw),
      hardwareTier: tier,
      pricePerKwhCents: tier === 'tier_4_unmetered' ? undefined : Number(pricePerKwh),
      pricePerHourCents: tier === 'tier_4_unmetered' ? Number(pricePerHour) : undefined,
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
        <Row gap={6} style={{ marginTop: 14 }}>
          <Chip
            label="$/kWh"
            selected={tier !== 'tier_4_unmetered'}
            variant="outline"
            onPress={() => setTier('tier_3_native')}
          />
          <Chip
            label="$/hour"
            selected={tier === 'tier_4_unmetered'}
            variant="outline"
            onPress={() => setTier('tier_4_unmetered')}
          />
        </Row>

        <Card padding={18} style={{ marginTop: 16, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Muted>$</Muted>
            <H1 style={{ fontSize: 56, fontWeight: '800', letterSpacing: -2 }}>
              {tier === 'tier_4_unmetered'
                ? (Number(pricePerHour) / 100).toFixed(2)
                : (Number(pricePerKwh) / 100).toFixed(2)}
            </H1>
            <Muted>/{tier === 'tier_4_unmetered' ? 'hour' : 'kWh'}</Muted>
          </View>
          <View style={{ marginTop: 14, width: '100%' }}>
            {tier === 'tier_4_unmetered' ? (
              <Input
                value={pricePerHour}
                onChangeText={setPHour}
                placeholder="500 (cents)"
                keyboardType="number-pad"
              />
            ) : (
              <Input
                value={pricePerKwh}
                onChangeText={setPKwh}
                placeholder="28 (cents)"
                keyboardType="number-pad"
              />
            )}
          </View>
        </Card>
        <Muted style={{ fontSize: 12, marginTop: 12 }}>
          Drivers near you pay around $0.28/kWh on average.
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
            <Label style={{ marginBottom: 8 }}>COORDINATES</Label>
            <Row gap={8}>
              <View style={{ flex: 1 }}>
                <Input value={lat} onChangeText={setLat} placeholder="lat" />
              </View>
              <View style={{ flex: 1 }}>
                <Input value={lng} onChangeText={setLng} placeholder="lng" />
              </View>
            </Row>
          </View>
        </View>
      </ScrollView>
      <CTABar>
        <Button label="Publish charger" loading={create.isPending} onPress={submit} />
      </CTABar>
    </Screen>
  );
}

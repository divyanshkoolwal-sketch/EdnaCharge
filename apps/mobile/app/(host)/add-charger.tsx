import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../src/lib/trpc';
import type { ConnectorType, HardwareTier } from '@edna/schemas';

const CONNECTORS: ConnectorType[] = ['j1772', 'nacs', 'tesla', 'ccs1', 'chademo'];

export default function AddCharger() {
  const router = useRouter();
  const session = trpc.auth.getSession.useQuery();
  const create = trpc.charger.create.useMutation({
    onSuccess: (c) =>
      router.replace({ pathname: '/(host)/charger/[id]', params: { id: c.id } }),
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
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text className="text-3xl font-bold mb-6">Add charger</Text>
      <Label>Title</Label>
      <TextInput value={title} onChangeText={setTitle} className={inputCls} />
      <Label>Address</Label>
      <TextInput value={addr} onChangeText={setAddr} className={inputCls} />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Label>City</Label>
          <TextInput value={city} onChangeText={setCity} className={inputCls} />
        </View>
        <View style={{ width: 80 }}>
          <Label>State</Label>
          <TextInput value={stateAbbr} onChangeText={setStateAbbr} className={inputCls} />
        </View>
        <View style={{ width: 90 }}>
          <Label>ZIP</Label>
          <TextInput value={zip} onChangeText={setZip} className={inputCls} />
        </View>
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Label>Lat</Label>
          <TextInput value={lat} onChangeText={setLat} className={inputCls} />
        </View>
        <View className="flex-1">
          <Label>Lng</Label>
          <TextInput value={lng} onChangeText={setLng} className={inputCls} />
        </View>
      </View>
      <Label>Connector</Label>
      <View className="flex-row flex-wrap gap-2 mb-2">
        {CONNECTORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setConn(c)}
            className={`px-4 py-2 rounded-full border ${
              connector === c ? 'bg-black border-black' : 'border-gray-300'
            }`}
          >
            <Text className={connector === c ? 'text-white' : 'text-black'}>{c.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      <Label>Power (kW)</Label>
      <TextInput value={powerKw} onChangeText={setPower} keyboardType="decimal-pad" className={inputCls} />
      <Label>
        Pricing (
        {tier === 'tier_4_unmetered' ? '$/hour cents' : '$/kWh cents'})
      </Label>
      {tier === 'tier_4_unmetered' ? (
        <TextInput value={pricePerHour} onChangeText={setPHour} keyboardType="number-pad" className={inputCls} />
      ) : (
        <TextInput value={pricePerKwh} onChangeText={setPKwh} keyboardType="number-pad" className={inputCls} />
      )}
      <Pressable
        disabled={create.isPending}
        onPress={submit}
        className={`mt-6 rounded-full py-4 items-center ${create.isPending ? 'bg-gray-300' : 'bg-black'}`}
      >
        <Text className="text-white font-semibold">
          {create.isPending ? 'Publishing…' : 'Publish charger'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const inputCls = 'border border-gray-300 rounded-lg px-4 py-3 mb-3';
const Label = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-sm text-gray-600 mt-3 mb-2">{children}</Text>
);

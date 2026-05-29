import { useState } from 'react';
import { Pressable, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { handleError } from '../../src/lib/errors';
import {
  Screen,
  Input,
  Button,
  CTABar,
  H1,
  Chip,
  Label,
} from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { trpc } from '../../src/lib/trpc';
import type { ConnectorType } from '@edna/schemas';

const CONNECTORS: { value: ConnectorType; label: string }[] = [
  { value: 'j1772', label: 'J1772' },
  { value: 'nacs', label: 'NACS' },
  { value: 'tesla', label: 'Tesla' },
  { value: 'ccs1', label: 'CCS1' },
  { value: 'chademo', label: 'CHAdeMO' },
];

export default function DriverProfile() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [vehicleMake, setMake] = useState('');
  const [vehicleModel, setModel] = useState('');
  const [vehicleYear, setYear] = useState(String(new Date().getFullYear()));
  const [connector, setConnector] = useState<ConnectorType>('nacs');
  const [plate, setPlate] = useState('');

  const utils = trpc.useUtils();
  const mut = trpc.auth.completeDriverProfile.useMutation({
    onSuccess: () => {
      utils.auth.getSession.invalidate();
      // Send the user through ID verification before landing on the map. They
      // can skip and verify later — the map is browseable while unverified;
      // booking is gated server-side.
      router.replace({
        pathname: '/(shared)/identity-verification',
        params: { next: '/(driver)/map' },
      } as never);
    },
    onError: (e) => handleError(e, { feature: 'Profile' }),
  });

  return (
    <Screen keyboardAvoiding>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
      >
        <View style={{ marginTop: 16 }}>
          <H1>Tell us about{'\n'}your ride.</H1>
        </View>
        <View style={{ marginTop: 20, gap: 12 }}>
          <Input value={fullName} onChangeText={setFullName} placeholder="Your name" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Input value={vehicleMake} onChangeText={setMake} placeholder="Make" />
            </View>
            <View style={{ flex: 1 }}>
              <Input value={vehicleModel} onChangeText={setModel} placeholder="Model" />
            </View>
          </View>
          <Input
            value={vehicleYear}
            onChangeText={setYear}
            placeholder="Year"
            keyboardType="number-pad"
          />
          <View>
            <Label style={{ marginBottom: 8 }}>CONNECTOR TYPE</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {CONNECTORS.map((c) => (
                <Chip
                  key={c.value}
                  label={c.label}
                  selected={connector === c.value}
                  variant="outline"
                  onPress={() => setConnector(c.value)}
                />
              ))}
            </View>
          </View>
          <Input
            value={plate}
            onChangeText={setPlate}
            placeholder="License plate (optional)"
            autoCapitalize="characters"
          />
        </View>
      </ScrollView>
      <CTABar>
        <Button
          label="Continue to map"
          onPress={() =>
            mut.mutate({
              fullName,
              vehicleMake,
              vehicleModel,
              vehicleYear: Number(vehicleYear) || 0,
              connectorType: connector,
              licensePlate: plate || undefined,
            })
          }
          loading={mut.isPending}
          disabled={!fullName || !vehicleMake || !vehicleModel}
        />
      </CTABar>
    </Screen>
  );
}

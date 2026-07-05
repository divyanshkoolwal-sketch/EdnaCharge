/** @file apps/mobile/app/(auth)/driver-profile.tsx. */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { handleError } from '../../src/lib/errors';
import { Screen, Input, Button, CTABar, H1, Chip, Label } from '../../src/components/ui';
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
  const parsedYear = Number(vehicleYear);
  const profileValid =
    fullName.trim().length > 0 &&
    fullName.trim().length <= 100 &&
    vehicleMake.trim().length > 0 &&
    vehicleMake.trim().length <= 40 &&
    vehicleModel.trim().length > 0 &&
    vehicleModel.trim().length <= 60 &&
    Number.isInteger(parsedYear) &&
    parsedYear >= 1990 &&
    parsedYear <= 2100 &&
    plate.trim().length <= 16;

  const utils = trpc.useUtils();
  const mut = trpc.auth.completeDriverProfile.useMutation({
    onSuccess: () => {
      utils.auth.getSession.invalidate();
      // Send the user through ID verification before landing on the map. They
      // can skip verification; the map is browseable while unverified;
      // booking is gated server-side.
      router.replace({
        pathname: '/(shared)/identity-verification',
        params: { next: '/(driver)/map' },
      } as never);
    },
    onError: (e) => handleError(e, { feature: 'Profile' }),
  });

  return (
    <Screen keyboardAvoiding contentStyle={{ paddingBottom: 130 }}>
      {/* This screen is often reached via router.replace (onboarding), so only
          show back when there's actually a screen to return to. */}
      {router.canGoBack() ? (
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          style={{ paddingTop: 8 }}
        >
          <ChevronLeft />
        </Pressable>
      ) : null}
      <View style={{ marginTop: 16 }}>
        <H1>Tell us about{'\n'}your ride.</H1>
      </View>
      <View style={{ marginTop: 20, gap: 12 }}>
        <Input
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your name"
          maxLength={100}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input value={vehicleMake} onChangeText={setMake} placeholder="Make" maxLength={40} />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              value={vehicleModel}
              onChangeText={setModel}
              placeholder="Model"
              maxLength={60}
            />
          </View>
        </View>
        <Input
          value={vehicleYear}
          onChangeText={setYear}
          placeholder="Year"
          keyboardType="number-pad"
          maxLength={4}
          error={
            vehicleYear.length > 0 &&
            (!Number.isInteger(parsedYear) || parsedYear < 1990 || parsedYear > 2100)
              ? 'Enter a valid model year.'
              : undefined
          }
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
          maxLength={16}
        />
      </View>
      <CTABar>
        <Button
          label="Continue to map"
          onPress={() =>
            mut.mutate({
              fullName: fullName.trim(),
              vehicleMake: vehicleMake.trim(),
              vehicleModel: vehicleModel.trim(),
              vehicleYear: parsedYear,
              connectorType: connector,
              licensePlate: plate.trim() || undefined,
            })
          }
          loading={mut.isPending}
          disabled={!profileValid || mut.isPending}
        />
      </CTABar>
    </Screen>
  );
}

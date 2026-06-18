import { useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { handleError } from '../../../src/lib/errors';
import {
  Screen,
  Input,
  Button,
  CTABar,
  H1,
  Muted,
  Stepper,
} from '../../../src/components/ui';
import { ChevronLeft } from '../../../src/components/icons/Icon';
import { trpc } from '../../../src/lib/trpc';

export default function Identity() {
  const router = useRouter();
  const [legalName, setName] = useState('');
  const [dob, setDob] = useState('');
  const [addressLine1, setA1] = useState('');
  const [city, setCity] = useState('');
  const [stateAbbr, setStateAbbr] = useState('');
  const [postalCode, setZip] = useState('');

  const utils = trpc.useUtils();
  const mut = trpc.auth.submitHostIdentity.useMutation({
    onSuccess: () => {
      utils.auth.getSession.invalidate();
      // Drop the host into the ID verification flow before they hit charger
      // identification. They can skip and verify later — listing is gated
      // server-side until they're verified.
      router.push({
        pathname: '/(shared)/identity-verification',
        params: { next: '/(host)/host-onboarding/charger-identification' },
      } as never);
    },
    onError: (e) => handleError(e, { feature: 'Identity' }),
  });

  const submit = () => {
    if (!legalName || !dob || !addressLine1 || !city || !stateAbbr || !postalCode) {
      return Alert.alert('Missing info', 'Fill in every field.');
    }
    mut.mutate({
      legalName,
      dob: new Date(`${dob}T00:00:00Z`).toISOString(),
      addressLine1,
      city,
      state: stateAbbr,
      postalCode,
      country: 'US',
    });
  };

  return (
    <Screen keyboardAvoiding contentStyle={{ paddingBottom: 130 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
        <View style={{ marginTop: 12 }}>
          <Stepper count={4} current={0} label="STEP 1 OF 4" />
        </View>
        <H1 style={{ marginTop: 14 }}>Identity</H1>
        <Muted style={{ marginTop: 6, fontSize: 13 }}>
          Required for Stripe Connect payouts.
        </Muted>
        <View style={{ marginTop: 18, gap: 10 }}>
          <Input value={legalName} onChangeText={setName} placeholder="Legal full name" />
          <Input
            value={dob}
            onChangeText={setDob}
            placeholder="Date of birth (YYYY-MM-DD)"
            keyboardType="numbers-and-punctuation"
          />
          <Input value={addressLine1} onChangeText={setA1} placeholder="Street address" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 2 }}>
              <Input value={city} onChangeText={setCity} placeholder="City" />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                value={stateAbbr}
                onChangeText={setStateAbbr}
                placeholder="ST"
                autoCapitalize="characters"
                maxLength={2}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                value={postalCode}
                onChangeText={setZip}
                placeholder="ZIP"
                keyboardType="number-pad"
              />
            </View>
          </View>
        </View>
      <CTABar>
        <Button label="Continue" loading={mut.isPending} onPress={submit} />
      </CTABar>
    </Screen>
  );
}

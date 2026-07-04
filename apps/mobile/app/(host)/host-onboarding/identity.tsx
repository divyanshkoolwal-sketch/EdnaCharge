/** @file apps/mobile/app/(host)/host-onboarding/identity.tsx. */
import { useState } from 'react';
import { View, Pressable, Alert, Platform, Text } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
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
import { useTheme } from '../../../src/theme/useTheme';

// Must be 18+ for Stripe Connect payouts → cap the picker at 18 years ago.
const MAX_DOB = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d;
})();

export default function Identity() {
  const router = useRouter();
  const { c, radius } = useTheme();
  const [legalName, setName] = useState('');
  // Native date picker instead of a free-text "YYYY-MM-DD" field (error-prone).
  const [dobDate, setDobDate] = useState<Date | null>(null);
  const [showDob, setShowDob] = useState(false);
  const [addressLine1, setA1] = useState('');
  const [city, setCity] = useState('');
  const [stateAbbr, setStateAbbr] = useState('');
  const [postalCode, setZip] = useState('');
  const formValid =
    legalName.trim().length > 0 &&
    legalName.trim().length <= 120 &&
    dobDate != null &&
    addressLine1.trim().length > 0 &&
    city.trim().length > 0 &&
    stateAbbr.trim().length > 0 &&
    postalCode.trim().length >= 3;

  const utils = trpc.useUtils();
  const mut = trpc.auth.submitHostIdentity.useMutation({
    onSuccess: () => {
      utils.auth.getSession.invalidate();
      // Host account setup is identity → payouts (Stripe). Charger onboarding is
      // a SEPARATE step the host does from their dashboard AFTER the account +
      // payouts exist — never during signup. So go straight to Stripe Connect.
      router.push({
        pathname: '/(shared)/identity-verification',
        params: { next: '/(host)/host-onboarding/stripe-connect' },
      } as never);
    },
    onError: (e) => handleError(e, { feature: 'Identity' }),
  });

  const submit = () => {
    if (!formValid || !dobDate) {
      return Alert.alert('Missing info', 'Fill in every field.');
    }
    mut.mutate({
      legalName: legalName.trim(),
      dob: dobDate.toISOString(),
      addressLine1: addressLine1.trim(),
      city: city.trim(),
      state: stateAbbr.trim(),
      postalCode: postalCode.trim(),
      country: 'US',
    });
  };

  return (
    <Screen keyboardAvoiding contentStyle={{ paddingBottom: 130 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
        <View style={{ marginTop: 12 }}>
          <Stepper count={3} current={0} label="STEP 1 OF 3" />
        </View>
        <H1 style={{ marginTop: 14 }}>Identity</H1>
        <Muted style={{ marginTop: 6, fontSize: 13 }}>
          Required for Stripe Connect payouts.
        </Muted>
        <View style={{ marginTop: 18, gap: 10 }}>
          <Input value={legalName} onChangeText={setName} placeholder="Legal full name" maxLength={120} />
          <Pressable
            onPress={() => setShowDob((s) => !s)}
            accessibilityRole="button"
            accessibilityLabel={
              dobDate ? `Date of birth, ${dobDate.toLocaleDateString()}` : 'Select date of birth'
            }
            style={{
              height: 52,
              borderRadius: radius.input,
              backgroundColor: c.chip,
              paddingHorizontal: 16,
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 15, color: dobDate ? c.ink : c.muted2 }}>
              {dobDate
                ? dobDate.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Date of birth'}
            </Text>
          </Pressable>
          {showDob ? (
            <DateTimePicker
              value={dobDate ?? MAX_DOB}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={MAX_DOB}
              onChange={(_, d) => {
                // Android closes after a pick; iOS spinner stays for adjustment.
                setShowDob(Platform.OS === 'ios');
                if (d) setDobDate(d);
              }}
            />
          ) : null}
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
                error={postalCode.length > 0 && postalCode.trim().length < 3 ? 'Use at least 3 characters.' : undefined}
              />
            </View>
          </View>
        </View>
      <CTABar>
        <Button label="Continue" loading={mut.isPending} disabled={!formValid || mut.isPending} onPress={submit} />
      </CTABar>
    </Screen>
  );
}

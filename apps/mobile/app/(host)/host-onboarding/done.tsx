/** @file apps/mobile/app/(host)/host-onboarding/done.tsx. */
import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Button, H1Lg, Body } from '../../../src/components/ui';
import { SuccessCheckIllo } from '../../../src/components/illustrations/HomeCharger';
import { useRole } from '../../../src/state/role';
import { trpc } from '../../../src/lib/trpc';
import { haptics } from '../../../src/lib/haptics';

export default function Done() {
  const router = useRouter();
  const setRole = useRole((s) => s.setRole);
  const utils = trpc.useUtils();
  // Celebrate completion — a success haptic on the milestone screen.
  useEffect(() => {
    haptics.success();
  }, []);
  return (
    <Screen style={{ paddingHorizontal: 24, paddingBottom: 30 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <SuccessCheckIllo size={140} />
        <H1Lg style={{ marginTop: 22 }}>You're a host.</H1Lg>
        <Body style={{ marginTop: 8, textAlign: 'center' }}>
          Your account and payouts are set up. List a charger anytime from your dashboard.
        </Body>
      </View>
      <Button
        label="Go to dashboard"
        onPress={async () => {
          setRole('host');
          // Force a fresh session read before the host tab bar mounts so the
          // role flip is visible immediately (otherwise the user may see the
          // old driver tabs for a tick).
          await utils.auth.getSession.invalidate();
          // Land on the dashboard — charger onboarding is a deliberate step from
          // here ("+ Add a charger"), not an automatic part of signup.
          router.replace('/(host)/home');
        }}
      />
    </Screen>
  );
}

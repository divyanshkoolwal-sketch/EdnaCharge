/** @file apps/mobile/app/(auth)/access-gate.tsx. */
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { AppRole } from '@edna/schemas';
import {
  Screen,
  Button,
  CTABar,
  H1,
  Muted,
  Input,
  Chip,
  Row,
  Card,
  Body,
  Label,
} from '../../src/components/ui';
import { handleError } from '../../src/lib/errors';
import { trpc } from '../../src/lib/trpc';
import { useAuth } from '../../src/state/auth';
import { useRole } from '../../src/state/role';

function roleFromParam(value: unknown): AppRole {
  return value === 'host' || value === 'driver' ? value : 'host';
}

export default function AccessGate() {
  const params = useLocalSearchParams<{ role?: string }>();
  const router = useRouter();
  const signOut = useAuth((s) => s.signOut);
  const setLastRole = useRole((s) => s.setRole);
  const utils = trpc.useUtils();
  const [role, setRole] = useState<AppRole>(() => roleFromParam(params.role));
  const [code, setCode] = useState('');
  const [city, setCity] = useState('Fremont');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [chargerBrand, setChargerBrand] = useState('');
  const [hasOcpp, setHasOcpp] = useState<boolean | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [joined, setJoined] = useState<AppRole | null>(null);

  const redeem = trpc.access.redeemCode.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.auth.getSession.invalidate(), utils.access.status.invalidate()]);
      setLastRole(role);
      router.replace(
        role === 'host' ? '/(host)/host-onboarding/intro' : '/(auth)/driver-profile',
      );
    },
    onError: (e) => handleError(e, { feature: 'Invite code' }),
  });
  const waitlist = trpc.access.joinWaitlist.useMutation({
    onSuccess: async () => {
      await utils.access.status.invalidate();
      setJoined(role);
    },
    onError: (e) => handleError(e, { feature: 'Waitlist' }),
  });

  const joinValid = city.trim().length > 0 && postalCode.trim().length >= 3;

  if (joined) {
    return (
      <Screen contentStyle={{ paddingBottom: 40 }}>
        <Label>FREMONT PILOT</Label>
        <H1 style={{ marginTop: 14 }}>You're on the waitlist</H1>
        <Muted style={{ marginTop: 10, lineHeight: 20 }}>
          EdnaCharge is starting in Fremont. We'll reach out when {joined} access opens for your
          area.
        </Muted>
        <Card padding={14} style={{ marginTop: 18 }}>
          <Body style={{ fontWeight: '700' }}>Have a field invite?</Body>
          <Muted style={{ marginTop: 6 }}>Enter it anytime from this screen after signing in.</Muted>
        </Card>
        <CTABar>
          <Button label="Enter invite code" onPress={() => setJoined(null)} />
          <Button
            label="Sign out"
            variant="secondary"
            height={44}
            onPress={() => signOut().catch(() => undefined)}
          />
        </CTABar>
      </Screen>
    );
  }

  return (
    <Screen keyboardAvoiding scroll contentStyle={{ paddingBottom: 150 }}>
      <Label>FREMONT PILOT</Label>
      <H1 style={{ marginTop: 14 }}>EdnaCharge is starting in Fremont.</H1>
      <Muted style={{ marginTop: 10, lineHeight: 20 }}>
        Hosts and drivers are joining by invite while we build the first neighborhood charging
        network.
      </Muted>

      <Row gap={8} style={{ marginTop: 20 }}>
        <Chip label="Host" selected={role === 'host'} onPress={() => setRole('host')} />
        <Chip label="Driver" selected={role === 'driver'} onPress={() => setRole('driver')} />
      </Row>

      <Card padding={14} style={{ marginTop: 18 }}>
        <Body style={{ fontWeight: '700' }}>I have an invite code</Body>
        <Input
          value={code}
          onChangeText={setCode}
          placeholder="FREMONT-HOST-1234"
          autoCapitalize="characters"
          style={{ marginTop: 12 }}
        />
        <Button
          label="Redeem code"
          loading={redeem.isPending}
          disabled={code.trim().length < 3 || redeem.isPending}
          onPress={() => redeem.mutate({ role, code })}
          style={{ marginTop: 12 }}
        />
      </Card>

      <Card padding={14} style={{ marginTop: 14 }}>
        <Body style={{ fontWeight: '700' }}>Join the waitlist</Body>
        <View style={{ gap: 10, marginTop: 12 }}>
          <Input value={city} onChangeText={setCity} placeholder="City" />
          <Input
            value={postalCode}
            onChangeText={setPostalCode}
            placeholder="ZIP code"
            keyboardType="number-pad"
          />
          <Input
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone (optional)"
            keyboardType="phone-pad"
          />
          {role === 'host' ? (
            <>
              <Input
                value={chargerBrand}
                onChangeText={setChargerBrand}
                placeholder="Charger brand/model (optional)"
              />
              <Row gap={8}>
                <Chip label="OCPP ready" selected={hasOcpp === true} onPress={() => setHasOcpp(true)} />
                <Chip label="Not sure" selected={hasOcpp === false} onPress={() => setHasOcpp(false)} />
              </Row>
            </>
          ) : null}
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder={role === 'host' ? 'Access notes (optional)' : 'Where do you need charging?'}
            multiline
            maxLength={500}
            style={{ minHeight: 70, height: undefined, paddingTop: 14 }}
          />
        </View>
        <Button
          label="Join waitlist"
          variant="secondary"
          loading={waitlist.isPending}
          disabled={!joinValid || waitlist.isPending}
          onPress={() =>
            waitlist.mutate({
              role,
              city,
              postalCode,
              phone: phone.trim() || undefined,
              chargerBrand: role === 'host' ? chargerBrand.trim() || undefined : undefined,
              hasOcpp: role === 'host' ? hasOcpp : undefined,
              notes: notes.trim() || undefined,
            })
          }
          style={{ marginTop: 12 }}
        />
      </Card>

      <View style={{ marginTop: 18, gap: 12, alignItems: 'center' }}>
        <Pressable onPress={() => router.push('/(shared)/support' as never)}>
          <Muted style={{ textDecorationLine: 'underline' }}>Contact support</Muted>
        </Pressable>
        <Row gap={14}>
          <Pressable onPress={() => router.push('/(shared)/legal?doc=terms' as never)}>
            <Muted style={{ textDecorationLine: 'underline' }}>Terms</Muted>
          </Pressable>
          <Pressable onPress={() => router.push('/(shared)/legal?doc=privacy' as never)}>
            <Muted style={{ textDecorationLine: 'underline' }}>Privacy</Muted>
          </Pressable>
        </Row>
        <Pressable
          onPress={() =>
            Alert.alert('Sign out?', 'You can sign back in anytime.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
            ])
          }
        >
          <Muted>Sign out</Muted>
        </Pressable>
      </View>
    </Screen>
  );
}

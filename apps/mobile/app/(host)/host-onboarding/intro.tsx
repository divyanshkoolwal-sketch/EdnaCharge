/** @file apps/mobile/app/(host)/host-onboarding/intro.tsx. */
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Button, H1Lg, Body, Muted, Row, StatusDot } from '../../../src/components/ui';
import { HomeChargerIllo } from '../../../src/components/illustrations/HomeCharger';
import { ChevronLeft } from '../../../src/components/icons/Icon';

const BULLETS = [
  'Typical hosts earn $40–$200/month.',
  'Pricing is set automatically by demand — you earn more at peak hours.',
  'Every request is yours to accept or decline.',
];

export default function Intro() {
  const router = useRouter();
  return (
    <Screen style={{ paddingHorizontal: 24, paddingBottom: 30 }}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={{ paddingTop: 8, alignSelf: 'flex-start' }}
      >
        <ChevronLeft />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 30 }}>
        <HomeChargerIllo size={200} />
      </View>
      <View>
        <H1Lg>Become a host.</H1Lg>
        <Body style={{ marginTop: 10 }}>
          List your home charger in 5 minutes. Drivers book it; you earn 85% of every session.
        </Body>
        <View style={{ marginTop: 18, gap: 10 }}>
          {BULLETS.map((t) => (
            <Row key={t}>
              <StatusDot />
              <Muted>{t}</Muted>
            </Row>
          ))}
        </View>
        <Button
          label="Get started"
          onPress={() => router.push('/(host)/host-onboarding/identity')}
          style={{ marginTop: 20 }}
        />
      </View>
    </Screen>
  );
}

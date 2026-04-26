import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Button, H1Lg, Body, Label, Muted, Row, StatusDot } from '../../src/components/ui';
import { HomeChargerIllo } from '../../src/components/illustrations/HomeCharger';
import { useTheme } from '../../src/theme/useTheme';

export default function Welcome() {
  const router = useRouter();
  const { c } = useTheme();

  return (
    <Screen style={{ paddingHorizontal: 24, paddingBottom: 30 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 30 }}>
        <HomeChargerIllo size={220} />
      </View>
      <View>
        <Label style={{ marginBottom: 6 }}>EDNACHARGE</Label>
        <H1Lg style={{ marginBottom: 10 }}>Charge where{'\n'}you live.</H1Lg>
        <Body style={{ marginBottom: 20 }}>
          Find, book, and pay for EV charging at homes near you.
        </Body>
        <View style={{ gap: 10 }}>
          <Row>
            <StatusDot />
            <Muted>Verified hosts</Muted>
          </Row>
          <Row>
            <StatusDot />
            <Muted>Pay only for what you use</Muted>
          </Row>
          <Row>
            <StatusDot />
            <Muted>Book in seconds</Muted>
          </Row>
        </View>
        <Button
          label="Continue with email"
          onPress={() => router.push('/(auth)/sign-in')}
          style={{ marginTop: 20 }}
        />
        <Muted style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: c.muted2 }}>
          By continuing you agree to terms & privacy.
        </Muted>
      </View>
    </Screen>
  );
}

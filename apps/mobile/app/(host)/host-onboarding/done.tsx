import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Button, H1Lg, Body } from '../../../src/components/ui';
import { SuccessCheckIllo } from '../../../src/components/illustrations/HomeCharger';
import { useRole } from '../../../src/state/role';

export default function Done() {
  const router = useRouter();
  const setRole = useRole((s) => s.setRole);
  return (
    <Screen style={{ paddingHorizontal: 24, paddingBottom: 30 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <SuccessCheckIllo size={140} />
        <H1Lg style={{ marginTop: 22 }}>You're a host.</H1Lg>
        <Body style={{ marginTop: 8 }}>Let's list your first charger.</Body>
      </View>
      <Button
        label="Add charger"
        onPress={() => {
          setRole('host');
          router.replace('/(host)/add-charger');
        }}
      />
    </Screen>
  );
}

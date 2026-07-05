import { Pressable, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, H1, Body, Muted, Label } from '../../src/components/ui';
import { Bolt } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { useRole } from '../../src/state/role';
import { haptics } from '../../src/lib/haptics';

export default function PickRole() {
  const router = useRouter();
  const { c } = useTheme();
  const setRole = useRole((s) => s.setRole);

  const pickDriver = () => {
    haptics.selection();
    setRole('driver');
    router.replace('/(auth)/driver-profile');
  };

  const pickHost = () => {
    haptics.selection();
    setRole('host');
    router.replace('/(host)/host-onboarding/intro');
  };

  return (
    <Screen style={{ paddingHorizontal: 24, paddingTop: 40 }}>
      <Label style={{ marginBottom: 6 }}>WELCOME</Label>
      <H1 style={{ marginBottom: 8 }}>What brings you{'\n'}to EdnaCharge?</H1>
      <Body style={{ color: c.muted, marginBottom: 28 }}>
        Pick how you want to start. You can always switch or do both later.
      </Body>

      <Pressable
        onPress={pickDriver}
        accessibilityRole="button"
        accessibilityLabel="I want to charge. Find chargers near you and book in seconds."
        style={({ pressed }) => ({
          backgroundColor: c.ink,
          borderRadius: 22,
          padding: 22,
          minHeight: 140,
          justifyContent: 'space-between',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: 'rgba(255,255,255,0.14)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Bolt size={26} color="#FFFFFF" />
        </View>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFFFFF' }}>
            I want to charge
          </Text>
          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
            Find chargers near you and book in seconds
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={pickHost}
        accessibilityRole="button"
        accessibilityLabel="I want to host my charger. Earn 40 to 200 dollars a month on your home charger."
        style={({ pressed }) => ({
          backgroundColor: c.greenPill,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: c.green2,
          padding: 22,
          minHeight: 140,
          justifyContent: 'space-between',
          marginTop: 14,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Bolt size={26} color="#3F7E40" />
        </View>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#0F0F10' }}>
            I want to host my charger
          </Text>
          <Text style={{ fontSize: 14, color: 'rgba(15,15,16,0.7)', marginTop: 4 }}>
            Earn $40–$200/mo on your home charger
          </Text>
        </View>
      </Pressable>

      <Muted style={{ textAlign: 'center', marginTop: 28, fontSize: 12 }}>
        You can switch roles or do both anytime from your profile.
      </Muted>
    </Screen>
  );
}

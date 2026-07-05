/** Host setup gate shown before a charger can be published. */
import { Pressable, View } from 'react-native';
import { Button, H1, Muted, Screen } from '../../components/ui';
import { Bolt, ChevronLeft } from '../../components/icons/Icon';
import { useTheme } from '../../theme/useTheme';

export function AddChargerGate({
  needsPayouts,
  onBack,
  onContinue,
}: {
  needsPayouts: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { c } = useTheme();
  return (
    <Screen>
      <Pressable
        onPress={onBack}
        style={{ paddingTop: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={10}
      >
        <ChevronLeft />
      </Pressable>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          paddingHorizontal: 8,
        }}
      >
        <Bolt size={30} color={c.green2} />
        <H1 style={{ textAlign: 'center' }}>Finish host setup</H1>
        <Muted style={{ textAlign: 'center', lineHeight: 20 }}>
          {needsPayouts
            ? 'Set up payouts so you can get paid — then you can list your charger.'
            : 'Verify your identity to list your charger.'}
        </Muted>
        <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
          <Button
            label={needsPayouts ? 'Continue to payouts' : 'Verify my ID'}
            onPress={onContinue}
          />
        </View>
      </View>
    </Screen>
  );
}

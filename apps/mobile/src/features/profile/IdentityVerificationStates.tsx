/** Presentational states for the shared identity verification flow. */
import { Pressable, View } from 'react-native';
import { Body, Button, CTABar, H1, Muted, Row, Screen } from '../../components/ui';
import { Check, ChevronLeft } from '../../components/icons/Icon';
import { SuccessCheckIllo } from '../../components/illustrations/HomeCharger';
import { useTheme } from '../../theme/useTheme';

export function VerificationRequiresInput({
  failureReason,
  loading,
  onBack,
  onTryAgain,
  onSkip,
}: {
  failureReason?: string | null;
  loading: boolean;
  onBack: () => void;
  onTryAgain: () => void;
  onSkip: () => void;
}) {
  const { c } = useTheme();
  return (
    <Screen scroll contentStyle={{ paddingBottom: 130 }}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        style={{ paddingTop: 8 }}
      >
        <ChevronLeft />
      </Pressable>
      <View style={{ marginTop: 60, alignItems: 'center' }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 24,
            backgroundColor: c.redPill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Body style={{ fontSize: 36, color: c.red, fontWeight: '800' }}>!</Body>
        </View>
      </View>
      <H1 style={{ marginTop: 20, textAlign: 'center', fontSize: 24 }}>Verification didn't pass</H1>
      <Muted style={{ marginTop: 10, textAlign: 'center', paddingHorizontal: 24, lineHeight: 20 }}>
        Stripe couldn't confirm your ID. Common reasons: blurry photo, glare on the document, or the
        selfie didn't match. Try again with better lighting.
      </Muted>
      {failureReason ? (
        <Muted style={{ marginTop: 8, textAlign: 'center', fontSize: 11 }}>
          Reason: {failureReason.replace(/_/g, ' ')}
        </Muted>
      ) : null}
      <CTABar>
        <Button label="Try again" onPress={onTryAgain} loading={loading} />
        <Button
          label="Skip verification"
          variant="secondary"
          height={44}
          fontSize={14}
          onPress={onSkip}
        />
      </CTABar>
    </Screen>
  );
}

export function VerificationSuccess({ onContinue }: { onContinue: () => void }) {
  return (
    <Screen style={{ paddingHorizontal: 24 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <SuccessCheckIllo size={140} />
        <H1 style={{ marginTop: 22, fontSize: 26 }}>You're verified.</H1>
        <Muted style={{ marginTop: 10, textAlign: 'center', maxWidth: 280, lineHeight: 20 }}>
          Your ID is on file. Booking and listing are now unlocked.
        </Muted>
      </View>
      <CTABar>
        <Button label="Continue" onPress={onContinue} />
      </CTABar>
    </Screen>
  );
}

export function ChecklistRow({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <Row gap={10} style={{ paddingHorizontal: 4 }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: c.greenPill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={12} color={c.green2} />
      </View>
      <Body style={{ flex: 1, fontSize: 13 }}>{text}</Body>
    </Row>
  );
}

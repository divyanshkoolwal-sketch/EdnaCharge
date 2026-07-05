/** Host wizard for confirming an OCPP-capable charger before listing. */
import { useState } from 'react';
import { View, Pressable } from 'react-native';
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
  Chip,
  Row,
} from '../../../src/components/ui';
import { ChevronLeft } from '../../../src/components/icons/Icon';
import { trpc } from '../../../src/lib/trpc';
import type { ConnectorType } from '@edna/schemas';
import {
  CapabilityStep,
  Choice,
  CONNECTORS,
  DoneStep,
  HelpStep,
  OCPP_BRANDS,
  POWERS,
  WAITLIST_BRANDS,
  WaitlistedStep,
  type ChargerIdentificationStep,
} from '../../../src/features/host-onboarding/ChargerIdentificationSteps';

export default function ChargerIdentification() {
  const router = useRouter();
  const [step, setStep] = useState<ChargerIdentificationStep>('capability');
  const [brand, setBrand] = useState<string | null>(null);
  const [brandOther, setBrandOther] = useState('');
  const [connector, setConnector] = useState<ConnectorType>('j1772');
  const [powerKw, setPowerKw] = useState<number | null>(null);
  const [waitNote, setWaitNote] = useState('');

  const waitlist = trpc.charger.joinWaitlist.useMutation({
    onSuccess: () => setStep('waitlisted'),
    onError: (e) => handleError(e, { feature: 'Waitlist' }),
  });

  const powerValid =
    typeof powerKw === 'number' && Number.isFinite(powerKw) && powerKw > 0 && powerKw <= 50;

  const submit = () => {
    if (!powerValid) return;
    setStep('done');
  };

  const isInputStep = step === 'brand' || step === 'connector' || step === 'power';

  return (
    <Screen keyboardAvoiding contentStyle={{ paddingBottom: 130 }}>
      {step !== 'done' && step !== 'waitlisted' ? (
        <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
          <ChevronLeft />
        </Pressable>
      ) : null}
      {isInputStep ? (
        <View style={{ marginTop: 12 }}>
          {/* Step 2 of the overall onboarding flow (identity → charger →
                payouts). The brand/connector/power sub-steps are content within
                this one step, so the top progress bar stays at 2 of 3. */}
          <Stepper count={3} current={1} label="STEP 2 OF 3" />
        </View>
      ) : null}

      {step === 'capability' ? (
        <CapabilityStep
          onYes={() => setStep('brand')}
          onHelp={() => setStep('help')}
          onWaitlist={() => setStep('waitlist')}
        />
      ) : null}

      {step === 'help' ? (
        <HelpStep onYes={() => setStep('brand')} onWaitlist={() => setStep('waitlist')} />
      ) : null}

      {step === 'brand' ? (
        <>
          <H1 style={{ marginTop: 14, fontSize: 24 }}>What's your charger?</H1>
          <View style={{ marginTop: 18, gap: 10 }}>
            {OCPP_BRANDS.map((b) => (
              <Choice key={b} label={b} selected={brand === b} onPress={() => setBrand(b)} />
            ))}
            {brand === 'Other (OCPP 1.6)' ? (
              <Input
                value={brandOther}
                onChangeText={setBrandOther}
                placeholder="Brand / model"
                maxLength={80}
              />
            ) : null}
          </View>
        </>
      ) : null}

      {step === 'connector' ? (
        <>
          <H1 style={{ marginTop: 14, fontSize: 24 }}>Which connector?</H1>
          <View style={{ marginTop: 18, gap: 10 }}>
            {CONNECTORS.map((cn) => (
              <Choice
                key={cn}
                label={cn.toUpperCase()}
                selected={connector === cn}
                onPress={() => setConnector(cn)}
              />
            ))}
          </View>
        </>
      ) : null}

      {step === 'power' ? (
        <>
          <H1 style={{ marginTop: 14, fontSize: 24 }}>Power output (kW)</H1>
          <Muted style={{ marginTop: 6, fontSize: 13 }}>
            On the charger's label or in the manual — usually printed on the side.
          </Muted>
          <Row gap={6} style={{ marginTop: 14, flexWrap: 'wrap' }}>
            {POWERS.map((p) => (
              <Chip
                key={p}
                label={`${p} kW`}
                variant="outline"
                selected={powerKw === p}
                onPress={() => setPowerKw(p)}
              />
            ))}
          </Row>
          <View style={{ marginTop: 14 }}>
            <Input
              value={powerKw ? String(powerKw) : ''}
              onChangeText={(t) => setPowerKw(Number(t) || null)}
              keyboardType="decimal-pad"
              placeholder="Or type a number"
              error={powerKw != null && !powerValid ? 'Enter a value from 0 to 50 kW.' : undefined}
            />
          </View>
        </>
      ) : null}

      {step === 'done' ? <DoneStep /> : null}

      {step === 'waitlist' ? (
        <>
          <H1 style={{ marginTop: 14, fontSize: 24 }}>Join the waitlist</H1>
          <Muted style={{ marginTop: 8, fontSize: 13, lineHeight: 19 }}>
            We're starting with chargers that speak OCPP 1.6. Tell us what you have and we'll email
            you the moment we support it.
          </Muted>
          <View style={{ marginTop: 18, gap: 10 }}>
            {WAITLIST_BRANDS.map((b) => (
              <Choice key={b} label={b} selected={brand === b} onPress={() => setBrand(b)} />
            ))}
          </View>
          <View style={{ marginTop: 12 }}>
            <Input
              value={waitNote}
              onChangeText={setWaitNote}
              placeholder="Anything else? (optional)"
              maxLength={500}
              multiline
              style={{ minHeight: 70, paddingTop: 14, paddingBottom: 14, height: undefined }}
            />
          </View>
        </>
      ) : null}

      {step === 'waitlisted' ? <WaitlistedStep /> : null}
      {step === 'brand' ? (
        <CTABar>
          <Button
            label="Next"
            onPress={() => setStep('connector')}
            disabled={!brand || (brand === 'Other (OCPP 1.6)' && !brandOther.trim())}
          />
        </CTABar>
      ) : null}
      {step === 'connector' ? (
        <CTABar>
          <Button label="Next" onPress={() => setStep('power')} />
        </CTABar>
      ) : null}
      {step === 'power' ? (
        <CTABar>
          <Button
            label="Save & continue"
            onPress={submit}
            disabled={!powerValid}
          />
        </CTABar>
      ) : null}
      {step === 'waitlist' ? (
        <CTABar>
          <Button
            label="Join waitlist"
            loading={waitlist.isPending}
            disabled={!brand}
            onPress={() =>
              waitlist.mutate({
                chargerBrand: brand === 'Other' ? undefined : (brand ?? undefined),
                note: waitNote.trim() || undefined,
              })
            }
          />
        </CTABar>
      ) : null}
      {step === 'done' ? (
        <CTABar>
          <Button
            label="Continue to payouts"
            onPress={() => router.push('/(host)/host-onboarding/stripe-connect')}
          />
        </CTABar>
      ) : null}
      {step === 'waitlisted' ? (
        <CTABar>
          <Button label="Done" onPress={() => router.replace('/(auth)/pick-role')} />
        </CTABar>
      ) : null}
    </Screen>
  );
}

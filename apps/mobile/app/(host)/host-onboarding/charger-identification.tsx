import { useEffect, useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { handleError } from '../../../src/lib/errors';
import {
  Screen,
  Card,
  FrameSoft,
  Input,
  Button,
  CTABar,
  H1,
  H1Lg,
  Body,
  Muted,
  Stepper,
  Chip,
  Row,
} from '../../../src/components/ui';
import { ChevronLeft, Check } from '../../../src/components/icons/Icon';
import { useTheme } from '../../../src/theme/useTheme';
import { trpc } from '../../../src/lib/trpc';
import type { ConnectorType } from '@edna/schemas';
import { SuccessCheckIllo } from '../../../src/components/illustrations/HomeCharger';

// v1 is OCPP-only. The flow gates on whether the host's charger can connect to
// a custom OCPP 1.6 server; everything else (brand / connector / power) is
// metadata for the listing. Non-OCPP hosts join a waitlist instead of listing.
type Step = 'capability' | 'help' | 'brand' | 'connector' | 'power' | 'done' | 'waitlist' | 'waitlisted';

// Chargers that commonly let you point OCPP 1.6 at a custom server. (Vendor-
// locked units — Tesla Wall Connector, ChargePoint Home, Emporia, JuiceBox —
// generally cannot, so they're intentionally absent.)
const OCPP_BRANDS = [
  'Wallbox Pulsar / Pulsar Plus',
  'Grizzl-E Smart',
  'OpenEVSE',
  'EVBox',
  'ABB / commercial unit',
  'Other (OCPP 1.6)',
];
// Common vendor-locked chargers, shown on the waitlist step so hosts can tell
// us what they have.
const WAITLIST_BRANDS = [
  'Tesla Wall Connector',
  'ChargePoint Home',
  'Emporia',
  'Enel X JuiceBox',
  'Other',
];
const CONNECTORS: ConnectorType[] = ['j1772', 'nacs', 'tesla', 'ccs1', 'chademo'];
const POWERS = [3.3, 7.2, 11, 19.2, 22];

export default function ChargerIdentification() {
  const router = useRouter();
  const { c } = useTheme();
  const [step, setStep] = useState<Step>('capability');
  const [brand, setBrand] = useState<string | null>(null);
  const [brandOther, setBrandOther] = useState('');
  const [connector, setConnector] = useState<ConnectorType>('j1772');
  const [powerKw, setPowerKw] = useState<number | null>(null);
  const [waitNote, setWaitNote] = useState('');

  const utils = trpc.useUtils();
  const mut = trpc.auth.submitChargerIdentification.useMutation({
    onSuccess: () => {
      utils.auth.getSession.invalidate();
      setStep('done');
    },
    onError: (e) => handleError(e, { feature: 'Charger setup' }),
  });
  const waitlist = trpc.charger.joinWaitlist.useMutation({
    onSuccess: () => setStep('waitlisted'),
    onError: (e) => handleError(e, { feature: 'Waitlist' }),
  });

  // Pre-fill from a previously-submitted hardwareSetup so this works as an edit.
  const session = trpc.auth.getSession.useQuery();
  useEffect(() => {
    const setup = session.data?.hostProfile?.hardwareSetup as
      | { chargerBrand?: string | null; connectorType?: ConnectorType; powerKw?: number }
      | undefined;
    if (!setup) return;
    if (setup.chargerBrand) setBrand(setup.chargerBrand);
    if (setup.connectorType) setConnector(setup.connectorType);
    if (typeof setup.powerKw === 'number') setPowerKw(setup.powerKw);
  }, [session.data]);

  const resolvedBrand = brand === 'Other (OCPP 1.6)' ? brandOther || null : brand;

  const submit = () => {
    mut.mutate({
      // OCPP chargers are networked Level 2 units by definition.
      chargerLocation: 'installed_level2',
      chargerBrand: resolvedBrand,
      chargerModel: null,
      hasWifi: true,
      connectorType: connector,
      powerKw: powerKw ?? 0,
      hardwareTier: 'tier_3_native',
    });
  };

  const isInputStep = step === 'brand' || step === 'connector' || step === 'power';
  const stepIndex = step === 'brand' ? 0 : step === 'connector' ? 1 : step === 'power' ? 2 : 0;

  return (
    <Screen keyboardAvoiding>
      {step !== 'done' && step !== 'waitlisted' ? (
        <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
          <ChevronLeft />
        </Pressable>
      ) : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {isInputStep ? (
          <View style={{ marginTop: 12 }}>
            <Stepper count={3} current={stepIndex} label={`STEP ${stepIndex + 1} OF 3`} />
          </View>
        ) : null}

        {step === 'capability' ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>Can your charger connect to EdnaCharge?</H1>
            <Muted style={{ marginTop: 8, fontSize: 13, lineHeight: 19 }}>
              EdnaCharge talks to your charger over OCPP 1.6 to start and stop sessions and read
              real energy use. Most networked Level 2 chargers that let you set a custom OCPP server
              work — Wallbox, Grizzl-E Smart, OpenEVSE, EVBox and most commercial units. Vendor-locked
              chargers (Tesla Wall Connector, ChargePoint Home, Emporia, JuiceBox) usually can't.
            </Muted>
            <View style={{ marginTop: 18, gap: 10 }}>
              <Choice label="Yes — I can set a custom OCPP server" onPress={() => setStep('brand')} />
              <Choice label="I'm not sure" onPress={() => setStep('help')} />
              <Choice label="No / it's vendor-locked" onPress={() => setStep('waitlist')} />
            </View>
          </>
        ) : null}

        {step === 'help' ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>How to check</H1>
            <Muted style={{ marginTop: 8, fontSize: 13, lineHeight: 19 }}>
              Look in your charger's app or web admin for a setting called “OCPP”, “OCPP 1.6”,
              “Backend”, or “Central System URL”. If you can type in a custom server address, your
              charger is compatible. If there's no such setting (or only the manufacturer's own
              cloud), it isn't compatible yet.
            </Muted>
            <FrameSoft style={{ marginTop: 16 }}>
              <Body style={{ fontSize: 13 }}>
                Tip: many chargers expose OCPP only to the installer or after enabling a “smart”
                or “networked” mode. Check the manual for your exact model.
              </Body>
            </FrameSoft>
            <View style={{ marginTop: 18, gap: 10 }}>
              <Choice label="My charger has an OCPP server setting" onPress={() => setStep('brand')} />
              <Choice label="It doesn't — add me to the waitlist" onPress={() => setStep('waitlist')} />
            </View>
          </>
        ) : null}

        {step === 'brand' ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>What's your charger?</H1>
            <View style={{ marginTop: 18, gap: 10 }}>
              {OCPP_BRANDS.map((b) => (
                <Choice key={b} label={b} selected={brand === b} onPress={() => setBrand(b)} />
              ))}
              {brand === 'Other (OCPP 1.6)' ? (
                <Input value={brandOther} onChangeText={setBrandOther} placeholder="Brand / model" />
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
              />
            </View>
            {mut.isPending ? <Muted style={{ marginTop: 14 }}>Saving…</Muted> : null}
          </>
        ) : null}

        {step === 'done' ? (
          <View style={{ alignItems: 'center', marginTop: 30 }}>
            <SuccessCheckIllo size={120} />
            <View
              style={{
                backgroundColor: c.greenPill,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                marginTop: 18,
              }}
            >
              <Body style={{ color: c.green2, fontWeight: '700', fontSize: 11, letterSpacing: 0.3 }}>
                OCPP 1.6 · READY
              </Body>
            </View>
            <H1Lg style={{ marginTop: 14, fontSize: 28, textAlign: 'center' }}>You're all set.</H1Lg>
            <Body style={{ marginTop: 10, textAlign: 'center', maxWidth: 280 }}>
              When you list your charger, we'll give you the connection details to paste into its
              OCPP settings — then it shows up here the moment it connects.
            </Body>
          </View>
        ) : null}

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
                multiline
                style={{ minHeight: 70, paddingTop: 14, paddingBottom: 14, height: undefined }}
              />
            </View>
          </>
        ) : null}

        {step === 'waitlisted' ? (
          <View style={{ alignItems: 'center', marginTop: 30 }}>
            <SuccessCheckIllo size={120} />
            <H1Lg style={{ marginTop: 18, fontSize: 28, textAlign: 'center' }}>You're on the list.</H1Lg>
            <Body style={{ marginTop: 10, textAlign: 'center', maxWidth: 280 }}>
              Thanks — we'll email you when EdnaCharge supports your charger. In the meantime you can
              still use the app as a driver.
            </Body>
          </View>
        ) : null}
      </ScrollView>

      {step === 'brand' ? (
        <CTABar>
          <Button
            label="Next"
            onPress={() => setStep('connector')}
            disabled={!brand || (brand === 'Other (OCPP 1.6)' && !brandOther)}
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
          <Button label="Save & continue" onPress={submit} loading={mut.isPending} disabled={!powerKw} />
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
                chargerBrand: brand === 'Other' ? undefined : brand ?? undefined,
                note: waitNote || undefined,
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

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const { c, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: selected ? c.card : 'transparent',
        borderWidth: 1.5,
        borderColor: selected ? c.ink : c.line,
        borderRadius: radius.illo,
        paddingHorizontal: 16,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: selected ? c.ink : c.line2,
          backgroundColor: selected ? c.ink : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Check size={12} color={c.bg} /> : null}
      </View>
      <Body style={{ fontWeight: '600', fontSize: 14, flex: 1 }}>{label}</Body>
    </Pressable>
  );
}

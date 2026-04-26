import { useState } from 'react';
import { View, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
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
import type { ConnectorType, HardwareTier } from '@edna/schemas';
import { SuccessCheckIllo } from '../../../src/components/illustrations/HomeCharger';

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type Location = 'wall_outlet' | 'installed_level2' | 'none' | 'unsure';

const BRANDS = [
  'Tesla Wall Connector',
  'ChargePoint Home Flex',
  'Wallbox Pulsar Plus',
  'Enel X JuiceBox',
  'Emporia EV Charger',
  'Grizzl-E',
  'EO Mini',
  'Other',
];
const CONNECTORS: ConnectorType[] = ['j1772', 'nacs', 'tesla', 'ccs1', 'chademo'];
const POWERS = [1.4, 3.3, 7.2, 11, 19.2];

const TIER_COPY: Record<HardwareTier, { label: string; title: string; body: string }> = {
  tier_3_native: {
    label: 'TIER 3 · OCPP-NATIVE',
    title: "You're all set.",
    body: "We'll give you your charger's connection details when you list it.",
  },
  tier_2_bridge_kit: {
    label: 'TIER 2 · BRIDGE KIT',
    title: "We'll ship you a free bridge kit.",
    body: 'Shipping takes 3–5 days. You can finish listing now and go live once it arrives.',
  },
  tier_1_smart_plug: {
    label: 'TIER 1 · SMART PLUG',
    title: "We'll ship you a free smart plug.",
    body: 'Shipping takes 3–5 days. You can finish listing now and go live once it arrives.',
  },
  tier_4_unmetered: {
    label: 'TIER 4 · UNMETERED',
    title: 'No metering required.',
    body: "You can still list, but you'll price by the hour instead of per kWh.",
  },
};

export default function ChargerIdentification() {
  const router = useRouter();
  const { c } = useTheme();
  const [step, setStep] = useState<Step>(1);
  const [location, setLocation] = useState<Location | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [brandOther, setBrandOther] = useState('');
  const [hasWifi, setHasWifi] = useState<boolean | null>(null);
  const [connector, setConnector] = useState<ConnectorType>('j1772');
  const [powerKw, setPowerKw] = useState<number | null>(null);
  const [tier, setTier] = useState<HardwareTier | null>(null);

  const mut = trpc.auth.submitChargerIdentification.useMutation({
    onSuccess: () => setStep(7),
    onError: (e) => Alert.alert('Oops', e.message),
  });

  const pickLocation = (l: Location) => {
    setLocation(l);
    if (l === 'installed_level2') setStep(2);
    else {
      setBrand(null);
      setHasWifi(null);
      setStep(4);
    }
  };

  const submit = (finalTier: HardwareTier) => {
    setTier(finalTier);
    mut.mutate({
      chargerLocation: location!,
      chargerBrand: brand === 'Other' ? brandOther || null : brand,
      chargerModel: null,
      hasWifi,
      connectorType: connector,
      powerKw: powerKw ?? 0,
      hardwareTier: finalTier,
    });
  };

  return (
    <Screen keyboardAvoiding>
      {step < 7 ? (
        <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
          <ChevronLeft />
        </Pressable>
      ) : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
      >
        {step < 7 ? (
          <View style={{ marginTop: 12 }}>
            <Stepper count={6} current={Math.max(0, step - 1)} label={`STEP ${step} OF 6`} />
          </View>
        ) : null}

        {step === 1 ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>How is your EV currently charged at home?</H1>
            <View style={{ marginTop: 18, gap: 10 }}>
              <Choice label="Wall outlet (Level 1, 120V)" onPress={() => pickLocation('wall_outlet')} />
              <Choice label="Installed home charger (Level 2, 240V)" onPress={() => pickLocation('installed_level2')} />
              <Choice label="No charger yet, but I'm interested" onPress={() => pickLocation('none')} />
              <Choice label="I'm not sure" onPress={() => pickLocation('unsure')} />
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>What brand is your charger?</H1>
            <View style={{ marginTop: 18, gap: 10 }}>
              {BRANDS.map((b) => (
                <Choice key={b} label={b} selected={brand === b} onPress={() => setBrand(b)} />
              ))}
              {brand === 'Other' ? (
                <Input value={brandOther} onChangeText={setBrandOther} placeholder="Type brand / model" />
              ) : null}
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>Does your charger have Wi-Fi or an app?</H1>
            <View style={{ marginTop: 18, gap: 10 }}>
              <Choice label="Yes" selected={hasWifi === true} onPress={() => setHasWifi(true)} />
              <Choice label="No (hard-wired only)" selected={hasWifi === false} onPress={() => setHasWifi(false)} />
              <Choice label="Not sure" selected={hasWifi === null && step === 3} onPress={() => setHasWifi(null)} />
            </View>
          </>
        ) : null}

        {step === 4 ? (
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

        {step === 5 ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>Power output (kW)</H1>
            <Muted style={{ marginTop: 6, fontSize: 13 }}>
              Look on the charger's label or in the manual — usually printed on the side.
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
          </>
        ) : null}

        {step === 6 ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>Can you see your energy use?</H1>
            <View style={{ marginTop: 18, gap: 10 }}>
              <Choice label="My charger shows kWh in its app" onPress={() => submit('tier_3_native')} />
              <Choice label="It has Wi-Fi but no app / a basic app" onPress={() => submit('tier_2_bridge_kit')} />
              <Choice label="I have a smart plug or would like one" onPress={() => submit('tier_1_smart_plug')} />
              <Choice label="None of the above" onPress={() => submit('tier_4_unmetered')} />
            </View>
            {mut.isPending ? <Muted style={{ marginTop: 14 }}>Saving…</Muted> : null}
          </>
        ) : null}

        {step === 7 && tier ? (
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
                {TIER_COPY[tier].label}
              </Body>
            </View>
            <H1Lg style={{ marginTop: 14, fontSize: 28, textAlign: 'center' }}>
              {TIER_COPY[tier].title}
            </H1Lg>
            <Body style={{ marginTop: 10, textAlign: 'center', maxWidth: 260 }}>
              {TIER_COPY[tier].body}
            </Body>
          </View>
        ) : null}
      </ScrollView>
      {step < 7 && (step === 2 || step === 3 || step === 4 || step === 5) ? (
        <CTABar>
          <Button
            label="Next"
            onPress={() => setStep((step + 1) as Step)}
            disabled={
              (step === 2 && (!brand || (brand === 'Other' && !brandOther))) ||
              (step === 5 && !powerKw)
            }
          />
        </CTABar>
      ) : null}
      {step === 7 ? (
        <CTABar>
          <Button
            label="Continue to payouts"
            onPress={() => router.replace('/(host)/host-onboarding/stripe-connect')}
          />
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

/**
 * Device setup screen — guides the host through linking their Shelly device
 * (Tier 1 smart plug or Tier 2 CT clamp) to their charger listing.
 *
 * Flow:
 *  Step 1 — Power on the device and connect it to WiFi using the Shelly app
 *  Step 2 — In the Shelly app, enable MQTT with our broker settings
 *  Step 3 — Find and enter the device ID (printed on label / shown in Shelly app)
 *  Step 4 — Confirm MAC address (for security linking)
 *  Step 5 — Success: device is registered, show MQTT config summary
 */

import { useState } from 'react';
import { View, Pressable, ScrollView, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { handleError } from '../../../src/lib/errors';
import {
  Screen,
  Card,
  Button,
  CTABar,
  H1,
  Body,
  Muted,
  Input,
  Row,
  SectionHeader,
} from '../../../src/components/ui';
import { ChevronLeft, Check } from '../../../src/components/icons/Icon';
import { SuccessCheckIllo } from '../../../src/components/illustrations/HomeCharger';
import { trpc } from '../../../src/lib/trpc';
import type { HardwareTier } from '@edna/schemas';

type Step = 1 | 2 | 3 | 4 | 5;

// MAC address regex: accepts both colon and hyphen-separated formats
const MAC_RE = /^([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}$/;

function normalizeMac(raw: string): string {
  return raw.replace(/[-]/g, ':').toLowerCase();
}

export default function DeviceSetup() {
  const router = useRouter();
  const { chargerId, tier } = useLocalSearchParams<{ chargerId: string; tier: HardwareTier }>();
  const [step, setStep] = useState<Step>(1);
  const [deviceId, setDeviceId] = useState('');
  const [mac, setMac] = useState('');
  const [mqttConfig, setMqttConfig] = useState<{
    server: string;
    port: number;
    clientId: string;
    instructions: string[];
  } | null>(null);

  const isPlug = tier === 'tier_1_smart_plug';
  const deviceLabel = isPlug ? 'Shelly Plus Plug S' : 'Shelly Pro EM-50';
  const hardwareModel = isPlug ? 'shelly-plus-plug-s' : 'shelly-pro-em-50';

  const utils = trpc.useUtils();
  const brokerInfoQ = trpc.device.brokerInfo.useQuery();
  const register = trpc.device.register.useMutation({
    onSuccess: (data) => {
      setMqttConfig(data.mqttConfig);
      utils.device.status.invalidate({ chargerId });
      setStep(5);
    },
    onError: (e) => handleError(e, { feature: 'Device setup' }),
  });

  const canSubmitStep3 = deviceId.trim().length >= 6;
  const canSubmitStep4 = MAC_RE.test(mac.trim());

  function handleRegister() {
    if (!chargerId) return;
    register.mutate({
      chargerId,
      shellyDeviceId: deviceId.trim().toLowerCase(),
      mac: normalizeMac(mac.trim()),
      hardwareModel,
    });
  }

  return (
    <Screen keyboardAvoiding>
      {step < 5 ? (
        <Pressable onPress={() => (step === 1 ? router.back() : setStep((step - 1) as Step))} style={{ paddingTop: 8 }}>
          <ChevronLeft />
        </Pressable>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>

        {/* STEP 1: Power on + WiFi */}
        {step === 1 ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>Step 1 of 4 · Power on your {deviceLabel}</H1>
            <Muted style={{ marginTop: 8, lineHeight: 20 }}>
              {isPlug
                ? 'Plug your Shelly Plus Plug S into an outlet. Download the Shelly app, create an account, and add the device to connect it to your home WiFi.'
                : 'Clip the CT clamps around the two wires going to your charger (one per leg). Download the Shelly app and add the Pro EM-50 to connect it to your home WiFi.'}
            </Muted>
            <Card padding={16} style={{ marginTop: 20, gap: 12 }}>
              <Step_ n={1} text="Download the Shelly app (iOS / Android)" />
              <Step_ n={2} text="Tap + and follow the pairing instructions" />
              <Step_ n={3} text={isPlug ? 'Plug the device into a 120V outlet' : 'Clip CT clamps around the charger wires'} />
              <Step_ n={4} text="Connect to your home WiFi inside the Shelly app" />
            </Card>
            <Pressable
              onPress={() => Linking.openURL('https://shelly.cloud/apps/')}
              style={{ marginTop: 14 }}
            >
              <Body style={{ color: '#22A06B', fontWeight: '600' }}>Download Shelly app →</Body>
            </Pressable>
          </>
        ) : null}

        {/* STEP 2: Configure MQTT */}
        {step === 2 ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>Step 2 of 4 · Configure MQTT</H1>
            <Muted style={{ marginTop: 8, lineHeight: 20 }}>
              Inside the Shelly app, go to your device → Settings → MQTT and enter these settings so EdnaCharge can communicate with your device.
            </Muted>
            <Card padding={16} style={{ marginTop: 20, gap: 10 }}>
              <ConfigRow label="Server" value={brokerInfoQ.data?.host ?? 'Loading…'} />
              <ConfigRow label="Port" value={String(brokerInfoQ.data?.port ?? 1883)} />
              <ConfigRow label="SSL/TLS" value={brokerInfoQ.data?.useSsl ? 'On' : 'Off'} />
              <ConfigRow label="Enable RPC" value="On" />
              <ConfigRow label="Username" value="(leave blank)" />
              <ConfigRow label="Password" value="(leave blank)" />
            </Card>
            <Card padding={14} style={{ marginTop: 14, backgroundColor: '#FAFAF0' }}>
              <Body style={{ fontSize: 13, color: '#6B6B70', lineHeight: 18 }}>
                After saving, tap Reboot in the Shelly app. The device will reconnect using MQTT.
              </Body>
            </Card>
          </>
        ) : null}

        {/* STEP 3: Enter Device ID */}
        {step === 3 ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>Step 3 of 4 · Enter your device ID</H1>
            <Muted style={{ marginTop: 8, lineHeight: 20 }}>
              Find the device ID on the label underneath your {deviceLabel}, or tap the device name inside the Shelly app — it appears as "ShellyPlusPlugS-XXXXXX" or similar.
            </Muted>
            <View style={{ marginTop: 20 }}>
              <Input
                value={deviceId}
                onChangeText={setDeviceId}
                placeholder="e.g. shellyplusplugus-abc123"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <Muted style={{ marginTop: 8, fontSize: 12 }}>
              Tip: in the Shelly app, tap the device → ⓘ icon → Device Info to see the exact ID.
            </Muted>
          </>
        ) : null}

        {/* STEP 4: Enter MAC Address */}
        {step === 4 ? (
          <>
            <H1 style={{ marginTop: 14, fontSize: 24 }}>Step 4 of 4 · Confirm MAC address</H1>
            <Muted style={{ marginTop: 8, lineHeight: 20 }}>
              Enter the MAC address printed on your device label (or shown in Shelly app → Device Info). Format: AA:BB:CC:DD:EE:FF
            </Muted>
            <View style={{ marginTop: 20 }}>
              <Input
                value={mac}
                onChangeText={setMac}
                placeholder="AA:BB:CC:DD:EE:FF"
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
            {mac.length > 0 && !MAC_RE.test(mac.trim()) ? (
              <Muted style={{ marginTop: 6, color: '#D94B4B', fontSize: 12 }}>
                Invalid format — use AA:BB:CC:DD:EE:FF
              </Muted>
            ) : null}
          </>
        ) : null}

        {/* STEP 5: Success */}
        {step === 5 && mqttConfig ? (
          <View style={{ alignItems: 'center', marginTop: 30 }}>
            <SuccessCheckIllo size={120} />
            <H1 style={{ marginTop: 20, fontSize: 24, textAlign: 'center' }}>
              {deviceLabel} linked!
            </H1>
            <Body style={{ marginTop: 8, textAlign: 'center', maxWidth: 280, color: '#6B6B70', lineHeight: 20 }}>
              {isPlug
                ? 'EdnaCharge will automatically turn the plug on when a driver starts a session and off when they stop.'
                : 'EdnaCharge will monitor your energy use and automatically start and end the billing session based on power draw.'}
            </Body>
            <SectionHeader marginTop={28}>MQTT Config Summary</SectionHeader>
            <Card padding={14} style={{ alignSelf: 'stretch', gap: 8 }}>
              <ConfigRow label="Server" value={mqttConfig.server} />
              <ConfigRow label="Port" value={String(mqttConfig.port)} />
              <ConfigRow label="Client ID" value={mqttConfig.clientId} />
              <ConfigRow label="Device ID" value={deviceId} />
            </Card>
          </View>
        ) : null}
      </ScrollView>

      {/* Footer CTAs */}
      {step === 1 ? (
        <CTABar>
          <Button label="I've connected to WiFi" onPress={() => setStep(2)} />
        </CTABar>
      ) : null}
      {step === 2 ? (
        <CTABar>
          <Button label="MQTT is configured" onPress={() => setStep(3)} />
        </CTABar>
      ) : null}
      {step === 3 ? (
        <CTABar>
          <Button label="Next" onPress={() => setStep(4)} disabled={!canSubmitStep3} />
        </CTABar>
      ) : null}
      {step === 4 ? (
        <CTABar>
          <Button
            label="Link device"
            onPress={handleRegister}
            loading={register.isPending}
            disabled={!canSubmitStep4}
          />
        </CTABar>
      ) : null}
      {step === 5 ? (
        <CTABar>
          <Button
            label="Continue"
            onPress={() => router.push('/(host)/host-onboarding/stripe-connect' as never)}
          />
        </CTABar>
      ) : null}
    </Screen>
  );
}

function Step_({ n, text }: { n: number; text: string }) {
  return (
    <Row gap={12} style={{ alignItems: 'flex-start' }}>
      <View style={{
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: '#0F0F10',
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Body style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{n}</Body>
      </View>
      <Body style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{text}</Body>
    </Row>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <Row between>
      <Muted style={{ fontSize: 13 }}>{label}</Muted>
      <Body style={{ fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' }}>{value}</Body>
    </Row>
  );
}

/** Presentational pieces for the host charger-identification wizard. */
import { Pressable, View } from 'react-native';
import type { ConnectorType } from '@edna/schemas';
import { Body, FrameSoft, H1, H1Lg, Muted } from '../../components/ui';
import { Check } from '../../components/icons/Icon';
import { SuccessCheckIllo } from '../../components/illustrations/HomeCharger';
import { useTheme } from '../../theme/useTheme';

export type ChargerIdentificationStep =
  | 'capability'
  | 'help'
  | 'brand'
  | 'connector'
  | 'power'
  | 'done'
  | 'waitlist'
  | 'waitlisted';

export const OCPP_BRANDS = [
  'Wallbox Pulsar / Pulsar Plus',
  'Grizzl-E Smart',
  'OpenEVSE',
  'EVBox',
  'ABB / commercial unit',
  'Other (OCPP 1.6)',
];
export const WAITLIST_BRANDS = [
  'Tesla Wall Connector',
  'ChargePoint Home',
  'Emporia',
  'Enel X JuiceBox',
  'Other',
];
export const CONNECTORS: ConnectorType[] = ['j1772', 'nacs', 'tesla', 'ccs1', 'chademo'];
export const POWERS = [3.3, 7.2, 11, 19.2, 22];

export function CapabilityStep({
  onYes,
  onHelp,
  onWaitlist,
}: {
  onYes: () => void;
  onHelp: () => void;
  onWaitlist: () => void;
}) {
  return (
    <>
      <H1 style={{ marginTop: 14, fontSize: 24 }}>Can your charger connect to EdnaCharge?</H1>
      <Muted style={{ marginTop: 8, fontSize: 13, lineHeight: 19 }}>
        EdnaCharge talks to your charger over OCPP 1.6 to start and stop sessions and read real
        energy use. Most networked Level 2 chargers that let you set a custom OCPP server work.
        Vendor-locked chargers usually can't.
      </Muted>
      <View style={{ marginTop: 18, gap: 10 }}>
        <Choice label="Yes — I can set a custom OCPP server" onPress={onYes} />
        <Choice label="I'm not sure" onPress={onHelp} />
        <Choice label="No / it's vendor-locked" onPress={onWaitlist} />
      </View>
    </>
  );
}

export function HelpStep({ onYes, onWaitlist }: { onYes: () => void; onWaitlist: () => void }) {
  return (
    <>
      <H1 style={{ marginTop: 14, fontSize: 24 }}>How to check</H1>
      <Muted style={{ marginTop: 8, fontSize: 13, lineHeight: 19 }}>
        Look in your charger's app or web admin for “OCPP”, “OCPP 1.6”, “Backend”, or “Central
        System URL”. If you can type a custom server address, your charger is compatible.
      </Muted>
      <FrameSoft style={{ marginTop: 16 }}>
        <Body style={{ fontSize: 13 }}>
          Tip: many chargers expose OCPP only to the installer or after enabling a smart or
          networked mode. Check the manual for your exact model.
        </Body>
      </FrameSoft>
      <View style={{ marginTop: 18, gap: 10 }}>
        <Choice label="My charger has an OCPP server setting" onPress={onYes} />
        <Choice label="It doesn't — add me to the waitlist" onPress={onWaitlist} />
      </View>
    </>
  );
}

export function DoneStep() {
  const { c } = useTheme();
  return (
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
        When you list your charger, we'll give you the connection details to paste into its OCPP
        settings.
      </Body>
    </View>
  );
}

export function WaitlistedStep() {
  return (
    <View style={{ alignItems: 'center', marginTop: 30 }}>
      <SuccessCheckIllo size={120} />
      <H1Lg style={{ marginTop: 18, fontSize: 28, textAlign: 'center' }}>You're on the list.</H1Lg>
      <Body style={{ marginTop: 10, textAlign: 'center', maxWidth: 280 }}>
        Thanks — we'll email you when EdnaCharge supports your charger. In the meantime you can
        still use the app as a driver.
      </Body>
    </View>
  );
}

export function Choice({
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

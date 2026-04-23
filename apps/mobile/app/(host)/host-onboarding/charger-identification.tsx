import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';
import type { ConnectorType, HardwareTier } from '@edna/schemas';
import { tierCopy } from '../../../src/features/host-onboarding/tier';

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

export default function ChargerIdentification() {
  const router = useRouter();
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
      // skip brand + wifi for non-installed paths
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
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, paddingTop: 80 }}>
      <Text className="text-sm text-gray-500 mb-2">Step {step} of 7</Text>
      {step === 1 && (
        <>
          <Text className="text-2xl font-bold mb-6">How is your EV currently charged at home?</Text>
          <Choice label="Wall outlet (Level 1, 120V)" onPress={() => pickLocation('wall_outlet')} />
          <Choice label="Installed home charger (Level 2, 240V)" onPress={() => pickLocation('installed_level2')} />
          <Choice label="No charger yet, but I'm interested" onPress={() => pickLocation('none')} />
          <Choice label="I'm not sure" onPress={() => pickLocation('unsure')} />
        </>
      )}
      {step === 2 && (
        <>
          <Text className="text-2xl font-bold mb-6">What brand/model is your charger?</Text>
          {BRANDS.map((b) => (
            <Choice
              key={b}
              label={b}
              selected={brand === b}
              onPress={() => {
                setBrand(b);
              }}
            />
          ))}
          {brand === 'Other' && (
            <TextInput
              value={brandOther}
              onChangeText={setBrandOther}
              placeholder="Type brand / model"
              className="border border-gray-300 rounded-lg px-4 py-3 mt-2"
            />
          )}
          <Next onPress={() => setStep(3)} disabled={!brand || (brand === 'Other' && !brandOther)} />
        </>
      )}
      {step === 3 && (
        <>
          <Text className="text-2xl font-bold mb-6">Does your charger have Wi-Fi / an app?</Text>
          <Choice label="Yes" selected={hasWifi === true} onPress={() => setHasWifi(true)} />
          <Choice label="No (hard-wired only)" selected={hasWifi === false} onPress={() => setHasWifi(false)} />
          <Choice label="Not sure" selected={hasWifi === null} onPress={() => setHasWifi(null)} />
          <Next onPress={() => setStep(4)} />
        </>
      )}
      {step === 4 && (
        <>
          <Text className="text-2xl font-bold mb-6">Which connector?</Text>
          {CONNECTORS.map((c) => (
            <Choice
              key={c}
              label={c.toUpperCase()}
              selected={connector === c}
              onPress={() => setConnector(c)}
            />
          ))}
          <Next onPress={() => setStep(5)} />
        </>
      )}
      {step === 5 && (
        <>
          <Text className="text-2xl font-bold mb-2">Power output (kW)</Text>
          <Text className="text-gray-500 mb-4">
            Check the label on the side of the charger if you're unsure.
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {POWERS.map((p) => (
              <Pressable
                key={p}
                onPress={() => setPowerKw(p)}
                className={`px-4 py-2 rounded-full border ${
                  powerKw === p ? 'bg-black border-black' : 'border-gray-300'
                }`}
              >
                <Text className={powerKw === p ? 'text-white' : 'text-black'}>{p} kW</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={powerKw ? String(powerKw) : ''}
            onChangeText={(t) => setPowerKw(Number(t) || null)}
            keyboardType="decimal-pad"
            placeholder="Or type a number"
            className="border border-gray-300 rounded-lg px-4 py-3"
          />
          <Next onPress={() => setStep(6)} disabled={!powerKw} />
        </>
      )}
      {step === 6 && (
        <>
          <Text className="text-2xl font-bold mb-6">Can you see your energy use?</Text>
          <Choice
            label="My charger shows kWh in its app"
            onPress={() => submit('tier_3_native')}
          />
          <Choice
            label="It has Wi-Fi but no app / a basic app"
            onPress={() => submit('tier_2_bridge_kit')}
          />
          <Choice
            label="I have a smart plug or would like one"
            onPress={() => submit('tier_1_smart_plug')}
          />
          <Choice label="None of the above" onPress={() => submit('tier_4_unmetered')} />
          {mut.isPending && <Text className="mt-4 text-gray-500">Saving…</Text>}
        </>
      )}
      {step === 7 && tier && (
        <>
          <Text className="text-3xl font-bold mb-3">{tierCopy(tier).title}</Text>
          <Text className="text-gray-700 mb-8">{tierCopy(tier).body}</Text>
          <Pressable
            onPress={() => router.replace('/(host)/host-onboarding/stripe-connect')}
            className="bg-black rounded-full py-4 items-center"
          >
            <Text className="text-white font-semibold">Continue to payouts</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`border rounded-xl p-4 mb-2 ${
        selected ? 'border-black bg-black' : 'border-gray-300'
      }`}
    >
      <Text className={selected ? 'text-white font-medium' : 'text-black'}>{label}</Text>
    </Pressable>
  );
}

function Next({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`mt-4 rounded-full py-4 items-center ${disabled ? 'bg-gray-300' : 'bg-black'}`}
    >
      <Text className="text-white font-semibold">Next</Text>
    </Pressable>
  );
}

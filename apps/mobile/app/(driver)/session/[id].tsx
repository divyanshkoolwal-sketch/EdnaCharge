import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { trpc } from '../../../src/lib/trpc';
import { supabase } from '../../../src/lib/supabase';

type MeterSample = { energyWh: number; powerW: number; ts: string };

export default function LiveSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [latest, setLatest] = useState<MeterSample | null>(null);
  const [stopping, setStopping] = useState(false);

  // Realtime broadcast channel fed by the CSMS.
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`session:${id}`)
      .on('broadcast', { event: 'meter_value' }, ({ payload }) => {
        setLatest(payload as MeterSample);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [id]);

  // Fallback polling every 5s in case the Realtime channel drops.
  const poll = trpc.booking.get.useQuery({ id: id! }, {
    enabled: false,
  });
  void poll;

  const stop = trpc.booking.stopSession.useMutation({
    onSuccess: () => {
      setTimeout(() => router.replace({ pathname: '/(driver)/receipt/[id]', params: { id: id! } }), 1500);
    },
    onError: (e) => {
      setStopping(false);
      Alert.alert('Oops', e.message);
    },
  });

  const kwh = latest ? latest.energyWh / 1000 : 0;
  const kw = latest ? latest.powerW / 1000 : 0;

  return (
    <View className="flex-1 bg-black px-8 pt-24 pb-12 justify-between">
      <View>
        <Text className="text-white/60">Charging</Text>
        <Text className="text-white text-7xl font-bold mt-4">
          {kwh.toFixed(2)} <Text className="text-3xl">kWh</Text>
        </Text>
        <Text className="text-white/60 mt-2">{kw.toFixed(1)} kW</Text>
      </View>

      {!latest ? (
        <View className="items-center">
          <ActivityIndicator color="#fff" />
          <Text className="text-white/60 mt-2">Waiting for first meter sample…</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setStopping(true);
          stop.mutate({ sessionId: id! });
        }}
        disabled={stopping}
        className={`rounded-full py-6 items-center ${stopping ? 'bg-red-900' : 'bg-red-600'}`}
      >
        <Text className="text-white text-2xl font-bold">
          {stopping ? 'Stopping…' : 'STOP'}
        </Text>
      </Pressable>
    </View>
  );
}

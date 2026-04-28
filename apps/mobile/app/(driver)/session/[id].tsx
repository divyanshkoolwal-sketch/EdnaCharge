// Live session — full-dark wow screen. Bypasses Screen+SafeAreaView wrapper so
// the background extends edge-to-edge regardless of system theme.
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { darkColors } from '../../../src/theme/tokens';
import { trpc } from '../../../src/lib/trpc';
import { supabase } from '../../../src/lib/supabase';
import { Close, Sparkline } from '../../../src/components/icons/Icon';
import { handleError } from '../../../src/lib/errors';

type MeterSample = { energyWh: number; powerW: number; ts: string };

export default function LiveSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [latest, setLatest] = useState<MeterSample | null>(null);
  const [stopping, setStopping] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const c = darkColors;
  const utils = trpc.useUtils();

  // Pull the booking + charger so we can render the real per-kWh price and the
  // host name. Without this we used to multiply by a hard-coded $0.28.
  const sessionInfo = trpc.booking.bySessionId.useQuery(
    { sessionId: id! },
    { enabled: !!id },
  );

  useEffect(() => {
    const client = supabase;
    if (!id || !client) return;
    const ch = client
      .channel(`session:${id}`)
      .on('broadcast', { event: 'meter_value' }, ({ payload }) => {
        setLatest(payload as MeterSample);
      })
      .subscribe();
    return () => {
      void client.removeChannel(ch);
    };
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const stop = trpc.booking.stopSession.useMutation({
    onSuccess: () => {
      utils.booking.list.invalidate();
      utils.booking.bySessionId.invalidate({ sessionId: id! });
      setTimeout(
        () => router.replace({ pathname: '/(driver)/receipt/[id]', params: { id: id! } }),
        1500,
      );
    },
    onError: (e) => {
      setStopping(false);
      handleError(e, { feature: 'Session' });
    },
  });

  const kwh = latest ? latest.energyWh / 1000 : 0;
  const kw = latest ? latest.powerW / 1000 : 0;
  // Real running cost: prefer per-kWh, fall back to per-hour pro-rated by elapsed.
  const charger = sessionInfo.data?.booking.charger;
  const pricePerKwh = charger?.pricePerKwhCents ?? 0;
  const pricePerHour = charger?.pricePerHourCents ?? 0;
  const cost = pricePerKwh
    ? (kwh * pricePerKwh) / 100
    : pricePerHour
      ? ((elapsed / 3600) * pricePerHour) / 100
      : 0;
  const title = charger?.title ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 32 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 8,
          }}
        >
          <Pressable onPress={() => router.back()}>
            <Close size={22} color={c.ink} />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: c.muted, letterSpacing: 1 }}>CHARGING</Text>
            <Text
              style={{ color: c.ink, fontSize: 13, fontWeight: '600', marginTop: 2 }}
              numberOfLines={1}
            >
              {title || 'Session live'}
            </Text>
          </View>
          <View style={{ width: 22 }} />
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, color: c.green2, letterSpacing: 1, marginBottom: 8 }}>
            kWh
          </Text>
          {latest ? (
            <>
              <Text
                style={{
                  fontSize: 76,
                  fontWeight: '800',
                  letterSpacing: -2,
                  lineHeight: 80,
                  color: c.green2,
                }}
              >
                {kwh.toFixed(2)}
              </Text>
              <Text style={{ fontSize: 24, fontWeight: '600', marginTop: 14, color: c.ink }}>
                ${cost.toFixed(2)}
              </Text>
              <Text style={{ marginTop: 6, fontSize: 12, color: c.muted }}>
                {kw.toFixed(1)} kW
              </Text>
              <View style={{ marginTop: 24 }}>
                <Sparkline color={c.green2} />
              </View>
              <Text style={{ marginTop: 14, fontSize: 12, color: c.muted }}>
                {formatElapsed(elapsed)}
              </Text>
            </>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <ActivityIndicator color={c.ink} />
              <Text style={{ color: c.muted, marginTop: 10, fontSize: 13 }}>
                Waiting for first meter reading…
              </Text>
            </View>
          )}
        </View>

        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setStopping(true);
            stop.mutate({ sessionId: id! });
          }}
          disabled={stopping}
          style={({ pressed }) => ({
            backgroundColor: stopping ? '#7A2A22' : c.red,
            height: 64,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 1 }}>
            {stopping ? 'STOPPING…' : 'STOP'}
          </Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

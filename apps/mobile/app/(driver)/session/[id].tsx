// Live session — full-dark wow screen. Bypasses Screen+SafeAreaView wrapper so
// the background extends edge-to-edge regardless of system theme.
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { darkColors } from '../../../src/theme/tokens';
import { trpc } from '../../../src/lib/trpc';
import { openRealtimeChannel } from '../../../src/lib/realtime';
import { Close, Sparkline } from '../../../src/components/icons/Icon';
import { handleError } from '../../../src/lib/errors';

type MeterSample = { energyWh: number; powerW: number; ts: string };

export default function LiveSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [latest, setLatest] = useState<MeterSample | null>(null);
  // Coalesce inbound meter broadcasts: store the newest in a ref and flush to
  // state at most ~2x/sec, so a burst of broadcasts can't thrash re-renders.
  const latestRef = useRef<MeterSample | null>(null);
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
    if (!id) return;
    // Unique topic per mount so re-entering a session never re-attaches to an
    // already-subscribed channel (same crash class as the map). See realtime.ts.
    const sub = openRealtimeChannel(`session:${id}`);
    if (!sub) return;
    sub.channel
      .on('broadcast', { event: 'meter_value' }, ({ payload }) => {
        latestRef.current = payload as MeterSample;
      })
      .subscribe();
    // Flush the latest sample to state ≤2x/sec. setLatest with the same object
    // reference (no new broadcast since last flush) is a no-op render in React,
    // so this only re-renders when a fresh sample actually arrived.
    const flush = setInterval(() => {
      if (latestRef.current) setLatest(latestRef.current);
    }, 500);
    return () => {
      clearInterval(flush);
      sub.remove();
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
      // The receipt screen is keyed by BOOKING id (it calls booking.get). Navigate
      // with the booking id, not the session id, or booking.get misses and the
      // receipt renders blank.
      const bookingId = sessionInfo.data?.booking.id;
      setTimeout(
        () =>
          bookingId
            ? router.replace({ pathname: '/(driver)/receipt/[id]', params: { id: bookingId } })
            : router.replace('/(driver)/bookings'),
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
  // Real running cost at the demand rate LOCKED on this booking (falls back to
  // the charger's stored rate for legacy bookings).
  const charger = sessionInfo.data?.booking.charger;
  const rateCents = sessionInfo.data?.booking.ratePerKwhCents ?? charger?.pricePerKwhCents ?? 0;
  const cost = (kwh * rateCents) / 100;
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
              <Text style={{ color: c.muted2, marginTop: 6, fontSize: 11, textAlign: 'center' }}>
                You can stop the session anytime — even before the meter starts.
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

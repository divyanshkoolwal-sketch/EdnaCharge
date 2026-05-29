import { useEffect, useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { handleError } from '../../../src/lib/errors';
import {
  Screen,
  Card,
  FrameSoft,
  Button,
  CTABar,
  H1,
  Muted,
  Body,
  SectionHeader,
  Row,
  Avatar,
  Divider,
  Input,
} from '../../../src/components/ui';
import { ChevronLeft } from '../../../src/components/icons/Icon';
import { useTheme } from '../../../src/theme/useTheme';
import { trpc } from '../../../src/lib/trpc';

function roundUpToHalfHour(d: Date) {
  const out = new Date(d);
  out.setSeconds(0, 0);
  const m = out.getMinutes();
  if (m === 0 || m === 30) return out;
  out.setMinutes(m < 30 ? 30 : 60);
  return out;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDay(d: Date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function RequestBooking() {
  const { chargerId } = useLocalSearchParams<{ chargerId: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const charger = trpc.charger.get.useQuery({ id: chargerId! }, { enabled: !!chargerId });

  const initialStart = useMemo(() => roundUpToHalfHour(new Date()), []);
  const initialEnd = useMemo(() => new Date(initialStart.getTime() + 60 * 60_000), [initialStart]);
  const [startAt, setStartAt] = useState<Date>(initialStart);
  const [endAt, setEndAt] = useState<Date>(initialEnd);
  const [msg, setMsg] = useState('');
  const hours = Math.max(0.25, (endAt.getTime() - startAt.getTime()) / 3_600_000);

  // Lock the picker to "now + 1 minute" (buffer for form submission). Re-tick
  // every 30s so a user who lingers can't submit a stale start time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const minStart = useMemo(() => new Date(now + 60_000), [now]);

  const utils = trpc.useUtils();
  const mut = trpc.booking.requestBooking.useMutation({
    onSuccess: (r) => {
      utils.booking.list.invalidate();
      utils.chat.listThreads.invalidate();
      router.replace({ pathname: '/(driver)/booking/[id]', params: { id: r.booking.id } });
    },
    onError: (e) => handleError(e, { feature: 'Booking' }),
  });

  if (!charger.data) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }
  const ch = charger.data;
  const estKwh = ch.powerKw * hours;
  const energyCents = ch.pricePerKwhCents
    ? ch.pricePerKwhCents * estKwh
    : ch.pricePerHourCents
      ? ch.pricePerHourCents * hours
      : 0;
  const feeCents = energyCents * 0.15;
  const totalCents = energyCents + feeCents;

  return (
    <Screen keyboardAvoiding>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
      >
        <H1 style={{ marginTop: 14 }}>Request{'\n'}booking</H1>

        <FrameSoft style={{ marginTop: 16 }}>
          <Row gap={10}>
            <Avatar name={ch.host.fullName} size="sm" />
            <Body style={{ fontWeight: '600' }}>{ch.title}</Body>
          </Row>
          <Muted style={{ marginTop: 4 }}>
            {ch.connectorType.toUpperCase()} · {ch.powerKw} kW ·{' '}
            {ch.pricePerKwhCents ? `$${(ch.pricePerKwhCents / 100).toFixed(2)}/kWh` : '—'}
          </Muted>
        </FrameSoft>

        <SectionHeader>When</SectionHeader>
        <Card padding={14}>
          <Row between style={{ marginBottom: 10 }}>
            <Body style={{ fontWeight: '600' }}>Start</Body>
            <Body style={{ color: c.muted }}>
              {fmtDay(startAt)} · {fmtTime(startAt)}
            </Body>
          </Row>
          <DateTimePicker
            value={startAt}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            minuteInterval={15}
            minimumDate={minStart}
            onChange={(_, d) => {
              if (!d) return;
              setStartAt(d);
              if (d.getTime() >= endAt.getTime()) {
                setEndAt(new Date(d.getTime() + 60 * 60_000));
              }
            }}
          />
          <Divider />
          <Row between style={{ marginBottom: 10 }}>
            <Body style={{ fontWeight: '600' }}>End</Body>
            <Body style={{ color: c.muted }}>
              {fmtDay(endAt)} · {fmtTime(endAt)} · {hours.toFixed(1)}h
            </Body>
          </Row>
          <DateTimePicker
            value={endAt}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            minuteInterval={15}
            minimumDate={new Date(startAt.getTime() + 15 * 60_000)}
            onChange={(_, d) => {
              if (!d) return;
              setEndAt(d);
            }}
          />
        </Card>

        <SectionHeader>Message to host</SectionHeader>
        <Input
          value={msg}
          onChangeText={setMsg}
          placeholder="e.g. arriving at 3:15, blue Model 3"
          multiline
          style={{ minHeight: 80, paddingTop: 14, paddingBottom: 14, height: undefined }}
        />

        <SectionHeader>Estimated cost</SectionHeader>
        <Card padding={14}>
          <Row between style={{ marginBottom: 6 }}>
            <Muted>Energy (~{estKwh.toFixed(1)} kWh)</Muted>
            <Body>${(energyCents / 100).toFixed(2)}</Body>
          </Row>
          <Row between style={{ marginBottom: 6 }}>
            <Muted>Platform fee (15%)</Muted>
            <Body>${(feeCents / 100).toFixed(2)}</Body>
          </Row>
          <Divider />
          <Row between>
            <Body style={{ fontWeight: '700' }}>Pre-auth on your card</Body>
            <Body style={{ fontWeight: '700' }}>${(totalCents / 100).toFixed(2)}</Body>
          </Row>
          <Muted style={{ fontSize: 11, marginTop: 6, color: c.muted2 }}>
            Your card is held — you'll only be charged for what you actually use.
          </Muted>
        </Card>
      </ScrollView>
      <CTABar>
        <Button
          label="Send request"
          loading={mut.isPending}
          onPress={() => {
            mut.mutate({
              chargerId: chargerId!,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
              message: msg || undefined,
            });
          }}
        />
      </CTABar>
    </Screen>
  );
}

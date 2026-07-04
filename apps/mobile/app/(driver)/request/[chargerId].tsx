/** @file apps/mobile/app/(driver)/request/[chargerId].tsx. */
import { useEffect, useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, Platform } from 'react-native';
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
  ErrorState,
} from '../../../src/components/ui';
import { ChevronLeft } from '../../../src/components/icons/Icon';
import { useTheme } from '../../../src/theme/useTheme';
import { demandRateCents, isWindowAvailable, availabilityTimeZoneSupported } from '@edna/schemas';
import { trpc } from '../../../src/lib/trpc';
import { track } from '../../../src/lib/analytics';

const MAX_BOOKING_MS = 24 * 60 * 60_000;
const MAX_START_LEAD_MS = 7 * 24 * 60 * 60_000;
const MESSAGE_MAX = 500;

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

function availabilityLabel(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return 'Available all week';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const windows = value
    .slice(0, 3)
    .map((row) => {
      const r = row as { dow?: number; start?: string; end?: string };
      return typeof r.dow === 'number' && r.start && r.end
        ? `${days[r.dow] ?? 'Day'} ${r.start}-${r.end}`
        : null;
    })
    .filter(Boolean)
    .join(' · ');
  // Windows are enforced server-side in Pacific time; label them so a non-Pacific
  // driver reads the hours in the host's zone, not their own device time.
  return windows ? `${windows} PT` : windows;
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
  const maxStart = useMemo(() => new Date(now + MAX_START_LEAD_MS), [now]);
  const maxEnd = useMemo(() => new Date(startAt.getTime() + MAX_BOOKING_MS), [startAt]);

  const utils = trpc.useUtils();
  const mut = trpc.booking.requestBooking.useMutation({
    onSuccess: (r) => {
      utils.booking.list.invalidate();
      utils.chat.listThreads.invalidate();
      track('booking_requested', { bookingId: r.booking.id, chargerId: chargerId! });
      router.replace({ pathname: '/(driver)/booking/[id]', params: { id: r.booking.id } });
    },
    onError: (e) => handleError(e, { feature: 'Booking' }),
  });

  // Memoized: isWindowAvailable steps every minute of the window doing Intl
  // formatting (~1440 calls for a 24h window), so recomputing it on every render
  // (e.g. each message keystroke) would jank the form.
  const windowAvailable = useMemo(() => {
    const av = charger.data?.availability;
    if (av == null) return true;
    return !availabilityTimeZoneSupported() || isWindowAvailable(av, startAt, endAt);
  }, [charger.data?.availability, startAt, endAt]);

  if (charger.isLoading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (charger.isError || !charger.data) {
    return (
      <Screen>
        <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }} hitSlop={10}>
          <ChevronLeft />
        </Pressable>
        <ErrorState onRetry={() => charger.refetch()} />
      </Screen>
    );
  }
  const ch = charger.data;
  const estKwh = ch.powerKw * hours;
  // Server locks demand pricing at the selected start time. Mirror that
  // deterministic schedule so the pre-auth preview matches future peak windows.
  // Round on the same steps as the server (estimateBooking) so the displayed
  // pre-auth matches the amount actually authorized to the cent.
  const rateCents = demandRateCents(startAt);
  const energyCents = Math.round(rateCents * estKwh);
  const feeCents = Math.round(energyCents * 0.15);
  const totalCents = energyCents + feeCents;
  const bookingWindowValid =
    startAt.getTime() >= minStart.getTime() - 60_000 &&
    startAt.getTime() <= maxStart.getTime() &&
    endAt.getTime() > startAt.getTime() &&
    endAt.getTime() - startAt.getTime() <= MAX_BOOKING_MS;
  const canSubmit =
    bookingWindowValid && windowAvailable && msg.length <= MESSAGE_MAX && !mut.isPending;

  return (
    <Screen keyboardAvoiding contentStyle={{ paddingBottom: 130 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <H1 style={{ marginTop: 14 }}>Request{'\n'}booking</H1>

      <FrameSoft style={{ marginTop: 16 }}>
        <Row gap={10}>
          <Avatar name={ch.host.fullName} size="sm" />
          <Body style={{ fontWeight: '600' }}>{ch.title}</Body>
        </Row>
        <Muted style={{ marginTop: 4 }}>
          {ch.connectorType.toUpperCase()} · {ch.powerKw} kW · ${(rateCents / 100).toFixed(2)}/kWh
          for selected start
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
          maximumDate={maxStart}
          onChange={(_, d) => {
            if (!d) return;
            setStartAt(d);
            if (d.getTime() >= endAt.getTime()) {
              setEndAt(new Date(d.getTime() + 60 * 60_000));
            } else if (endAt.getTime() - d.getTime() > MAX_BOOKING_MS) {
              setEndAt(new Date(d.getTime() + MAX_BOOKING_MS));
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
          maximumDate={maxEnd}
          onChange={(_, d) => {
            if (!d) return;
            setEndAt(d);
          }}
        />
      </Card>

      <FrameSoft style={{ marginTop: 12 }}>
        <Muted>{availabilityLabel(ch.availability)}</Muted>
        {!windowAvailable ? (
          <Muted style={{ marginTop: 6, color: c.red }}>
            Your selected time is outside the host's available hours. Pick a time within the window
            above.
          </Muted>
        ) : null}
      </FrameSoft>

      <SectionHeader>Message to host</SectionHeader>
      <Input
        value={msg}
        onChangeText={setMsg}
        placeholder="e.g. arriving at 3:15, blue Model 3"
        maxLength={MESSAGE_MAX}
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
      <CTABar>
        <Button
          label="Send request"
          loading={mut.isPending}
          disabled={!canSubmit}
          onPress={() => {
            if (!canSubmit) return;
            mut.mutate({
              chargerId: chargerId!,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
              message: msg.trim() || undefined,
            });
          }}
        />
      </CTABar>
    </Screen>
  );
}

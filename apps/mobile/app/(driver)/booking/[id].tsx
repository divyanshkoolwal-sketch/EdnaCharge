import { useState, useEffect, useMemo } from 'react';
import { View, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { handleError } from '../../../src/lib/errors';
import {
  Screen,
  Card,
  Button,
  CTABar,
  H1,
  Muted,
  StatusPill,
  type Status,
  Row,
  Body,
  Divider,
  SectionHeader,
  ErrorState,
} from '../../../src/components/ui';
import { ChevronLeft } from '../../../src/components/icons/Icon';
import { useTheme } from '../../../src/theme/useTheme';
import { ChargerIllo } from '../../../src/components/illustrations/HomeCharger';
import { trpc } from '../../../src/lib/trpc';

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [editStart, setEditStart] = useState<Date | null>(null);
  const [editEnd, setEditEnd] = useState<Date | null>(null);
  // Re-tick "now" so a lingering editor can't submit a stale start time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!editing) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [editing]);
  const minStart = useMemo(() => new Date(now + 60_000), [now]);
  // Editing pauses polling so a refetch doesn't clobber the in-progress edit.
  const q = trpc.booking.get.useQuery(
    { id: id! },
    { enabled: !!id, refetchInterval: editing ? false : 4000 },
  );
  // Whether the driver has already rated their host on this booking (drives the
  // durable "Rate host" affordance on a completed booking).
  const myReview = trpc.review.mine.useQuery({ bookingId: id! }, { enabled: !!id });
  const modify = trpc.booking.modify.useMutation({
    onSuccess: () => {
      utils.booking.get.invalidate({ id: id! });
      utils.booking.list.invalidate();
      utils.chat.getThread.invalidate();
      setEditing(false);
    },
    onError: (e) => handleError(e, { feature: 'Booking' }),
  });
  const start = trpc.booking.startSession.useMutation({
    onSuccess: () => {
      utils.booking.get.invalidate({ id: id! });
      utils.booking.list.invalidate();
    },
    onError: (e) => handleError(e, { feature: 'Session' }),
  });
  const cancel = trpc.booking.cancel.useMutation({
    onSuccess: () => {
      utils.booking.get.invalidate({ id: id! });
      utils.booking.list.invalidate();
    },
    onError: (e) => handleError(e, { feature: 'Booking' }),
  });

  if (q.isLoading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Screen>
        <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }} hitSlop={10}>
          <ChevronLeft />
        </Pressable>
        <ErrorState onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  const b = q.data;
  const startable = b.status === 'confirmed';
  const hasSession = b.session !== null;
  const startTime = new Date(b.startAt);
  const endTime = new Date(b.endAt);
  const hours = (endTime.getTime() - startTime.getTime()) / 3_600_000;
  const canModify = b.status === 'pending';

  // Live estimate while editing the window, mirroring the request screen.
  const es = editStart ?? startTime;
  const ee = editEnd ?? endTime;
  const editHours = Math.max(0.25, (ee.getTime() - es.getTime()) / 3_600_000);
  const ch = b.charger;
  const editKwh = ch.powerKw * editHours;
  // Preview at the rate locked on this booking; the server re-quotes at the
  // current demand rate when the modify is submitted.
  const editRateCents = b.ratePerKwhCents ?? 0;
  const editEnergyCents = editRateCents * editKwh;
  const editFeeCents = editEnergyCents * 0.15;
  const editTotalCents = editEnergyCents + editFeeCents;

  const beginEdit = () => {
    setEditStart(startTime);
    setEditEnd(endTime);
    setEditing(true);
  };

  return (
    <Screen scroll contentStyle={{ paddingBottom: 160 }}>
      <Row between style={{ paddingTop: 8 }}>
        <Pressable onPress={() => router.back()}>
          <ChevronLeft />
        </Pressable>
        <Muted>Booking</Muted>
        <View style={{ width: 22 }} />
      </Row>

      <View style={{ marginTop: 16, alignItems: 'center' }}>
        <StatusPill status={b.status as Status} />
        <H1 style={{ marginTop: 14, fontSize: 24, textAlign: 'center' }}>
          {formatTimeRange(startTime, endTime)}
        </H1>
        <Muted style={{ marginTop: 4 }}>
          {hours.toFixed(1)} hour{hours === 1 ? '' : 's'} · ~{b.estimatedKwh.toFixed(1)} kWh
        </Muted>
      </View>

      <Card padding={14} style={{ marginTop: 18 }}>
        <ChargerIllo height={100} />
        <View style={{ marginTop: 10 }}>
          <Body style={{ fontWeight: '700' }}>{b.charger.title}</Body>
          <Muted style={{ marginTop: 2 }}>
            {b.charger.addressLine1}, {b.charger.city}
          </Muted>
        </View>
      </Card>

      {editing ? (
        <>
          <SectionHeader>Change times</SectionHeader>
          <Card padding={14}>
            <Row between style={{ marginBottom: 10 }}>
              <Body style={{ fontWeight: '600' }}>Start</Body>
            </Row>
            <DateTimePicker
              value={es}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'compact' : 'default'}
              minuteInterval={15}
              minimumDate={minStart}
              onChange={(_, d) => {
                if (!d) return;
                setEditStart(d);
                if (d.getTime() >= ee.getTime()) {
                  setEditEnd(new Date(d.getTime() + 60 * 60_000));
                }
              }}
            />
            <Divider />
            <Row between style={{ marginBottom: 10 }}>
              <Body style={{ fontWeight: '600' }}>End</Body>
              <Muted>{editHours.toFixed(1)}h</Muted>
            </Row>
            <DateTimePicker
              value={ee}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'compact' : 'default'}
              minuteInterval={15}
              minimumDate={new Date(es.getTime() + 15 * 60_000)}
              onChange={(_, d) => {
                if (!d) return;
                setEditEnd(d);
              }}
            />
            <Divider />
            <Row between>
              <Muted>New pre-auth (~{editKwh.toFixed(1)} kWh)</Muted>
              <Body style={{ fontWeight: '700' }}>${(editTotalCents / 100).toFixed(2)}</Body>
            </Row>
            <Muted style={{ fontSize: 11, marginTop: 6, color: c.muted2 }}>
              Your current hold is released and replaced with the new amount.
            </Muted>
          </Card>
        </>
      ) : null}

      <SectionHeader>Pricing</SectionHeader>
      <Card padding={16}>
        <Row between style={{ marginBottom: 8 }}>
          <Body style={{ color: '#6B6B70', fontSize: 13 }}>Energy (~{b.estimatedKwh.toFixed(1)} kWh)</Body>
          <Body style={{ color: '#0F0F10', fontSize: 14, fontWeight: '600' }}>
            ${(b.estimatedCostCents / 100).toFixed(2)}
          </Body>
        </Row>
        <Row between style={{ marginBottom: 8 }}>
          <Body style={{ color: '#6B6B70', fontSize: 13 }}>Platform fee (15%)</Body>
          <Body style={{ color: '#0F0F10', fontSize: 14, fontWeight: '600' }}>
            ${(b.platformFeeCents / 100).toFixed(2)}
          </Body>
        </Row>
        <View style={{ height: 1, backgroundColor: 'rgba(15,15,16,0.08)', marginVertical: 8 }} />
        <Row between style={{ marginBottom: 8 }}>
          <Body style={{ color: '#0F0F10', fontSize: 14, fontWeight: '700' }}>Pre-auth held</Body>
          <Body style={{ color: '#0F0F10', fontSize: 16, fontWeight: '800' }}>
            ${(b.preauthAmountCents / 100).toFixed(2)}
          </Body>
        </Row>
        <Row between>
          <Body style={{ color: '#6B6B70', fontSize: 13 }}>Captured</Body>
          <Body style={{ color: '#0F0F10', fontSize: 14, fontWeight: '600' }}>
            {b.capturedAmountCents != null ? `$${(b.capturedAmountCents / 100).toFixed(2)}` : '—'}
          </Body>
        </Row>
      </Card>

      <CTABar>
        {editing ? (
          <>
            <Button
              label={modify.isPending ? 'Saving…' : 'Save changes'}
              loading={modify.isPending}
              onPress={() =>
                modify.mutate({
                  bookingId: b.id,
                  startAt: es.toISOString(),
                  endAt: ee.toISOString(),
                })
              }
            />
            <Button
              label="Discard"
              variant="secondary"
              height={44}
              fontSize={14}
              onPress={() => setEditing(false)}
            />
          </>
        ) : (
          <>
            {startable && !hasSession ? (
              <Button label="Start session" onPress={() => start.mutate({ bookingId: b.id })} loading={start.isPending} />
            ) : null}
            {b.session && b.status !== 'completed' ? (
              <Button
                label="View live session"
                onPress={() =>
                  router.push({ pathname: '/(driver)/session/[id]', params: { id: b.session!.id } })
                }
              />
            ) : null}
            {b.status === 'completed' ? (
              <Button
                label={myReview.data ? `You rated your host ${myReview.data.stars}★` : 'Rate your host'}
                variant={myReview.data ? 'secondary' : 'primary'}
                onPress={() =>
                  router.push({ pathname: '/(driver)/receipt/[id]', params: { id: b.id } })
                }
              />
            ) : null}
            {canModify ? (
              <Button
                label="Change times"
                variant="secondary"
                height={44}
                fontSize={14}
                onPress={beginEdit}
              />
            ) : null}
            {b.chatThread ? (
              <Button
                label="Open chat with host"
                variant="secondary"
                height={44}
                fontSize={14}
                onPress={() =>
                  router.push({ pathname: '/(driver)/chat/[bookingId]', params: { bookingId: b.id } })
                }
              />
            ) : null}
            {['pending', 'confirmed'].includes(b.status) ? (
              <Button
                label="Cancel booking"
                variant="destructive-outline"
                height={44}
                fontSize={14}
                onPress={() => cancel.mutate({ bookingId: b.id, reason: 'driver_cancel' })}
              />
            ) : null}
          </>
        )}
      </CTABar>
    </Screen>
  );
}

function formatTimeRange(s: Date, e: Date) {
  const sameDay = s.toDateString() === e.toDateString();
  const startStr = s.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  const endStr = e.toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(sameDay ? {} : { weekday: 'short' }),
  });
  return `${startStr} → ${endStr}`;
}

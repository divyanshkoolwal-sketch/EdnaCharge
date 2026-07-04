/** Driver booking detail screen with edit, session, chat, and review actions. */
import { useState, useEffect, useMemo } from 'react';
import { View, Pressable, Platform, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { handleError } from '../../../src/lib/errors';
import {
  Screen,
  Card,
  Button,
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
import {
  BookingActionBar,
  BookingPricingCard,
  bookingEditEstimate,
  bookingStartState,
} from '../../../src/features/bookings/BookingDetailSections';
import { track } from '../../../src/lib/analytics';

const MAX_BOOKING_MS = 24 * 60 * 60_000;
const MAX_START_LEAD_MS = 7 * 24 * 60 * 60_000;

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
  const maxStart = useMemo(() => new Date(now + MAX_START_LEAD_MS), [now]);
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
  const hasSession = b.session !== null;
  const startTime = new Date(b.startAt);
  const endTime = new Date(b.endAt);
  const { startable, startHint } = bookingStartState(b.status, startTime, endTime, hasSession, now);
  const hours = (endTime.getTime() - startTime.getTime()) / 3_600_000;
  const canModify = b.status === 'pending';

  // Live estimate while editing the window, mirroring the request screen.
  const es = editStart ?? startTime;
  const ee = editEnd ?? endTime;
  const ch = b.charger;
  const { editHours, editKwh, editRateCents, editEnergyCents, editFeeCents, editTotalCents } =
    bookingEditEstimate(es, ee, ch.powerKw);
  const editWindowValid =
    es.getTime() >= minStart.getTime() - 60_000 &&
    es.getTime() <= maxStart.getTime() &&
    ee.getTime() > es.getTime() &&
    ee.getTime() - es.getTime() <= MAX_BOOKING_MS;

  const beginEdit = () => {
    setEditStart(startTime);
    setEditEnd(endTime);
    setEditing(true);
  };

  const confirmCancel = () => {
    if (cancel.isPending) return;
    Alert.alert(
      'Cancel booking?',
      'This releases your held charging window and cannot be undone.',
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: () => cancel.mutate({ bookingId: b.id, reason: 'driver_cancel' }),
        },
      ],
    );
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
              maximumDate={maxStart}
              onChange={(_, d) => {
                if (!d) return;
                setEditStart(d);
                if (d.getTime() >= ee.getTime()) {
                  setEditEnd(new Date(d.getTime() + 60 * 60_000));
                } else if (ee.getTime() - d.getTime() > MAX_BOOKING_MS) {
                  setEditEnd(new Date(d.getTime() + MAX_BOOKING_MS));
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
              maximumDate={new Date(es.getTime() + MAX_BOOKING_MS)}
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
      <BookingPricingCard
        estimatedKwh={b.estimatedKwh}
        estimatedCostCents={b.estimatedCostCents}
        platformFeeCents={b.platformFeeCents}
        preauthAmountCents={b.preauthAmountCents}
        capturedAmountCents={b.capturedAmountCents}
      />
      <Button
        label="Contact support"
        variant="secondary"
        height={44}
        fontSize={13}
        onPress={() => router.push({ pathname: '/(shared)/support', params: { bookingId: b.id } })}
        style={{ marginTop: 12 }}
      />

      <BookingActionBar
        editing={editing}
        savePending={modify.isPending}
        editWindowValid={editWindowValid}
        startable={startable}
        startHint={startHint}
        hasSession={hasSession}
        sessionId={b.session?.id}
        status={b.status}
        reviewStars={myReview.data?.stars}
        canModify={canModify}
        hasChatThread={Boolean(b.chatThread)}
        startPending={start.isPending}
        cancelPending={cancel.isPending}
        onSave={() =>
          modify.mutate({
            bookingId: b.id,
            startAt: es.toISOString(),
            endAt: ee.toISOString(),
          })
        }
        onDiscard={() => setEditing(false)}
        onStart={() => {
          track('session_start_requested', { bookingId: b.id });
          start.mutate({ bookingId: b.id });
        }}
        onViewSession={(sessionId) =>
          router.push({ pathname: '/(driver)/session/[id]', params: { id: sessionId } })
        }
        onReview={() => router.push({ pathname: '/(driver)/receipt/[id]', params: { id: b.id } })}
        onModify={beginEdit}
        onChat={() =>
          router.push({ pathname: '/(driver)/chat/[bookingId]', params: { bookingId: b.id } })
        }
        onCancel={confirmCancel}
      />
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

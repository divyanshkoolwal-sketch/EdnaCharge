import { View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  SectionHeader,
} from '../../../src/components/ui';
import { ChevronLeft } from '../../../src/components/icons/Icon';
import { ChargerIllo } from '../../../src/components/illustrations/HomeCharger';
import { trpc } from '../../../src/lib/trpc';

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const q = trpc.booking.get.useQuery({ id: id! }, { enabled: !!id, refetchInterval: 4000 });
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

  if (!q.data) return <Screen><View /></Screen>;
  const b = q.data;
  const startable = b.status === 'confirmed';
  const hasSession = b.session !== null;
  const startTime = new Date(b.startAt);
  const endTime = new Date(b.endAt);
  const hours = (endTime.getTime() - startTime.getTime()) / 3_600_000;

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

      <SectionHeader>Pricing</SectionHeader>
      <Card padding={14}>
        <Row between style={{ marginBottom: 6 }}>
          <Muted>Pre-auth held</Muted>
          <Body>${(b.preauthAmountCents / 100).toFixed(2)}</Body>
        </Row>
        <Row between>
          <Muted>Captured</Muted>
          <Body>{b.capturedAmountCents != null ? `$${(b.capturedAmountCents / 100).toFixed(2)}` : '—'}</Body>
        </Row>
      </Card>

      <CTABar>
        {startable && !hasSession ? (
          <Button label="Start session" onPress={() => start.mutate({ bookingId: b.id })} loading={start.isPending} />
        ) : null}
        {b.session ? (
          <Button
            label="View live session"
            onPress={() =>
              router.push({ pathname: '/(driver)/session/[id]', params: { id: b.session!.id } })
            }
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

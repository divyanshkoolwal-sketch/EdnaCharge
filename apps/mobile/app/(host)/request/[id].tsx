/** @file apps/mobile/app/(host)/request/[id].tsx. */
import { View, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { handleError } from '../../../src/lib/errors';
import {
  Screen,
  Card,
  FrameSoft,
  Avatar,
  H1,
  Body,
  Muted,
  Label,
  Row,
  Button,
  CTABar,
  SectionHeader,
  ListSkeleton,
  ErrorState,
  useToast,
} from '../../../src/components/ui';
import { ChevronLeft, Star } from '../../../src/components/icons/Icon';
import { trpc } from '../../../src/lib/trpc';
import { useTheme } from '../../../src/theme/useTheme';
import { haptics } from '../../../src/lib/haptics';
import { track } from '../../../src/lib/analytics';

// Real decline reasons → the host isn't railroaded into a single hardcoded
// "not available", and the driver gets a useful signal.
const DECLINE_REASONS = [
  'Not available then',
  'Charger needs maintenance',
  'Already booked',
  'Other',
];

export default function HostRequestReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const q = trpc.booking.get.useQuery({ id: id! }, { enabled: !!id });
  const utils = trpc.useUtils();
  const toast = useToast();
  const respond = trpc.booking.respond.useMutation({
    onSuccess: (_data, vars) => {
      utils.booking.list.invalidate();
      utils.booking.get.invalidate({ id: id! });
      utils.chat.getThread.invalidate();
      track('booking_responded', { bookingId: vars.bookingId, decision: vars.decision });
      toast.show(vars.decision === 'accept' ? 'Booking accepted' : 'Request declined', 'success');
      router.back();
    },
    onError: (e) => {
      utils.booking.list.invalidate();
      utils.booking.get.invalidate({ id: id! });
      handleError(e, { feature: 'Booking' });
    },
  });

  const confirmDecline = (bookingId: string) => {
    haptics.warning();
    Alert.alert('Decline this request?', 'Pick a reason — the driver will be notified.', [
      ...DECLINE_REASONS.map((reason) => ({
        text: reason,
        onPress: () => respond.mutate({ bookingId, decision: 'decline' as const, reason }),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  if (q.isError) {
    return (
      <Screen>
        <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }} hitSlop={10}>
          <ChevronLeft />
        </Pressable>
        <ErrorState onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  if (!q.data) {
    return (
      <Screen scroll contentStyle={{ paddingTop: 24 }}>
        <ListSkeleton count={3} />
      </Screen>
    );
  }
  const b = q.data;
  const canRespond = b.status === 'pending';
  // The host earns the full energy value: estimatedCostCents is energy-only and
  // the 15% platform fee is a surcharge ADDED to the driver's bill (pricing.ts),
  // not deducted from the host. Settlement pays the host = energy, so the "Your
  // earnings" estimate must equal estimatedCostCents (subtracting the fee here
  // under-stated it by 15%).
  const estimatedNetCents = b.estimatedCostCents;

  return (
    <Screen scroll contentStyle={{ paddingBottom: 160 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>

      <Card padding={14} style={{ marginTop: 14 }}>
        <Row gap={12}>
          <Avatar name={b.driver?.fullName ?? 'Driver'} />
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>{b.driver?.fullName ?? 'Driver'}</Body>
            <Muted style={{ fontSize: 11 }}>{b.charger.title}</Muted>
            {b.driver?.id ? <DriverRatingInline driverId={b.driver.id} /> : null}
          </View>
        </Row>
      </Card>

      <View style={{ marginTop: 18, alignItems: 'center' }}>
        <Label>BOOKING WINDOW</Label>
        <H1 style={{ marginTop: 4, fontSize: 24 }}>{new Date(b.startAt).toLocaleString()}</H1>
      </View>

      <Card padding={14} style={{ marginTop: 14 }}>
        <Row between style={{ marginBottom: 6 }}>
          <Muted>Estimated kWh</Muted>
          <Body style={{ fontWeight: '600' }}>~{b.estimatedKwh.toFixed(1)}</Body>
        </Row>
        <Row between>
          <Muted>Your earnings</Muted>
          <Body style={{ fontWeight: '700', fontSize: 18 }}>
            ${(estimatedNetCents / 100).toFixed(2)}
          </Body>
        </Row>
      </Card>

      {b.driverMessage ? (
        <>
          <SectionHeader>Their message</SectionHeader>
          <FrameSoft>
            <Body style={{ fontStyle: 'italic', color: c.muted }}>"{b.driverMessage}"</Body>
          </FrameSoft>
        </>
      ) : null}

      {b.chatThread ? (
        <Button
          label="Open chat"
          variant="secondary"
          height={44}
          fontSize={13}
          onPress={() =>
            router.push({ pathname: '/(host)/chat/[bookingId]', params: { bookingId: b.id } })
          }
          style={{ marginTop: 14 }}
        />
      ) : null}

      {canRespond ? (
        <CTABar>
          <Button
            label="Accept"
            loading={respond.isPending}
            onPress={() => {
              haptics.medium();
              respond.mutate({ bookingId: b.id, decision: 'accept' });
            }}
          />
          <Button
            label="Decline"
            variant="destructive-outline"
            height={44}
            fontSize={14}
            disabled={respond.isPending}
            onPress={() => confirmDecline(b.id)}
          />
        </CTABar>
      ) : null}
    </Screen>
  );
}

function DriverRatingInline({ driverId }: { driverId: string }) {
  const summary = trpc.review.summary.useQuery({ userId: driverId });
  const count = summary.data?.count ?? 0;
  const avg = summary.data?.avg;
  if (count === 0 || typeof avg !== 'number') {
    return <Muted style={{ fontSize: 11, marginTop: 2 }}>New driver</Muted>;
  }
  return (
    <Row gap={4} style={{ marginTop: 2 }}>
      <Star size={11} />
      <Muted style={{ fontSize: 11 }}>
        {avg.toFixed(1)} · {count} {count === 1 ? 'session' : 'sessions'}
      </Muted>
    </Row>
  );
}

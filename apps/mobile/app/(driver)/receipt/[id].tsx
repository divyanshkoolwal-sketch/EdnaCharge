/** @file apps/mobile/app/(driver)/receipt/[id].tsx. */
import { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { handleError } from '../../../src/lib/errors';
import {
  Screen,
  Card,
  Button,
  CTABar,
  H1Lg,
  Body,
  Muted,
  SectionHeader,
  Row,
  Divider,
  Input,
  ErrorState,
} from '../../../src/components/ui';
import { Close, Star } from '../../../src/components/icons/Icon';
import { useTheme } from '../../../src/theme/useTheme';
import { trpc } from '../../../src/lib/trpc';
import { haptics } from '../../../src/lib/haptics';
import { useToast } from '../../../src/components/ui';

export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const utils = trpc.useUtils();
  const toast = useToast();
  // Settle-session can take a few seconds (BullMQ + Stripe); after 30s of
  // 'Settling…' we surface a real error instead of pretending it's still
  // processing. Counter starts when the receipt screen mounts.
  const [settleStartedAt] = useState(() => Date.now());
  const [settleTimedOut, setSettleTimedOut] = useState(false);
  const q = trpc.booking.get.useQuery(
    { id: id! },
    {
      enabled: !!id,
      refetchInterval: (query) =>
        query.state.data?.capturedAmountCents == null && !settleTimedOut ? 3000 : false,
    },
  );
  // Already-reviewed guard: if the driver rated this booking, show the submitted
  // state instead of letting a second submit hit a CONFLICT.
  const mine = trpc.review.mine.useQuery({ bookingId: id! }, { enabled: !!id });
  const review = trpc.review.create.useMutation({
    onSuccess: () => {
      utils.booking.list.invalidate();
      utils.charger.get.invalidate();
      utils.review.mine.invalidate({ bookingId: id! });
      utils.review.summary.invalidate();
      toast.show('Thanks for your review', 'success');
      router.replace('/(driver)/bookings');
    },
    onError: (e) => handleError(e, { feature: 'Review' }),
  });
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');

  useEffect(() => {
    if (q.data?.capturedAmountCents != null) return; // already settled
    const t = setTimeout(() => setSettleTimedOut(true), 30_000 - (Date.now() - settleStartedAt));
    return () => clearTimeout(t);
  }, [q.data?.capturedAmountCents, settleStartedAt]);

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
        <Pressable
          onPress={() => router.replace('/(driver)/bookings')}
          style={{ paddingTop: 8 }}
          hitSlop={10}
        >
          <Close />
        </Pressable>
        <ErrorState onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  const b = q.data;
  const captured = b.capturedAmountCents ?? null;
  const kwh = b.session?.finalKwh ?? 0;
  const rawEnergy = b.session?.finalCostCents ?? 0;
  // Mirror worker settlement (settle-session.ts): platform fee = 15% of the
  // energy actually paid for, capped at the captured amount on an over-run.
  // energy shown = captured − fee. Deriving fee as (captured − energy) instead
  // wrongly collapsed the fee to $0 and showed the whole capture as "Energy" on
  // a clamped over-run session.
  const fee =
    captured != null ? Math.round(Math.min(rawEnergy, captured) * 0.15) : b.platformFeeCents;
  const energy = captured != null ? captured - fee : rawEnergy;
  const settling = captured == null && !settleTimedOut;
  const settleFailed = captured == null && settleTimedOut;

  return (
    <Screen scroll contentStyle={{ paddingBottom: 160 }}>
      <Row between style={{ paddingTop: 8 }}>
        <Pressable onPress={() => router.back()}>
          <Close />
        </Pressable>
        <Muted>Receipt</Muted>
        <View style={{ width: 22 }} />
      </Row>

      <View style={{ alignItems: 'center', marginTop: 18 }}>
        <Body style={{ fontWeight: '600', fontSize: 14 }}>Session complete</Body>
        <H1Lg style={{ marginTop: 8, fontSize: 56, letterSpacing: -1 }}>{kwh.toFixed(2)}</H1Lg>
        <Muted style={{ fontSize: 14, marginTop: 4 }}>kWh</Muted>
      </View>

      <Card padding={14} style={{ marginTop: 18 }}>
        <Row between style={{ marginBottom: 8 }}>
          <Muted>Energy</Muted>
          <Body>${(energy / 100).toFixed(2)}</Body>
        </Row>
        <Row between style={{ marginBottom: 8 }}>
          <Muted>Rate</Muted>
          <Body>
            {b.ratePerKwhCents != null ? `$${(b.ratePerKwhCents / 100).toFixed(2)}/kWh` : 'Legacy'}
          </Body>
        </Row>
        <Row between style={{ marginBottom: 8 }}>
          <Muted>Platform fee (15%)</Muted>
          <Body>${(fee / 100).toFixed(2)}</Body>
        </Row>
        <Divider />
        <Row between>
          <Body style={{ fontWeight: '700', fontSize: 17 }}>Total charged</Body>
          <Body style={{ fontWeight: '700', fontSize: 17 }}>
            {captured != null
              ? `$${(captured / 100).toFixed(2)}`
              : settleFailed
                ? '—'
                : 'Settling…'}
          </Body>
        </Row>
        {(b.refundedAmountCents ?? 0) > 0 ? (
          <Row between style={{ marginTop: 8 }}>
            <Muted style={{ color: c.green2 }}>Refunded</Muted>
            <Body style={{ color: c.green2, fontWeight: '600' }}>
              −${((b.refundedAmountCents ?? 0) / 100).toFixed(2)}
            </Body>
          </Row>
        ) : null}
        {settleFailed ? (
          <Muted style={{ fontSize: 11, marginTop: 8, color: c.red }}>
            We couldn't finalize the charge yet. Don't worry — we'll keep retrying in the background
            and email you a receipt once it settles. Contact support if you don't see one within 24
            hours.
          </Muted>
        ) : (
          <Muted style={{ fontSize: 11, marginTop: 8 }}>
            {captured != null
              ? `Pre-auth of $${(b.preauthAmountCents / 100).toFixed(2)} was released; we only captured what you used.`
              : 'Finalizing the charge. Your pre-auth will be released once settlement completes.'}
          </Muted>
        )}
      </Card>

      {b.stripeReceiptUrl ? (
        <Button
          label="Open Stripe receipt"
          variant="secondary"
          height={44}
          fontSize={13}
          onPress={() => Linking.openURL(b.stripeReceiptUrl!)}
          style={{ marginTop: 12 }}
        />
      ) : null}
      <Button
        label="Contact support"
        variant="secondary"
        height={44}
        fontSize={13}
        onPress={() => router.push({ pathname: '/(shared)/support', params: { bookingId: b.id } })}
        style={{ marginTop: 8 }}
      />

      <SectionHeader>Rate your host</SectionHeader>
      {mine.data ? (
        <Card padding={14}>
          <Row gap={6} style={{ justifyContent: 'center' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={24} color={n <= mine.data!.stars ? c.orange : c.line2} />
            ))}
          </Row>
          <Muted style={{ textAlign: 'center', marginTop: 10, fontSize: 13 }}>
            You rated your host {mine.data.stars}★. Thanks for the feedback!
          </Muted>
        </Card>
      ) : (
        <Card padding={14}>
          <Row gap={6} style={{ justifyContent: 'center' }} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => {
                  haptics.selection();
                  setStars(n);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: n === stars }}
                accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
              >
                <Star size={28} color={n <= stars ? c.orange : c.line2} />
              </Pressable>
            ))}
          </Row>
          <View style={{ marginTop: 12 }}>
            <Input
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              placeholder="Add a comment (optional)"
              style={{ minHeight: 60, height: undefined, paddingTop: 14, paddingBottom: 14 }}
            />
          </View>
        </Card>
      )}

      <CTABar>
        {mine.data ? (
          <Button label="Done" onPress={() => router.replace('/(driver)/bookings')} />
        ) : (
          <>
            <Button
              label={review.isPending ? 'Submitting…' : 'Submit review'}
              onPress={() =>
                review.mutate({ bookingId: b.id, stars, text: text.trim() || undefined })
              }
              loading={review.isPending}
              disabled={review.isPending}
            />
            <Button
              label="Done"
              variant="secondary"
              height={44}
              fontSize={14}
              onPress={() => router.replace('/(driver)/bookings')}
            />
          </>
        )}
      </CTABar>
    </Screen>
  );
}

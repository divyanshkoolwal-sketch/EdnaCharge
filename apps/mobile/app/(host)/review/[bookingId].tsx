/** @file apps/mobile/app/(host)/review/[bookingId].tsx. */
import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { handleError } from '../../../src/lib/errors';
import {
  Screen,
  Card,
  Button,
  CTABar,
  H1,
  Body,
  Muted,
  SectionHeader,
  Row,
  Avatar,
  Divider,
  Input,
  ErrorState,
} from '../../../src/components/ui';
import { ChevronLeft, Star } from '../../../src/components/icons/Icon';
import { useTheme } from '../../../src/theme/useTheme';
import { trpc } from '../../../src/lib/trpc';

export default function HostReviewDriver() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const utils = trpc.useUtils();
  const q = trpc.booking.get.useQuery({ id: bookingId! }, { enabled: !!bookingId });
  const mine = trpc.review.mine.useQuery({ bookingId: bookingId! }, { enabled: !!bookingId });

  const review = trpc.review.create.useMutation({
    onSuccess: () => {
      utils.booking.list.invalidate();
      utils.review.mine.invalidate({ bookingId: bookingId! });
      utils.review.summary.invalidate();
      router.back();
    },
    onError: (e) => handleError(e, { feature: 'Review' }),
  });

  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');

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
  if (!q.data || mine.isLoading) return <Screen><View /></Screen>;
  const b = q.data;
  const driverName = b.driver?.fullName ?? 'Driver';
  const kwh = b.session?.finalKwh ?? 0;
  const earnings = Math.max(0, (b.capturedAmountCents ?? 0) - b.platformFeeCents) / 100;
  const already = mine.data ?? null;

  return (
    <Screen scroll contentStyle={{ paddingBottom: 160 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>

      <Card padding={14} style={{ marginTop: 14 }}>
        <Row gap={12}>
          <Avatar name={driverName} />
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>{driverName}</Body>
            <Muted style={{ fontSize: 11 }}>{b.charger.title}</Muted>
          </View>
        </Row>
        <Divider />
        <Row between style={{ marginBottom: 6 }}>
          <Muted>Energy delivered</Muted>
          <Body style={{ fontWeight: '600' }}>{kwh.toFixed(2)} kWh</Body>
        </Row>
        <Row between>
          <Muted>Your earnings</Muted>
          <Body style={{ fontWeight: '700' }}>${earnings.toFixed(2)}</Body>
        </Row>
      </Card>

      {already ? (
        <>
          <SectionHeader>Your rating</SectionHeader>
          <Card padding={14}>
            <Row gap={6} style={{ justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={28} color={n <= already.stars ? '#F2A66A' : c.line2} />
              ))}
            </Row>
            {already.text ? (
              <Body style={{ marginTop: 12, textAlign: 'center', color: c.muted }}>
                "{already.text}"
              </Body>
            ) : null}
            <Muted style={{ fontSize: 11, marginTop: 12, textAlign: 'center' }}>
              You've already rated this driver.
            </Muted>
          </Card>
          <CTABar>
            <Button label="Done" onPress={() => router.back()} />
          </CTABar>
        </>
      ) : (
        <>
          <SectionHeader>Rate your driver</SectionHeader>
          <Card padding={14}>
            <Row gap={6} style={{ justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setStars(n)}>
                  <Star size={28} color={n <= stars ? '#F2A66A' : c.line2} />
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
          <CTABar>
            <Button
              label={review.isPending ? 'Submitting…' : 'Submit review'}
              onPress={() => review.mutate({ bookingId: b.id, stars, text: text || undefined })}
              loading={review.isPending}
              disabled={review.isPending}
            />
            <Button
              label="Not now"
              variant="secondary"
              height={44}
              fontSize={14}
              onPress={() => router.back()}
            />
          </CTABar>
        </>
      )}
    </Screen>
  );
}

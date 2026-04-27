import { useState } from 'react';
import { View, Pressable } from 'react-native';
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
} from '../../../src/components/ui';
import { Close, Star } from '../../../src/components/icons/Icon';
import { useTheme } from '../../../src/theme/useTheme';
import { trpc } from '../../../src/lib/trpc';

export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const utils = trpc.useUtils();
  const q = trpc.booking.get.useQuery({ id: id! }, { enabled: !!id, refetchInterval: 3000 });
  const review = trpc.review.create.useMutation({
    onSuccess: () => {
      utils.booking.list.invalidate();
      utils.charger.get.invalidate();
      router.replace('/(driver)/bookings');
    },
    onError: (e) => handleError(e, { feature: 'Review' }),
  });
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');

  if (!q.data) return <Screen><View /></Screen>;
  const b = q.data;
  const captured = b.capturedAmountCents ?? null;
  const kwh = b.session?.finalKwh ?? 0;
  const energy = b.session?.finalCostCents ?? 0;
  const fee = b.platformFeeCents;

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
        <H1Lg style={{ marginTop: 8, fontSize: 56, letterSpacing: -1 }}>
          {kwh.toFixed(2)}
        </H1Lg>
        <Muted style={{ fontSize: 14, marginTop: 4 }}>kWh</Muted>
      </View>

      <Card padding={14} style={{ marginTop: 18 }}>
        <Row between style={{ marginBottom: 8 }}>
          <Muted>Energy</Muted>
          <Body>${(energy / 100).toFixed(2)}</Body>
        </Row>
        <Row between style={{ marginBottom: 8 }}>
          <Muted>Platform fee (15%)</Muted>
          <Body>${(fee / 100).toFixed(2)}</Body>
        </Row>
        <Divider />
        <Row between>
          <Body style={{ fontWeight: '700', fontSize: 17 }}>Total charged</Body>
          <Body style={{ fontWeight: '700', fontSize: 17 }}>
            {captured != null ? `$${(captured / 100).toFixed(2)}` : 'Settling…'}
          </Body>
        </Row>
        <Muted style={{ fontSize: 11, marginTop: 8 }}>
          Pre-auth of ${(b.preauthAmountCents / 100).toFixed(2)} was released; we only captured what
          you used.
        </Muted>
      </Card>

      <SectionHeader>Rate your host</SectionHeader>
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
            placeholder="Add a comment (optional)"
            style={{ minHeight: 60, height: undefined, paddingTop: 14, paddingBottom: 14 }}
          />
        </View>
      </Card>

      <CTABar>
        <Button
          label={
            b.status !== 'completed'
              ? 'Waiting for settlement…'
              : review.isPending
                ? 'Submitting…'
                : 'Submit review'
          }
          onPress={() => review.mutate({ bookingId: b.id, stars, text: text || undefined })}
          loading={review.isPending}
          disabled={review.isPending || b.status !== 'completed'}
        />
        <Button
          label="Done"
          variant="secondary"
          height={44}
          fontSize={14}
          onPress={() => router.replace('/(driver)/bookings')}
        />
      </CTABar>
    </Screen>
  );
}

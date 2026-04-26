import { View, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  Chip,
} from '../../../src/components/ui';
import { ChevronLeft, Star } from '../../../src/components/icons/Icon';
import { trpc } from '../../../src/lib/trpc';
import { useTheme } from '../../../src/theme/useTheme';

export default function HostRequestReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const q = trpc.booking.get.useQuery({ id: id! }, { enabled: !!id });
  const respond = trpc.booking.respond.useMutation({
    onSuccess: () => router.back(),
    onError: (e) => Alert.alert('Oops', e.message),
  });

  if (!q.data) return <Screen><View /></Screen>;
  const b = q.data;

  return (
    <Screen scroll contentStyle={{ paddingBottom: 160 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>

      <Card padding={14} style={{ marginTop: 14 }}>
        <Row gap={12}>
          <Avatar name="Driver" />
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>{b.charger.title}</Body>
            <Row gap={4}>
              <Star size={11} />
              <Muted>4.8 · 12 sessions</Muted>
            </Row>
          </View>
          <Chip label="Profile" variant="outline" />
        </Row>
      </Card>

      <View style={{ marginTop: 18, alignItems: 'center' }}>
        <Label>BOOKING WINDOW</Label>
        <H1 style={{ marginTop: 4, fontSize: 24 }}>
          {new Date(b.startAt).toLocaleString()}
        </H1>
      </View>

      <Card padding={14} style={{ marginTop: 14 }}>
        <Row between style={{ marginBottom: 6 }}>
          <Muted>Estimated kWh</Muted>
          <Body style={{ fontWeight: '600' }}>~{b.estimatedKwh.toFixed(1)}</Body>
        </Row>
        <Row between>
          <Muted>Your earnings</Muted>
          <Body style={{ fontWeight: '700', fontSize: 18 }}>
            ${((b.estimatedCostCents - b.platformFeeCents) / 100).toFixed(2)}
          </Body>
        </Row>
      </Card>

      {b.driverMessage ? (
        <>
          <SectionHeader>Their message</SectionHeader>
          <FrameSoft>
            <Body style={{ fontStyle: 'italic', color: c.muted }}>
              "{b.driverMessage}"
            </Body>
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
            router.push({ pathname: '/(driver)/chat/[bookingId]', params: { bookingId: b.id } })
          }
          style={{ marginTop: 14 }}
        />
      ) : null}

      <CTABar>
        <Button
          label="Accept"
          loading={respond.isPending}
          onPress={() => respond.mutate({ bookingId: b.id, decision: 'accept' })}
        />
        <Button
          label="Decline"
          variant="destructive-outline"
          height={44}
          fontSize={14}
          onPress={() =>
            respond.mutate({ bookingId: b.id, decision: 'decline', reason: 'not available' })
          }
        />
      </CTABar>
    </Screen>
  );
}

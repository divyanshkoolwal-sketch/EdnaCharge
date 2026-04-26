import { useState } from 'react';
import { View, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Card,
  FrameSoft,
  Chip,
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

const DURATIONS: { label: string; hours: number }[] = [
  { label: '0.5h', hours: 0.5 },
  { label: '1h', hours: 1 },
  { label: '2h', hours: 2 },
  { label: '3h', hours: 3 },
  { label: '4h', hours: 4 },
  { label: '8h', hours: 8 },
];

export default function RequestBooking() {
  const { chargerId } = useLocalSearchParams<{ chargerId: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const charger = trpc.charger.get.useQuery({ id: chargerId! }, { enabled: !!chargerId });

  const [hours, setHours] = useState(1);
  const [msg, setMsg] = useState('');

  const mut = trpc.booking.requestBooking.useMutation({
    onSuccess: (r) =>
      router.replace({ pathname: '/(driver)/booking/[id]', params: { id: r.booking.id } }),
    onError: (e) => Alert.alert('Oops', e.message),
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

        <SectionHeader>Duration</SectionHeader>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {DURATIONS.map((d) => (
            <Chip
              key={d.label}
              label={d.label}
              variant="outline"
              selected={hours === d.hours}
              onPress={() => setHours(d.hours)}
            />
          ))}
        </View>

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
            const start = new Date();
            const end = new Date(start.getTime() + hours * 3_600_000);
            mut.mutate({
              chargerId: chargerId!,
              startAt: start.toISOString(),
              endAt: end.toISOString(),
              message: msg || undefined,
            });
          }}
        />
      </CTABar>
    </Screen>
  );
}

import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  H1,
  Card,
  Body,
  Muted,
  Label,
  Row,
  StatusPill,
  type Status,
  Button,
  SectionHeader,
  ListSkeleton,
  EmptyState,
  ErrorState,
} from '../../src/components/ui';
import { Bolt } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';
import { VerificationBanner } from '../../src/components/VerificationBanner';

export default function HostHome() {
  const router = useRouter();
  const { c } = useTheme();
  const chargers = trpc.charger.myChargers.useQuery();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const pending = trpc.booking.list.useQuery({ role: 'host', status: 'pending' });
  const stats = trpc.payment.hostStats.useQuery(undefined, { refetchInterval: 30_000 });

  return (
    <Screen scroll contentStyle={{ paddingBottom: 30 }}>
      <View style={{ marginTop: 14 }}>
        <Label>{today.toUpperCase()}</Label>
        <H1 style={{ marginTop: 4 }}>Today</H1>
      </View>

      <VerificationBanner next="/(host)/home" role="host" />

      <Row gap={8} style={{ marginTop: 14 }}>
        <Card padding={12} style={{ flex: 1 }}>
          <Muted style={{ fontSize: 11 }}>Pending</Muted>
          <Body style={{ fontSize: 26, fontWeight: '800', marginTop: 4 }}>
            {pending.data?.rows.length ?? 0}
          </Body>
        </Card>
        <Card padding={12} style={{ flex: 1 }}>
          <Muted style={{ fontSize: 11 }}>Today</Muted>
          <Body style={{ fontSize: 26, fontWeight: '800', marginTop: 4 }}>
            ${((stats.data?.todayNetCents ?? 0) / 100).toFixed(2)}
          </Body>
        </Card>
        <Card padding={12} style={{ flex: 1, backgroundColor: c.greenPill }}>
          <Body style={{ fontSize: 10, color: c.green2, fontWeight: '700' }}>ACTIVE</Body>
          <Body style={{ fontSize: 26, fontWeight: '800', marginTop: 4, color: c.green2 }}>
            {stats.data?.activeSessionCount ?? 0}
          </Body>
        </Card>
      </Row>

      <SectionHeader>Your chargers</SectionHeader>
      <View style={{ gap: 10 }}>
        {chargers.isLoading ? (
          <ListSkeleton count={2} />
        ) : chargers.isError ? (
          <ErrorState onRetry={() => chargers.refetch()} />
        ) : (chargers.data ?? []).length === 0 ? (
          <EmptyState
            compact
            title="No chargers yet"
            subtitle="List your home charger to start receiving bookings and earning."
          />
        ) : (
          (chargers.data ?? []).map((ch: { id: string; title: string; connectorType: string; powerKw: number; status: string }) => (
          <Pressable
            key={ch.id}
            accessibilityRole="button"
            accessibilityLabel={`${ch.title}, ${ch.connectorType.toUpperCase()} ${ch.powerKw} kilowatts, status ${ch.status}`}
            onPress={() =>
              router.push({ pathname: '/(host)/charger/[id]', params: { id: ch.id } })
            }
          >
            <Card padding={12}>
              <Row gap={12}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    backgroundColor: c.chip,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Bolt size={18} color={c.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontSize: 13, fontWeight: '700' }}>{ch.title}</Body>
                  <Muted style={{ fontSize: 11 }}>
                    {ch.connectorType.toUpperCase()} · {ch.powerKw} kW
                  </Muted>
                </View>
                <StatusPill status={ch.status as Status} />
              </Row>
            </Card>
          </Pressable>
          ))
        )}
      </View>

      <Button
        label="+ Add a charger"
        onPress={() => router.push('/(host)/add-charger')}
        style={{ marginTop: 18 }}
      />
    </Screen>
  );
}

import { View, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  H1,
  Card,
  Body,
  Muted,
  Label,
  Row,
  SectionHeader,
  Chip,
  EmptyState,
  ErrorState,
} from '../../src/components/ui';
import { ChevronRight, Star } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';

export default function Earnings() {
  const { c } = useTheme();
  const router = useRouter();
  const q = trpc.booking.list.useQuery({ role: 'host', status: 'completed' });
  const stats = trpc.payment.hostStats.useQuery();

  const total = (q.data?.rows ?? []).reduce(
    (sum: number, b: { capturedAmountCents: number | null }) => sum + (b.capturedAmountCents ?? 0),
    0,
  );
  const dollars = Math.floor(total / 100);
  const cents = total % 100;

  // Compute bar heights as a fraction of the max in the week. Max-height
  // bar fills 100px; min is 4px so empty days remain visible. Today is
  // always the last bar (index 6).
  const weekly = stats.data?.weekly ?? [];
  const maxCents = Math.max(1, ...weekly.map((d) => d.netCents));
  const todayIdx = weekly.length - 1;

  return (
    <Screen scroll contentStyle={{ paddingBottom: 30 }}>
      <View style={{ marginTop: 14 }}>
        <Label>LIFETIME GROSS</Label>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
          <H1 style={{ fontSize: 44, fontWeight: '800', letterSpacing: -1 }}>
            ${dollars.toLocaleString()}
          </H1>
          <Body style={{ fontSize: 22, color: c.muted, fontWeight: '700' }}>
            .{String(cents).padStart(2, '0')}
          </Body>
        </View>
      </View>

      <Row gap={6} style={{ marginTop: 14 }}>
        <Chip label="Last 7 days" selected variant="outline" />
      </Row>

      <Card padding={14} style={{ marginTop: 14, height: 140 }}>
        {weekly.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Muted style={{ fontSize: 12 }}>No earnings yet — list a charger to get started.</Muted>
          </View>
        ) : (
          <Row gap={6} style={{ alignItems: 'flex-end', height: 110 }}>
            {weekly.map((d, i) => {
              const ratio = d.netCents / maxCents;
              const h = Math.max(4, Math.round(ratio * 100));
              return (
                <View key={d.date} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <View
                    style={{
                      width: '100%',
                      height: h,
                      backgroundColor: i === todayIdx ? c.ink : c.greenPill,
                      borderRadius: 6,
                    }}
                  />
                  <Muted style={{ fontSize: 10 }}>{d.dayLabel.charAt(0)}</Muted>
                </View>
              );
            })}
          </Row>
        )}
      </Card>

      <SectionHeader>Recent sessions</SectionHeader>
      <FlatList
        scrollEnabled={false}
        data={q.data?.rows ?? []}
        keyExtractor={(b) => b.id}
        ListEmptyComponent={
          q.isError ? (
            <ErrorState onRetry={() => q.refetch()} />
          ) : (
            <EmptyState
              compact
              title="No completed sessions yet"
              subtitle="Earnings from finished charging sessions will appear here."
            />
          )
        }
        renderItem={({ item }) => {
          const myReview = item.reviews?.[0] ?? null;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Session at ${item.charger.title}, ${new Date(
                item.startAt,
              ).toLocaleDateString()}, earned $${((item.capturedAmountCents ?? 0) / 100).toFixed(2)}${
                myReview ? `, rated ${myReview.stars} stars` : ', not yet rated'
              }`}
              onPress={() =>
                router.push({
                  pathname: '/(host)/review/[bookingId]',
                  params: { bookingId: item.id },
                })
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: c.line,
              }}
            >
              <View style={{ flex: 1 }}>
                <Body style={{ fontSize: 13, fontWeight: '600' }}>{item.charger.title}</Body>
                <Row gap={4} style={{ marginTop: 2 }}>
                  <Muted style={{ fontSize: 11 }}>
                    {new Date(item.startAt).toLocaleDateString()}
                  </Muted>
                  {myReview ? (
                    <Row gap={2}>
                      <Star size={10} color="#F2A66A" />
                      <Muted style={{ fontSize: 11 }}>Rated {myReview.stars}</Muted>
                    </Row>
                  ) : (
                    <Muted style={{ fontSize: 11, color: c.green2 }}>· Rate driver</Muted>
                  )}
                </Row>
              </View>
              <Row gap={6}>
                <Body style={{ fontWeight: '700' }}>
                  ${((item.capturedAmountCents ?? 0) / 100).toFixed(2)}
                </Body>
                <ChevronRight color={c.muted2} />
              </Row>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

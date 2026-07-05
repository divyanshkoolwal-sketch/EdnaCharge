import { View, Pressable, RefreshControl } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Screen,
  H1,
  Card,
  Body,
  Muted,
  Row,
  Avatar,
  Chip,
  StatusPill,
  List,
  ListSkeleton,
  EmptyState,
} from '../../src/components/ui';
import { ChevronRight } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';

export default function Requests() {
  const router = useRouter();
  const { c } = useTheme();
  const q = trpc.booking.list.useInfiniteQuery(
    { role: 'host', status: 'pending' },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const count = rows.length;

  // Tick every 30s so each request's "X min left" countdown updates live
  // instead of freezing until the next data refetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen flush>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <Row between style={{ marginTop: 14 }}>
          <H1>Requests</H1>
          {count > 0 ? (
            <View
              style={{
                backgroundColor: c.red,
                height: 28,
                paddingHorizontal: 12,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Body style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                {count}
              </Body>
            </View>
          ) : null}
        </Row>
      </View>
      <List
        data={rows}
        keyExtractor={(b) => b.id}
        estimatedItemSize={150}
        gap={10}
        contentContainerStyle={{ padding: 24, paddingTop: 16 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
        }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          q.isLoading ? (
            <ListSkeleton />
          ) : (
            <EmptyState
              title="No pending requests"
              subtitle="When a driver requests one of your chargers, it'll appear here to accept or decline."
            />
          )
        }
        ListFooterComponent={
          q.isFetchingNextPage ? (
            <Muted style={{ textAlign: 'center', paddingVertical: 16 }}>Loading more…</Muted>
          ) : null
        }
        renderItem={({ item }) => {
          const remainingMs =
            new Date(item.autoDeclineAt).getTime() - Date.now();
          const remaining = Math.max(0, Math.floor(remainingMs / 60_000));
          // The auto-decline window is ~30 min, so only flag "urgent" when a
          // request is close to expiring (was `< 30min`, which fired for every
          // request the moment it arrived).
          const urgent = remainingMs < 5 * 60_000;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Request for ${item.charger.title}, ${new Date(
                item.startAt,
              ).toLocaleString()}, ${remaining} minutes left to respond`}
              onPress={() =>
                router.push({ pathname: '/(host)/request/[id]', params: { id: item.id } })
              }
            >
              <Card padding={14}>
                <Row gap={10}>
                  <Avatar name={item.charger.title} size="sm" />
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: '700', fontSize: 14 }}>
                      {item.charger.title}
                    </Body>
                    <Muted style={{ fontSize: 11, marginTop: 2 }}>Tap to review</Muted>
                  </View>
                  <ChevronRight color={c.muted2} />
                </Row>
                <Body style={{ marginTop: 10, fontSize: 13 }}>
                  {new Date(item.startAt).toLocaleString()}
                </Body>
                <Muted style={{ fontSize: 12 }}>
                  ~{item.estimatedKwh.toFixed(1)} kWh · $
                  {((item.estimatedCostCents - item.platformFeeCents) / 100).toFixed(2)}
                </Muted>
                <Row between style={{ marginTop: 10 }}>
                  <Chip
                    label={remaining > 0 ? `${remaining} min left` : 'Expiring'}
                    variant={urgent ? 'red' : 'outline'}
                  />
                  <StatusPill status="pending" />
                </Row>
              </Card>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

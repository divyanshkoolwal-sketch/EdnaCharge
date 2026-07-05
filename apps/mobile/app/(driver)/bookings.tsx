/** @file apps/mobile/app/(driver)/bookings.tsx. */
import { View, Pressable } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Screen,
  H1,
  Card,
  Chip,
  Row,
  Body,
  Muted,
  StatusPill,
  type Status,
  List,
  ListSkeleton,
  EmptyState,
  ErrorState,
} from '../../src/components/ui';
import { ChevronRight } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';
import { haptics } from '../../src/lib/haptics';

type Filter = 'all' | 'upcoming' | 'past';

export default function Bookings() {
  const router = useRouter();
  const { c } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const selectFilter = (f: Filter) => {
    haptics.selection();
    setFilter(f);
  };
  const q = trpc.booking.list.useInfiniteQuery(
    { role: 'driver' },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const all = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const now = Date.now();
  const filtered = all.filter((b: { startAt: string; endAt: string; status: string }) => {
    if (filter === 'all') return true;
    const start = new Date(b.startAt).getTime();
    const end = new Date(b.endAt).getTime();
    const finished = ['completed', 'cancelled', 'declined', 'no_show'].includes(b.status);
    const currentOrFuture = b.status === 'active' || end >= now;
    if (filter === 'upcoming') return !finished && currentOrFuture;
    return finished || (!currentOrFuture && start < now);
  });

  // The Upcoming/Past filters run client-side over paginated data, so a page of
  // all-past rows leaves the Upcoming list too short to trigger onEndReached and
  // pagination stalls. Keep pulling pages until there's a screenful of matches
  // (or no more pages).
  useEffect(() => {
    if (filter !== 'all' && q.hasNextPage && !q.isFetchingNextPage && filtered.length < 8) {
      void q.fetchNextPage();
    }
  }, [filter, filtered.length, q.hasNextPage, q.isFetchingNextPage, q]);

  return (
    <Screen flush>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <H1 style={{ marginTop: 14 }}>Your bookings</H1>
        <Row gap={6} style={{ marginTop: 14 }}>
          <Chip label="All" selected={filter === 'all'} variant="outline" onPress={() => selectFilter('all')} />
          <Chip label="Upcoming" selected={filter === 'upcoming'} variant="outline" onPress={() => selectFilter('upcoming')} />
          <Chip label="Past" selected={filter === 'past'} variant="outline" onPress={() => selectFilter('past')} />
        </Row>
      </View>
      <List
        data={filtered}
        keyExtractor={(b) => b.id}
        estimatedItemSize={104}
        gap={10}
        contentContainerStyle={{ padding: 24, paddingTop: 16 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
        }}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          try {
            await q.refetch();
          } finally {
            setRefreshing(false);
          }
        }}
        ListEmptyComponent={
          q.isLoading ? (
            <ListSkeleton />
          ) : q.isError ? (
            <ErrorState onRetry={() => q.refetch()} />
          ) : (
            <EmptyState
              title={filter === 'all' ? 'No bookings yet' : `No ${filter} bookings`}
              subtitle={
                filter === 'all'
                  ? 'Your charging sessions will show up here once you book a charger.'
                  : 'Nothing here for this filter.'
              }
              actionLabel={filter === 'all' ? 'Find a charger' : undefined}
              onAction={filter === 'all' ? () => router.replace('/(driver)/map') : undefined}
            />
          )
        }
        ListFooterComponent={
          q.isFetchingNextPage ? (
            <Muted style={{ textAlign: 'center', paddingVertical: 16 }}>Loading more…</Muted>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Booking at ${item.charger.title}, ${new Date(
              item.startAt,
            ).toLocaleString()}, status ${item.status}`}
            onPress={() => router.push({ pathname: '/(driver)/booking/[id]', params: { id: item.id } })}
          >
            <Card padding={14}>
              <Row between>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700', fontSize: 14 }}>{item.charger.title}</Body>
                  <Muted style={{ marginTop: 2 }}>
                    {new Date(item.startAt).toLocaleString()}
                  </Muted>
                </View>
                <ChevronRight color={c.muted2} />
              </Row>
              <View style={{ marginTop: 10 }}>
                <StatusPill status={item.status as Status} />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}

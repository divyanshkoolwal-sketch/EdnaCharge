import { View, Pressable } from 'react-native';
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
} from '../../src/components/ui';
import { ChevronRight, Star } from '../../src/components/icons/Icon';
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
        ListEmptyComponent={
          <Muted style={{ textAlign: 'center', marginTop: 40 }}>
            {q.isLoading ? 'Loading…' : 'No pending requests.'}
          </Muted>
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
          const urgent = remainingMs < 30 * 60_000;
          return (
            <Pressable
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
                    <Row gap={4}>
                      <Star size={10} />
                      <Muted style={{ fontSize: 11 }}>4.7</Muted>
                    </Row>
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
                    label={`⏱ ${remaining}m left`}
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

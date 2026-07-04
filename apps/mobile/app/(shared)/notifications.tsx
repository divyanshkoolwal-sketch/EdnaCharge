/** @file apps/mobile/app/(shared)/notifications.tsx. */
import { View, Pressable, FlatList, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Card,
  H1,
  Body,
  Muted,
  Row,
  ListSkeleton,
  EmptyState,
  ErrorState,
} from '../../src/components/ui';
import { ChevronLeft, Bell } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';
import { notificationRouteFromData } from '../../src/lib/notificationRouting';

type Role = 'driver' | 'host';

function timeAgo(iso: string | Date): string {
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function Notifications() {
  const router = useRouter();
  const { c } = useTheme();
  const params = useLocalSearchParams<{ role?: string }>();
  const role: Role = params.role === 'host' ? 'host' : 'driver';
  const utils = trpc.useUtils();

  const q = trpc.notification.list.useInfiniteQuery(
    {},
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const markAll = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });
  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const items = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const hasUnread = items.some((n) => !n.readAt);

  const openNotification = (n: (typeof items)[number]) => {
    if (!n.readAt) markRead.mutate({ id: n.id });
    // Prefer the role recorded when the notification was created (correct even
    // for dual-role users — every host is also a driver); fall back to the
    // entry-point role only for legacy rows without it.
    const route = notificationRouteFromData(n, role);
    if (route) router.push(route as never);
  };

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        style={{ paddingTop: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={10}
      >
        <ChevronLeft />
      </Pressable>
      <Row between style={{ marginTop: 14, alignItems: 'center' }}>
        <H1>Notifications</H1>
        {hasUnread ? (
          <Pressable
            onPress={() => markAll.mutate()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
          >
            <Body style={{ fontSize: 13, fontWeight: '600', color: c.ink }}>Mark all read</Body>
          </Pressable>
        ) : null}
      </Row>

      {q.isLoading ? (
        <View style={{ marginTop: 16 }}>
          <ListSkeleton count={5} />
        </View>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 40, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => q.refetch()} />
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Bell size={22} color={c.muted} />}
              title="No notifications yet"
              subtitle="Booking updates, messages, and session activity will show up here."
            />
          }
          renderItem={({ item: n }) => (
            <Pressable
              onPress={() => openNotification(n)}
              accessibilityRole="button"
              accessibilityLabel={`${n.title}. ${n.body}`}
            >
              <Card padding={12}>
                <Row gap={10}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: n.readAt ? c.line2 : c.ink,
                      marginTop: 6,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Row between>
                      <Body style={{ fontSize: 13, fontWeight: '700', flex: 1 }}>{n.title}</Body>
                      <Muted style={{ fontSize: 11, marginLeft: 8 }}>{timeAgo(n.createdAt)}</Muted>
                    </Row>
                    {n.body ? (
                      <Muted style={{ fontSize: 12, marginTop: 2 }}>{n.body}</Muted>
                    ) : null}
                  </View>
                </Row>
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

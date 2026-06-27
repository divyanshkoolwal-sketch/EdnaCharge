import { View, Pressable, Text } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Screen,
  H1,
  Avatar,
  Row,
  Muted,
  StatusPill,
  type Status,
  List,
  ListSkeleton,
  EmptyState,
  ErrorState,
} from '../../src/components/ui';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';

export default function Chats() {
  const router = useRouter();
  const { c } = useTheme();
  const q = trpc.chat.listThreads.useQuery(undefined, { refetchInterval: 10000 });
  type Thread = NonNullable<typeof q.data>[number];
  // Manual pull-to-refresh state (kept separate from the 10s background poll so
  // the spinner only shows on an explicit pull, not on every interval tick).
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
      <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14 }}>
        <H1 style={{ marginTop: 14 }}>Chats</H1>
      </View>
      <List<Thread>
        data={q.data}
        keyExtractor={(t) => t.id}
        estimatedItemSize={76}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          q.isLoading ? (
            <View style={{ paddingTop: 8 }}>
              <ListSkeleton count={5} />
            </View>
          ) : q.isError ? (
            <ErrorState onRetry={() => q.refetch()} />
          ) : (
            <EmptyState
              title="No conversations yet"
              subtitle="Chats open up once you book a charger. Find one nearby to get started."
              actionLabel="Find a charger"
              onAction={() => router.replace('/(driver)/map')}
            />
          )
        }
        renderItem={({ item }) => {
          const last = item.messages[0];
          const counterpartyName = item.booking.charger.title;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Chat about ${counterpartyName}. ${
                last?.body ? `Last message: ${last.body}` : 'No messages yet'
              }`}
              onPress={() =>
                router.push({
                  pathname: '/(driver)/chat/[bookingId]',
                  params: { bookingId: item.booking.id },
                })
              }
              style={{
                flexDirection: 'row',
                gap: 12,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: c.line,
              }}
            >
              <Avatar name={counterpartyName} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Row between>
                  <Text style={{ fontWeight: '700', fontSize: 14, color: c.ink }}>
                    {counterpartyName}
                  </Text>
                  <Muted style={{ fontSize: 11 }}>
                    {last ? formatRelative(new Date(last.createdAt)) : ''}
                  </Muted>
                </Row>
                <Muted numberOfLines={1} style={{ marginTop: 1 }}>
                  {last?.body ?? '(no messages yet)'}
                </Muted>
                <View style={{ marginTop: 4 }}>
                  <StatusPill status={item.booking.status as Status} />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

function formatRelative(d: Date): string {
  const min = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  return `${days}d`;
}

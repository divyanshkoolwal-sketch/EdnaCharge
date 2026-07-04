/** @file apps/mobile/src/features/chat/BookingChatsList.tsx. */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Avatar,
  EmptyState,
  ErrorState,
  H1,
  List,
  ListSkeleton,
  Muted,
  Row,
  Screen,
  StatusPill,
  type Status,
} from '../../components/ui';
import { trpc } from '../../lib/trpc';
import { useTheme } from '../../theme/useTheme';

type ChatRole = 'driver' | 'host';

export function BookingChatsList({ role }: { role: ChatRole }) {
  const router = useRouter();
  const { c } = useTheme();
  const q = trpc.chat.listThreads.useQuery(undefined, { refetchInterval: 10000 });
  const threads = q.data ?? [];
  type Thread = (typeof threads)[number];
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
        data={threads}
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
          ) : role === 'driver' ? (
            <EmptyState
              title="No conversations yet"
              subtitle="Chats open up once you book a charger. Find one nearby to get started."
              actionLabel="Find a charger"
              onAction={() => router.replace('/(driver)/map')}
            />
          ) : (
            <EmptyState
              title="No conversations yet"
              subtitle="When a driver books one of your chargers, your chat with them appears here."
            />
          )
        }
        renderItem={({ item }) => {
          const last = item.messages[0];
          const counterpartyName =
            role === 'driver'
              ? item.booking.charger.title
              : (item.booking.driver?.fullName ?? 'Driver');
          const chargerTitle = item.booking.charger.title;
          const accessibilityContext = role === 'host' ? ` about ${chargerTitle}` : '';
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${role === 'driver' ? 'Chat about' : 'Chat with'} ${counterpartyName}${accessibilityContext}. ${
                last?.body ? `Last message: ${last.body}` : 'No messages yet'
              }`}
              onPress={() =>
                router.push({
                  pathname:
                    role === 'driver' ? '/(driver)/chat/[bookingId]' : '/(host)/chat/[bookingId]',
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
                {role === 'host' ? (
                  <Muted numberOfLines={1} style={{ marginTop: 1 }}>
                    {chargerTitle}
                  </Muted>
                ) : null}
                <Muted numberOfLines={1} style={{ marginTop: role === 'host' ? 2 : 1 }}>
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
  return `${Math.floor(hr / 24)}d`;
}

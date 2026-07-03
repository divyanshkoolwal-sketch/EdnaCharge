import { View, FlatList, Pressable, Text, RefreshControl } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Screen,
  H1,
  Avatar,
  Row,
  StatusPill,
  type Status,
  ListSkeleton,
  EmptyState,
  ErrorState,
} from '../../src/components/ui';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';

export default function HostChats() {
  const router = useRouter();
  const { c } = useTheme();
  const q = trpc.chat.listThreads.useQuery(undefined, { refetchInterval: 10000 });
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
      <FlatList
        data={q.data ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
              subtitle="When a driver books one of your chargers, your chat with them appears here."
            />
          )
        }
        renderItem={({ item }) => {
          const last = item.messages[0];
          // Host view: counterparty is the driver who booked
          const driverName = item.booking.driver?.fullName ?? 'Driver';
          const chargerTitle = item.booking.charger.title;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${driverName} about ${chargerTitle}. ${
                last?.body ? `Last message: ${last.body}` : 'No messages yet'
              }`}
              onPress={() =>
                router.push({
                  pathname: '/(host)/chat/[bookingId]',
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
              <Avatar name={driverName} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Row between>
                  <Text style={{ fontWeight: '700', fontSize: 14, color: '#0F0F10' }}>
                    {driverName}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#6B6B70' }}>
                    {last ? formatRelative(new Date(last.createdAt)) : ''}
                  </Text>
                </Row>
                <Text style={{ fontSize: 11, color: '#6B6B70', marginTop: 1 }} numberOfLines={1}>
                  {chargerTitle}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ marginTop: 2, fontSize: 13, color: '#2A2A2D' }}
                >
                  {last?.body ?? '(no messages yet)'}
                </Text>
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

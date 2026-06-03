import { View, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  H1,
  Avatar,
  Row,
  Body,
  Muted,
  StatusPill,
  type Status,
  List,
} from '../../src/components/ui';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';

export default function Chats() {
  const router = useRouter();
  const { c } = useTheme();
  const q = trpc.chat.listThreads.useQuery();
  type Thread = NonNullable<typeof q.data>[number];

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
        ListEmptyComponent={
          <Muted style={{ textAlign: 'center', marginTop: 40 }}>
            {q.isLoading ? 'Loading…' : 'No conversations yet.'}
          </Muted>
        }
        renderItem={({ item }) => {
          const last = item.messages[0];
          const counterpartyName = item.booking.charger.title;
          return (
            <Pressable
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

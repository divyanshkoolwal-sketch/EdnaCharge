import { View, FlatList, Pressable } from 'react-native';
import { useState } from 'react';
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
} from '../../src/components/ui';
import { ChevronRight } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';

type Filter = 'all' | 'upcoming' | 'past';

export default function Bookings() {
  const router = useRouter();
  const { c } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const q = trpc.booking.list.useQuery({ role: 'driver' });

  const all = q.data?.rows ?? [];
  const now = Date.now();
  const filtered = all.filter((b: { startAt: string; status: string }) => {
    if (filter === 'all') return true;
    const start = new Date(b.startAt).getTime();
    const finished = ['completed', 'cancelled', 'declined', 'no_show'].includes(b.status);
    if (filter === 'upcoming') return !finished && start >= now - 60 * 60 * 1000;
    return finished || start < now - 60 * 60 * 1000;
  });

  return (
    <Screen flush>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <H1 style={{ marginTop: 14 }}>Your bookings</H1>
        <Row gap={6} style={{ marginTop: 14 }}>
          <Chip label="All" selected={filter === 'all'} variant="outline" onPress={() => setFilter('all')} />
          <Chip label="Upcoming" selected={filter === 'upcoming'} variant="outline" onPress={() => setFilter('upcoming')} />
          <Chip label="Past" selected={filter === 'past'} variant="outline" onPress={() => setFilter('past')} />
        </Row>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 24, paddingTop: 16, gap: 10 }}
        ListEmptyComponent={
          <Muted style={{ textAlign: 'center', marginTop: 40 }}>
            {q.isLoading ? 'Loading…' : 'No bookings yet — find a charger →'}
          </Muted>
        }
        renderItem={({ item }) => (
          <Pressable
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

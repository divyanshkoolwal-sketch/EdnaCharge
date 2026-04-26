import { View, FlatList } from 'react-native';
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
} from '../../src/components/ui';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';

export default function Earnings() {
  const { c } = useTheme();
  const q = trpc.booking.list.useQuery({ role: 'host', status: 'completed' });
  const total = (q.data?.rows ?? []).reduce(
    (sum: number, b: { capturedAmountCents: number | null }) => sum + (b.capturedAmountCents ?? 0),
    0,
  );
  const dollars = Math.floor(total / 100);
  const cents = total % 100;

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
        <Chip label="Week" selected variant="outline" />
        <Chip label="Month" variant="outline" />
        <Chip label="Year" variant="outline" />
      </Row>

      <Card padding={14} style={{ marginTop: 14, height: 140 }}>
        <Row gap={6} style={{ alignItems: 'flex-end', height: 110 }}>
          {[40, 28, 55, 72, 46, 90, 62].map((h, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View
                style={{
                  width: '100%',
                  height: h,
                  backgroundColor: i === 5 ? c.ink : c.greenPill,
                  borderRadius: 6,
                }}
              />
              <Muted style={{ fontSize: 10 }}>
                {(['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const)[i]}
              </Muted>
            </View>
          ))}
        </Row>
      </Card>

      <SectionHeader>Recent sessions</SectionHeader>
      <FlatList
        scrollEnabled={false}
        data={q.data?.rows ?? []}
        keyExtractor={(b) => b.id}
        ListEmptyComponent={<Muted>No completed sessions yet.</Muted>}
        renderItem={({ item }) => (
          <Row
            between
            style={{
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: c.line,
            }}
          >
            <View>
              <Body style={{ fontSize: 13, fontWeight: '600' }}>{item.charger.title}</Body>
              <Muted style={{ fontSize: 11 }}>
                {new Date(item.startAt).toLocaleDateString()}
              </Muted>
            </View>
            <Body style={{ fontWeight: '700' }}>
              ${((item.capturedAmountCents ?? 0) / 100).toFixed(2)}
            </Body>
          </Row>
        )}
      />
    </Screen>
  );
}

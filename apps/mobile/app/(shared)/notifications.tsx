import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Card,
  H1,
  Body,
  Muted,
  Row,
  Chip,
} from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';

const ACTIVITY = [
  { t: 'Booking accepted', b: 'Sarah accepted your request', a: '2m', unread: true },
  { t: 'New message', b: 'Sarah K: Gate code is 1234', a: '5m', unread: true },
  { t: 'Session started', b: "Charging at Sarah's L2", a: '1h', unread: false },
  { t: 'Receipt ready', b: '$1.10 captured · 3.42 kWh', a: '2h', unread: false },
  { t: 'Review left', b: 'Sarah gave you 5 stars', a: '1d', unread: false },
];

export default function Notifications() {
  const router = useRouter();
  const { c } = useTheme();
  const [tab, setTab] = useState<'activity' | 'settings'>('activity');

  return (
    <Screen scroll contentStyle={{ paddingBottom: 40 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <H1 style={{ marginTop: 14 }}>Notifications</H1>
      <Row gap={6} style={{ marginTop: 14 }}>
        <Chip
          label="Activity"
          selected={tab === 'activity'}
          variant="outline"
          onPress={() => setTab('activity')}
        />
        <Chip
          label="Settings"
          selected={tab === 'settings'}
          variant="outline"
          onPress={() => setTab('settings')}
        />
      </Row>

      {tab === 'activity' ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          {ACTIVITY.map((n) => (
            <Card key={n.t + n.a} padding={12}>
              <Row gap={10}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: n.unread ? c.ink : c.line2,
                    marginTop: 6,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Row between>
                    <Body style={{ fontSize: 13, fontWeight: '700' }}>{n.t}</Body>
                    <Muted style={{ fontSize: 11 }}>{n.a}</Muted>
                  </Row>
                  <Muted style={{ fontSize: 12, marginTop: 2 }}>{n.b}</Muted>
                </View>
              </Row>
            </Card>
          ))}
        </View>
      ) : (
        <Card padding={0} style={{ marginTop: 14, overflow: 'hidden' }}>
          {[
            'Mute all notifications',
            'New chat messages',
            'Booking accepted/declined',
            'Session start reminders',
            'Marketing',
          ].map((label, i, arr) => (
            <Row
              between
              key={label}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                borderBottomColor: c.line,
              }}
            >
              <Body style={{ fontSize: 14 }}>{label}</Body>
              <Body style={{ fontSize: 12, color: c.muted, fontWeight: '600' }}>On</Body>
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}

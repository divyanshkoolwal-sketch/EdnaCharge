// Host tab navigator using the design's custom tab bar.
import { Tabs, useRouter, useSegments } from 'expo-router';
import { TabBar, type TabSpec } from '../../src/components/ui/TabBar';
import { trpc } from '../../src/lib/trpc';

const TABS: TabSpec[] = [
  { key: 'home', label: 'Home', icon: 'home', href: '/(host)/home' },
  { key: 'chargers', label: 'Chargers', icon: 'chargers', href: '/(host)/chargers' },
  { key: 'requests', label: 'Requests', icon: 'requests', href: '/(host)/requests' },
  { key: 'chats', label: 'Chats', icon: 'chats', href: '/(host)/chats' },
  { key: 'earnings', label: 'Earnings', icon: 'earnings', href: '/(host)/earnings' },
  { key: 'profile', label: 'Profile', icon: 'profile', href: '/(host)/profile' },
];

export default function HostTabs() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const top = segments[1];
  const currentKey =
    top === 'home' ||
    top === 'chargers' ||
    top === 'requests' ||
    top === 'chats' ||
    top === 'earnings' ||
    top === 'profile'
      ? top
      : 'home';

  // Surface pending booking requests as a tab badge so hosts notice them
  // without opening the tab (the action that earns them money).
  const pending = trpc.booking.list.useQuery(
    { role: 'host', status: 'pending' },
    { refetchInterval: 30_000 },
  );
  const pendingCount = pending.data?.rows.length ?? 0;
  const tabs = TABS.map((t) => (t.key === 'requests' ? { ...t, badge: pendingCount } : t));

  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
      tabBar={() => (
        <TabBar
          tabs={tabs}
          activeKey={currentKey}
          onPress={(t) => router.replace(t.href as never)}
        />
      )}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="chargers" />
      <Tabs.Screen name="requests" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="earnings" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="add-charger" options={{ href: null }} />
      <Tabs.Screen name="charger/[id]" options={{ href: null }} />
      <Tabs.Screen name="chat/[bookingId]" options={{ href: null }} />
      <Tabs.Screen name="request/[id]" options={{ href: null }} />
      <Tabs.Screen name="review/[bookingId]" options={{ href: null }} />
      <Tabs.Screen name="host-onboarding" options={{ href: null }} />
    </Tabs>
  );
}

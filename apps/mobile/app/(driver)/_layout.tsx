// Driver tab navigator using the design's custom tab bar.
import { Tabs } from 'expo-router';
import { TabBar, type TabSpec } from '../../src/components/ui/TabBar';
import { useRouter, useSegments } from 'expo-router';

const TABS: TabSpec[] = [
  { key: 'map', label: 'Map', icon: 'map', href: '/(driver)/map' },
  { key: 'bookings', label: 'Bookings', icon: 'bookings', href: '/(driver)/bookings' },
  { key: 'chats', label: 'Chats', icon: 'chats', href: '/(driver)/chats' },
  { key: 'profile', label: 'Profile', icon: 'profile', href: '/(driver)/profile' },
];

export default function DriverTabs() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const currentKey = (() => {
    // segments are like ['(driver)', 'map'] or ['(driver)', 'charger', '[id]']
    const top = segments[1];
    if (top === 'map' || top === 'bookings' || top === 'chats' || top === 'profile') return top;
    return 'map';
  })();
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
      tabBar={() => (
        <TabBar
          tabs={TABS}
          activeKey={currentKey}
          onPress={(t) => router.replace(t.href as never)}
        />
      )}
    >
      <Tabs.Screen name="map" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="charger/[id]" options={{ href: null }} />
      <Tabs.Screen name="request/[chargerId]" options={{ href: null }} />
      <Tabs.Screen name="booking/[id]" options={{ href: null }} />
      <Tabs.Screen name="session/[id]" options={{ href: null }} />
      <Tabs.Screen name="receipt/[id]" options={{ href: null }} />
      <Tabs.Screen name="chat/[bookingId]" options={{ href: null }} />
    </Tabs>
  );
}

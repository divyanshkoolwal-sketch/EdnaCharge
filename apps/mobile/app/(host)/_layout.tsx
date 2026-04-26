// Host tab navigator using the design's custom tab bar.
import { Tabs, useRouter, useSegments } from 'expo-router';
import { TabBar, type TabSpec } from '../../src/components/ui/TabBar';

const TABS: TabSpec[] = [
  { key: 'home', label: 'Home', icon: 'home', href: '/(host)/home' },
  { key: 'chargers', label: 'Chargers', icon: 'chargers', href: '/(host)/chargers' },
  { key: 'requests', label: 'Requests', icon: 'requests', href: '/(host)/requests' },
  { key: 'earnings', label: 'Earnings', icon: 'earnings', href: '/(host)/earnings' },
  { key: 'profile', label: 'Profile', icon: 'profile', href: '/(host)/profile' },
];

export default function HostTabs() {
  const router = useRouter();
  const segments = useSegments();
  const top = segments[1];
  const currentKey =
    top === 'home' ||
    top === 'chargers' ||
    top === 'requests' ||
    top === 'earnings' ||
    top === 'profile'
      ? top
      : 'home';

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
      <Tabs.Screen name="home" />
      <Tabs.Screen name="chargers" />
      <Tabs.Screen name="requests" />
      <Tabs.Screen name="earnings" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="add-charger" options={{ href: null }} />
      <Tabs.Screen name="charger/[id]" options={{ href: null }} />
      <Tabs.Screen name="request/[id]" options={{ href: null }} />
      <Tabs.Screen name="host-onboarding" options={{ href: null }} />
    </Tabs>
  );
}

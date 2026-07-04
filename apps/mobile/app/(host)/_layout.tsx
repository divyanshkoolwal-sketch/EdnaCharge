/** @file apps/mobile/app/(host)/_layout.tsx. */
// Host tab navigator using the design's custom tab bar.
import { ActivityIndicator } from 'react-native';
import { Redirect, Tabs, useRouter, useSegments } from 'expo-router';
import { Screen, ErrorState } from '../../src/components/ui';
import { TabBar, type TabSpec } from '../../src/components/ui/TabBar';
import { hasRoleAccess } from '../../src/lib/authRouting';
import { trpc } from '../../src/lib/trpc';
import { useAuth } from '../../src/state/auth';

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
  const { session, loading } = useAuth();
  const activeTab = TABS.find((t) => t.key === segments[1]);
  const showTabBar = activeTab != null;
  const currentKey = activeTab?.key ?? 'home';
  const me = trpc.auth.getSession.useQuery(undefined, { enabled: !!session });
  const canHost = hasRoleAccess(me.data, 'host');

  // Surface pending booking requests as a tab badge so hosts notice them
  // without opening the tab (the action that earns them money).
  const pending = trpc.booking.list.useQuery(
    { role: 'host', status: 'pending' },
    {
      enabled: !!session && showTabBar && canHost,
      refetchInterval: session && showTabBar && canHost ? 30_000 : false,
    },
  );
  const pendingCount = pending.data?.rows.length ?? 0;
  const tabs = TABS.map((t) => (t.key === 'requests' ? { ...t, badge: pendingCount } : t));

  if (loading || (session && me.isLoading)) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (!session) return <Redirect href="/(auth)/welcome" />;
  // A transient getSession failure must not bounce a signed-in user out of their
  // stack (to the waitlist / wrong role) — offer a retry instead.
  if (me.isError) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ErrorState onRetry={() => me.refetch()} />
      </Screen>
    );
  }
  if (!canHost) {
    // A driver-only user who landed in the host stack (e.g. a mis-targeted deep
    // link) should return to their own app, not dead-end on the host waitlist.
    if (hasRoleAccess(me.data, 'driver')) return <Redirect href="/(driver)/map" />;
    return <Redirect href="/(auth)/access-gate?role=host" />;
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
      tabBar={() =>
        showTabBar ? (
          <TabBar
            tabs={tabs}
            activeKey={currentKey}
            onPress={(t) => router.replace(t.href as never)}
          />
        ) : null
      }
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

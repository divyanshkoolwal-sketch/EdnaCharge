/** @file apps/mobile/app/(driver)/_layout.tsx. */
// Driver tab navigator using the design's custom tab bar.
import { ActivityIndicator } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { TabBar, type TabSpec } from '../../src/components/ui/TabBar';
import { useRouter, useSegments } from 'expo-router';
import { Screen, ErrorState } from '../../src/components/ui';
import { hasRoleAccess } from '../../src/lib/authRouting';
import { trpc } from '../../src/lib/trpc';
import { useAuth } from '../../src/state/auth';

const TABS: TabSpec[] = [
  { key: 'map', label: 'Map', icon: 'map', href: '/(driver)/map' },
  { key: 'bookings', label: 'Bookings', icon: 'bookings', href: '/(driver)/bookings' },
  { key: 'chats', label: 'Chats', icon: 'chats', href: '/(driver)/chats' },
  { key: 'profile', label: 'Profile', icon: 'profile', href: '/(driver)/profile' },
];

export default function DriverTabs() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const { session, loading } = useAuth();
  const currentKey = TABS.find((t) => t.key === segments[1])?.key ?? 'map';
  const me = trpc.auth.getSession.useQuery(undefined, { enabled: !!session });

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
  if (!hasRoleAccess(me.data, 'driver')) {
    // A host-only user who landed in the driver stack (e.g. a mis-targeted deep
    // link) should return to their own app, not dead-end on the driver waitlist.
    if (hasRoleAccess(me.data, 'host')) return <Redirect href="/(host)/home" />;
    return <Redirect href="/(auth)/access-gate?role=driver" />;
  }

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

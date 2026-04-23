import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function HostTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#000' }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="chargers" options={{ title: 'Chargers', tabBarIcon: icon('⚡️') }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests', tabBarIcon: icon('📨') }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: icon('💵') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('👤') }} />
      <Tabs.Screen name="add-charger" options={{ href: null }} />
      <Tabs.Screen name="charger/[id]" options={{ href: null }} />
      <Tabs.Screen name="request/[id]" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="host-onboarding" options={{ href: null }} />
    </Tabs>
  );
}
function icon(e: string) {
  return () => <Text>{e}</Text>;
}

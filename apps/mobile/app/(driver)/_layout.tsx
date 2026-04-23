import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function DriverTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#000' }}>
      <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: tabIcon('🗺') }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: tabIcon('📅') }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: tabIcon('💬') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('👤') }} />
      <Tabs.Screen name="charger/[id]" options={{ href: null }} />
      <Tabs.Screen name="request/[chargerId]" options={{ href: null }} />
      <Tabs.Screen name="booking/[id]" options={{ href: null }} />
      <Tabs.Screen name="session/[id]" options={{ href: null }} />
      <Tabs.Screen name="receipt/[id]" options={{ href: null }} />
      <Tabs.Screen name="chat/[bookingId]" options={{ href: null }} />
    </Tabs>
  );
}

function tabIcon(emoji: string) {
  return () => <Text>{emoji}</Text>;
}

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushToken(): Promise<void> {
  if (!Device.isDevice) return; // simulator can't receive real pushes
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await supabase.auth.updateUser({ data: { expoPushToken: token } });
  // AUDIT L5: persist via the dedicated tRPC mutation so User.expoPushToken
  // in Postgres is kept in sync (worker reads from there, not from Supabase
  // auth metadata).
  try {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (accessToken) {
      await fetch(`${apiUrl}/trpc/auth.registerExpoPushToken`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ token }),
      });
    }
  } catch {
    // Benign: next app launch will retry via this function.
  }
}

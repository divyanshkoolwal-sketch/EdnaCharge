/** @file apps/mobile/src/lib/push.ts. */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getAuthToken } from '../state/auth';
import { useRole } from '../state/role';
import { notificationRouteFromData, type NotificationRoute } from './notificationRouting';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulator can't receive real pushes
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      // HIGH so time-sensitive booking pushes get a heads-up banner + sound,
      // rather than landing silently in the notification shade.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Booking updates',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    // Pass the EAS projectId explicitly — getExpoPushTokenAsync can't always infer
    // it in a standalone/EAS build, and a wrong/absent id yields unusable tokens.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const token = (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    ).data;
    const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? 'http://localhost:3000' : undefined);
    if (!apiUrl) return;
    const accessToken = await getAuthToken();
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

export function subscribeNotificationResponses(navigate: (href: NotificationRoute) => void): () => void {
  let lastHandledId: string | null = null;
  const handle = (response: Notifications.NotificationResponse) => {
    const id = response.notification.request.identifier;
    if (id && id === lastHandledId) return;
    lastHandledId = id;
    // Fall back to the user's current role (not a hardcoded 'driver') when the
    // payload omits recipientRole, so a host doesn't get sent to driver routes.
    const route = notificationRouteFromData(
      response.notification.request.content.data,
      useRole.getState().role,
    );
    if (route) navigate(route);
  };

  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) handle(response);
    })
    .catch(() => undefined);

  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

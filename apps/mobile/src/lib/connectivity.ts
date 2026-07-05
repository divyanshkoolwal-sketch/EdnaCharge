/** @file apps/mobile/src/lib/connectivity.ts. */
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

// Bridge device connectivity into React Query. With this, queries/mutations are
// paused while offline and automatically resume (and retry) when the connection
// returns, instead of firing doomed requests that hang until timeout.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  }),
);

/** True when the device has no network connection. Drives the offline banner. */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false);
    });
    return unsubscribe;
  }, []);
  return offline;
}

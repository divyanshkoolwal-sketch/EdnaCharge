/** @file apps/mobile/src/components/OfflineBanner.tsx. */
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOffline } from '../lib/connectivity';

/** App-wide "No internet connection" pill, shown at the top while offline. */
export function OfflineBanner() {
  const offline = useIsOffline();
  const insets = useSafeAreaInsets();
  if (!offline) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top + 6,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <View
        style={{
          backgroundColor: '#1A1A1E',
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 14,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
          No internet connection
        </Text>
      </View>
    </View>
  );
}

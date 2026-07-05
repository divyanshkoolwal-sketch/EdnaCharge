/** @file apps/mobile/app/(auth)/_layout.tsx. */
import { Stack } from 'expo-router';

// Auth flow. The swipe-back gesture is disabled so a signed-out user can't drag
// the screen from the edge and land back in the account they just left (the
// previous authed screens can linger in the navigator until GC). Explicit
// back buttons (router.back) still work within the flow.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}

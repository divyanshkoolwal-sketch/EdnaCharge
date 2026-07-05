// Native autolinking exclusions.
// - react-native-worklets is installed only to satisfy nativewind's babel
//   resolver — its native module pins to RN 0.81+ which conflicts with the
//   Expo SDK 51 RN 0.74 pin.
// - @sentry/react-native: Sentry-Cocoa 8.x is incompatible with Xcode 26's
//   libc++ (allocator + Swift API drift); JS code is shimmed in
//   src/lib/sentry.ts so callsites still work, native side is a no-op.
module.exports = {
  dependencies: {
    'react-native-worklets': {
      platforms: { ios: null, android: null },
    },
    '@sentry/react-native': {
      platforms: { ios: null, android: null },
    },
  },
};

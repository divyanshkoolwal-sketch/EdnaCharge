// react-native-worklets is installed only to satisfy nativewind's babel
// resolver — its native module pins to RN 0.81+ which conflicts with the
// Expo SDK 51 RN 0.74 pin. Exclude it from autolinking so pod install /
// gradlew don't try to compile it.
module.exports = {
  dependencies: {
    'react-native-worklets': {
      platforms: { ios: null, android: null },
    },
  },
};

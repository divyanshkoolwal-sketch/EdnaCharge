const app = require('./app.json');

const googleIosUrlScheme =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ??
  'com.googleusercontent.apps.312909386856-k42nfrktnp3epe582hfm2d76h1kljmj1';
const baseUrlTypes = app.expo.ios?.infoPlist?.CFBundleURLTypes ?? [];
const googleUrlType = {
  CFBundleURLSchemes: [googleIosUrlScheme],
};

module.exports = {
  ...app,
  expo: {
    ...app.expo,
    ios: {
      ...app.expo.ios,
      usesAppleSignIn: true,
      infoPlist: {
        ...app.expo.ios.infoPlist,
        CFBundleURLTypes: [...baseUrlTypes, googleUrlType],
      },
    },
    android: {
      ...(app.expo.android ?? {}),
      package: app.expo.android?.package ?? 'edna.charge',
    },
    plugins: [...app.expo.plugins, 'expo-apple-authentication'].map((p) =>
      // Android gradle fetches the Mapbox SDK from a credentialed Maven repo, so
      // it needs a secret "Downloads:Read" token at BUILD time (distinct from the
      // public pk. runtime token). Injected from the RNMAPBOX_DOWNLOAD_TOKEN EAS
      // env var — never committed. iOS doesn't require it.
      Array.isArray(p) && p[0] === '@rnmapbox/maps'
        ? ['@rnmapbox/maps', { ...p[1], RNMapboxMapsDownloadToken: process.env.RNMAPBOX_DOWNLOAD_TOKEN }]
        : p,
    ),
  },
};

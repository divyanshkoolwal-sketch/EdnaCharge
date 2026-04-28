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
      googleServicesFile: './ios/EdnaCharge/GoogleService-Info.plist',
      infoPlist: {
        ...app.expo.ios.infoPlist,
        CFBundleURLTypes: [...baseUrlTypes, googleUrlType],
      },
    },
    plugins: [
      ...app.expo.plugins,
      'expo-apple-authentication',
    ],
  },
};

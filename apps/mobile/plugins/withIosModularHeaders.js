const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * React Native Firebase's `FirebaseAuth` is a Swift pod whose transitive deps
 * (GoogleUtilities, RecaptchaInterop, FirebaseAuthInterop, FirebaseAppCheckInterop)
 * don't define modules, so CocoaPods refuses to integrate them as static libraries
 * and `pod install` fails. RNMapbox needs the Mapbox pods linked as *dynamic*
 * frameworks (it rewrites them in a pre_install hook), which rules out a global
 * static `use_frameworks!`. CocoaPods' own remedy for the Firebase case is to enable
 * modular headers globally — which is orthogonal to RNMapbox's dynamic linking — so
 * that's what we do. The native projects aren't committed (EAS prebuilds them), so
 * this has to be applied as a config plugin rather than a hand-edited Podfile.
 */
module.exports = function withIosModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (!contents.includes('use_modular_headers!')) {
        contents = contents.replace(/^(platform :ios.*$)/m, '$1\nuse_modular_headers!');
        fs.writeFileSync(podfilePath, contents);
      }
      return cfg;
    },
  ]);
};

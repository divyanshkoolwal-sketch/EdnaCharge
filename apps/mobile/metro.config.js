/** @file apps/mobile/metro.config.js. */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
const rewriteRequestUrl = config.server.rewriteRequestUrl;

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// SDK 52 / Metro: hierarchical lookup must stay enabled (Expo default = false
// for disableHierarchicalLookup). Disabling it broke resolution under SDK 52.
config.server.unstable_serverRoot = workspaceRoot;
config.server.rewriteRequestUrl = (url) =>
  rewriteRequestUrl(url).replace(
    /\/(?:\.\.\/)+node_modules\/expo-router\/entry\.bundle/,
    '/node_modules/expo-router/entry.bundle',
  );

// The @edna/* workspace packages are consumed as TS source (main: ./src/index.ts,
// no build step) and re-export with explicit `.js` extensions (e.g. `./enums.js`
// in packages/schemas/src/index.ts, the TS/ESM convention). Metro takes the literal
// extension — it looks for `enums.js.ts`, never stripping `.js` to reach `enums.ts` —
// so `expo start` / EAS bundling fails with "Unable to resolve ./enums.js". Rewrite a
// relative `.js` import to its `.ts`/`.tsx` sibling, falling back to the default
// resolver (which still handles genuine `.js` files).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/^\.{1,2}\/.*\.js$/.test(moduleName)) {
    for (const ext of ['.ts', '.tsx']) {
      try {
        return context.resolveRequest(context, moduleName.slice(0, -3) + ext, platform);
      } catch {
        // sibling with this extension doesn't exist — try the next / fall through
      }
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

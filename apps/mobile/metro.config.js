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
config.resolver.disableHierarchicalLookup = true;
config.server.unstable_serverRoot = workspaceRoot;
config.server.rewriteRequestUrl = (url) =>
  rewriteRequestUrl(url).replace(
    /\/(?:\.\.\/)+node_modules\/expo-router\/entry\.bundle/,
    '/node_modules/expo-router/entry.bundle',
  );

module.exports = config;

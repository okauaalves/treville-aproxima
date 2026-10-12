const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// O bundle de servidor (API routes do EAS Hosting) avalia as rotas no Node, sem `window`.
const SERVER_SHIMS = {
  '@react-native-async-storage/async-storage': path.resolve(__dirname, 'shims/async-storage.server.js'),
};
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = context.customResolverOptions?.environment === 'node' ? SERVER_SHIMS[moduleName] : undefined;
  if (shim) {
    return { type: 'sourceFile', filePath: shim };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });

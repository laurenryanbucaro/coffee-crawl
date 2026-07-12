const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

const emptyModule = path.resolve(__dirname, 'empty-module.js');

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // The `ws` websocket library (pulled in by Supabase realtime) tries to
    // require Node built-ins that don't exist in React Native. We don't use
    // realtime, so stub them out.
    if (
      moduleName === 'stream' ||
      moduleName === 'ws' ||
      moduleName === 'crypto' ||
      moduleName === 'http' ||
      moduleName === 'https' ||
      moduleName === 'net' ||
      moduleName === 'tls' ||
      moduleName === 'zlib'
    ) {
      return { type: 'sourceFile', filePath: emptyModule };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
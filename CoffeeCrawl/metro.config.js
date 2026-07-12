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
    // Hermes can't parse the OTEL dynamic import inside these packages.
    // We don't use OpenTelemetry, so stub it out entirely.
    if (
      moduleName === '@opentelemetry/api' ||
      moduleName.includes('@opentelemetry') ||
      moduleName.includes('opentelemetry')
    ) {
      return { type: 'sourceFile', filePath: emptyModule };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
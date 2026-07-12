const { getDefaultConfig } = require('expo/metro-config');

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

// Stub out the OpenTelemetry dynamic import that Hermes can't compile.
// Supabase realtime pulls this in but we don't use realtime subscriptions.
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (
      moduleName === '@opentelemetry/api' ||
      moduleName.includes('opentelemetry')
    ) {
      return { type: 'empty' };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
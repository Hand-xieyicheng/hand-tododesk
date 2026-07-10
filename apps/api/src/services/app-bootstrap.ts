import { appBootstrapResponseSchema, appFeatureFlagsSchema, defaultAppFeatureFlags, type AppBootstrapResponse, type AppFeatureFlags } from "@todo/shared";

export interface AppBootstrapConfig {
  API_VERSION: string;
  DESKTOP_MIN_VERSION: string;
  DESKTOP_LATEST_VERSION: string;
  DESKTOP_UPDATE_ENDPOINT: string;
  FEATURE_FLAGS_JSON: string;
  DEEPSEEK_API_KEY: string;
}

const partialFeatureFlagsSchema = appFeatureFlagsSchema.partial();

export function parseFeatureFlags(raw: string): AppFeatureFlags {
  if (!raw.trim()) {
    return defaultAppFeatureFlags;
  }

  try {
    const parsed = partialFeatureFlagsSchema.parse(JSON.parse(raw));
    return {
      ...defaultAppFeatureFlags,
      ...parsed
    };
  } catch {
    return defaultAppFeatureFlags;
  }
}

export function buildAppBootstrap(config: AppBootstrapConfig): AppBootstrapResponse {
  const parsedFlags = parseFeatureFlags(config.FEATURE_FLAGS_JSON);
  return appBootstrapResponseSchema.parse({
    apiVersion: config.API_VERSION,
    releaseChannel: "stable",
    desktop: {
      minimumVersion: config.DESKTOP_MIN_VERSION,
      latestVersion: config.DESKTOP_LATEST_VERSION,
      updateEndpoint: config.DESKTOP_UPDATE_ENDPOINT
    },
    featureFlags: {
      ...parsedFlags,
      aiAssistant: parsedFlags.aiAssistant && Boolean(config.DEEPSEEK_API_KEY.trim())
    }
  });
}

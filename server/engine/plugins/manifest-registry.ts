/**
 * Plugin manifest registry — aggregates manifest records from all plugin roots.
 *
 * 移植自 openclaw/src/plugins/manifest-registry.ts。
 *
 * 降级策略：原文件依赖 node:fs、node:path、@openclaw/normalization-core/*、
 * 多个本地模块。运行时函数降级为返回空注册表。类型定义保留。
 */

import type {
  PluginManifest,
  PluginManifestActivation,
  PluginManifestModelCatalog,
  PluginManifestModelIdNormalization,
  PluginManifestModelPricing,
  PluginManifestModelSupport,
  PluginManifestProviderEndpoint,
  PluginManifestProviderRequest,
  PluginManifestSecretProviderIntegration,
  PluginManifestChannelConfig,
  PluginManifestCommandAlias,
  PluginManifestSetup,
  OpenClawPackageManifest,
  PluginPackageChannel,
} from "./manifest.js";
import type { PluginKind } from "./plugin-kind.types.js";
import type {
  PluginFormat,
  PluginBundleFormat,
  PluginDiagnostic,
} from "./manifest-types.js";
import type { PluginOrigin } from "./plugin-origin.types.js";

export type PluginManifestContractListKey =
  | "speechProviders"
  | "externalAuthProviders"
  | "embeddingProviders"
  | "mediaUnderstandingProviders"
  | "transcriptSourceProviders"
  | "documentExtractors"
  | "realtimeVoiceProviders"
  | "realtimeTranscriptionProviders"
  | "imageGenerationProviders"
  | "videoGenerationProviders"
  | "musicGenerationProviders"
  | "memoryEmbeddingProviders"
  | "webContentExtractors"
  | "webFetchProviders"
  | "webSearchProviders"
  | "migrationProviders"
  | "gatewayMethodDispatch";

export type PluginDependencySpecMap = Record<string, string>;

export type PluginManifestRecord = {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  version?: string;
  packageName?: string;
  packageVersion?: string;
  packageDescription?: string;
  enabledByDefault?: boolean;
  enabledByDefaultOnPlatforms?: string[];
  autoEnableWhenConfiguredProviders?: string[];
  legacyPluginIds?: string[];
  format?: PluginFormat;
  bundleFormat?: PluginBundleFormat;
  bundleCapabilities?: string[];
  kind?: PluginKind | PluginKind[];
  channels: string[];
  providers: string[];
  providerDiscoverySource?: string;
  modelSupport?: PluginManifestModelSupport;
  modelCatalog?: PluginManifestModelCatalog;
  modelPricing?: PluginManifestModelPricing;
  modelIdNormalization?: PluginManifestModelIdNormalization;
  providerEndpoints?: PluginManifestProviderEndpoint[];
  providerRequest?: PluginManifestProviderRequest;
  secretProviderIntegrations?: Record<string, PluginManifestSecretProviderIntegration>;
  cliBackends: string[];
  syntheticAuthRefs?: string[];
  nonSecretAuthMarkers?: string[];
  commandAliases?: PluginManifestCommandAlias[];
  providerAuthEnvVars?: Record<string, string[]>;
  providerAuthAliases?: Record<string, string>;
  channelEnvVars?: Record<string, string[]>;
  providerAuthChoices?: PluginManifest["providerAuthChoices"];
  activation?: PluginManifestActivation;
  setup?: PluginManifestSetup;
  packageManifest?: OpenClawPackageManifest;
  packageDependencies?: PluginDependencySpecMap;
  packageOptionalDependencies?: PluginDependencySpecMap;
  packageChannel?: PluginPackageChannel;
  origin: PluginOrigin;
  rootDir: string;
  manifestPath: string;
  setupSource?: string;
  configSchema?: PluginManifest["configSchema"];
  requiresPlugins?: string[];
  contracts?: PluginManifest["contracts"];
  configContracts?: PluginManifest["configContracts"];
  channelConfigs?: Record<string, PluginManifestChannelConfig>;
  qaRunners?: PluginManifest["qaRunners"];
  skills?: string[];
  uiHints?: PluginManifest["uiHints"];
  toolMetadata?: PluginManifest["toolMetadata"];
  mediaUnderstandingProviderMetadata?: PluginManifest["mediaUnderstandingProviderMetadata"];
  imageGenerationProviderMetadata?: PluginManifest["imageGenerationProviderMetadata"];
  videoGenerationProviderMetadata?: PluginManifest["videoGenerationProviderMetadata"];
  musicGenerationProviderMetadata?: PluginManifest["musicGenerationProviderMetadata"];
};

export type PluginManifestRegistry = {
  plugins: PluginManifestRecord[];
  diagnostics: PluginDiagnostic[];
};

export type BundledChannelConfigCollector = (params: {
  pluginDir: string;
  manifest: PluginManifest;
  packageManifest?: OpenClawPackageManifest;
}) => Record<string, PluginManifestChannelConfig> | undefined;

export type PluginCandidate = {
  pluginDir: string;
  origin: PluginOrigin;
  rank: number;
  order: number;
  manifestPath?: string;
};

/** Loads the plugin manifest registry from all plugin roots. */
export function loadPluginManifestRegistry(params: {
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
  config?: unknown;
  bundledChannelConfigCollector?: BundledChannelConfigCollector;
  candidates?: unknown;
  diagnostics?: unknown;
}): PluginManifestRegistry {
  void params;
  return { plugins: [], diagnostics: [] };
}

/** Testing helpers (degraded). */
export const testing = {
  resetCache(): void {
    // 降级：空实现
  },
};

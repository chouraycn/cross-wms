/**
 * Loads and normalizes OpenClaw plugin manifests, including contracts and config schemas.
 *
 * 移植自 openclaw/src/plugins/manifest.ts。
 *
 * 降级策略：
 *  - 原文件依赖 `@openclaw/model-catalog-core/*` 的 `normalizeModelCatalog`、
 *    `normalizeModelCatalogProviderId` 与 `ModelCatalog` 类型。提供本地占位类型与
 *    降级实现（normalizeModelCatalog 返回 undefined，normalizeModelCatalogProviderId
 *    透传字符串）。
 *  - 原文件依赖 `../../packages/normalization-core/src/string-coerce.js` 与
 *    `string-normalization.js`，改用 cross-wms 的 `../infra/string-coerce.js`。
 *  - 原文件依赖 `../channels/plugins/types.config.js`、`../compat/legacy-names.js`、
 *    `../config/types.secrets.js`、`../infra/boundary-file-read.js`、
 *    `../infra/prototype-keys.js`、`../shared/json-schema.types.js`、`../utils.js`、
 *    `../utils/parse-json-compat.js`，均提供本地占位类型与降级实现。
 *  - 运行时函数（loadPluginManifest 等）降级为抛出 "not implemented" 或返回降级值。
 */

// ---------------------------------------------------------------------------
// 本地占位类型与降级实现
// ---------------------------------------------------------------------------

/** 占位：JsonSchemaObject（降级为宽松 Record）。 */
type JsonSchemaObject = Record<string, unknown>;

/** 占位：ChannelConfigRuntimeSchema（降级为 unknown）。 */
type ChannelConfigRuntimeSchema = unknown;

/** 占位：ModelCatalog（来自 @openclaw/model-catalog-core）。 */
type ModelCatalog = unknown;

const MANIFEST_KEY = "openclaw";

const ENV_SECRET_REF_ID_RE = /^[A-Z0-9_]+$/;

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTrimmedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBlockedObjectKey(_key: string): boolean {
  return false;
}

function normalizeModelCatalogProviderId(value: string): string {
  return value;
}

function normalizeModelCatalog(_value: unknown): ModelCatalog | undefined {
  return undefined;
}

function parseJsonWithJson5Fallback(_input: string): unknown {
  try {
    return JSON.parse(_input);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** Canonical plugin manifest filename inside plugin roots. */
export const PLUGIN_MANIFEST_FILENAME = "openclaw.plugin.json";
export const PLUGIN_MANIFEST_FILENAMES = [PLUGIN_MANIFEST_FILENAME] as const;
export const MAX_PLUGIN_MANIFEST_BYTES = 256 * 1024;

export const DEFAULT_PLUGIN_ENTRY_CANDIDATES = [
  "index.ts",
  "index.js",
  "index.mjs",
  "index.cjs",
] as const;

// ---------------------------------------------------------------------------
// 类型定义（与原文件保持一致）
// ---------------------------------------------------------------------------

export type PluginConfigUiHint = unknown;

export type PluginManifestChannelConfig = {
  schema: JsonSchemaObject;
  uiHints?: Record<string, PluginConfigUiHint>;
  runtime?: ChannelConfigRuntimeSchema;
  label?: string;
  description?: string;
  preferOver?: string[];
  commands?: PluginManifestChannelCommandDefaults;
};

export type PluginManifestChannelCommandDefaults = {
  nativeCommandsAutoEnabled?: boolean;
  nativeSkillsAutoEnabled?: boolean;
};

export type PluginManifestModelSupport = {
  modelPrefixes?: string[];
  modelPatterns?: string[];
};

export type PluginManifestModelCatalog = ModelCatalog;

export type PluginManifestModelPricingModelIdTransform = "version-dots";

export type PluginManifestModelPricingSource = {
  provider?: string;
  passthroughProviderModel?: boolean;
  modelIdTransforms?: PluginManifestModelPricingModelIdTransform[];
};

export type PluginManifestModelPricingProvider = {
  external?: boolean;
  openRouter?: PluginManifestModelPricingSource | false;
  liteLLM?: PluginManifestModelPricingSource | false;
};

export type PluginManifestModelPricing = {
  providers?: Record<string, PluginManifestModelPricingProvider>;
};

export type PluginManifestModelIdPrefixRule = {
  modelPrefix: string;
  prefix: string;
};

export type PluginManifestModelIdNormalizationProvider = {
  aliases?: Record<string, string>;
  stripPrefixes?: string[];
  prefixWhenBare?: string;
  prefixWhenBareAfterAliasStartsWith?: PluginManifestModelIdPrefixRule[];
};

export type PluginManifestModelIdNormalization = {
  providers?: Record<string, PluginManifestModelIdNormalizationProvider>;
};

export type PluginManifestProviderEndpoint = {
  endpointClass: string;
  hosts?: string[];
  hostSuffixes?: string[];
  baseUrls?: string[];
  googleVertexRegion?: string;
  googleVertexRegionHostSuffix?: string;
};

export type PluginManifestProviderRequestProvider = {
  family?: string;
  compatibilityFamily?: "moonshot";
  openAICompletions?: {
    supportsStreamingUsage?: boolean;
  };
};

export type PluginManifestProviderRequest = {
  providers?: Record<string, PluginManifestProviderRequestProvider>;
};

export type PluginManifestSecretProviderIntegration = {
  providerAlias?: string;
  displayName?: string;
  description?: string;
  source: "exec";
  command: "${node}";
  args?: string[];
  timeoutMs?: number;
  noOutputTimeoutMs?: number;
  maxOutputBytes?: number;
  jsonOnly?: boolean;
  env?: Record<string, string>;
  passEnv?: string[];
  allowInsecurePath?: boolean;
};

export type PluginManifestActivationCapability = "provider" | "channel" | "tool" | "hook";

export type PluginManifestActivation = {
  onStartup?: boolean;
  onProviders?: string[];
  onAgentHarnesses?: string[];
  onCommands?: string[];
  onChannels?: string[];
  onRoutes?: string[];
  onConfigPaths?: string[];
  onCapabilities?: PluginManifestActivationCapability[];
};

export type PluginManifestDefaultPlatform = NodeJS.Platform;

export type PluginManifestSetupProvider = {
  id: string;
  authMethods?: string[];
  envVars?: string[];
  authEvidence?: PluginManifestSetupProviderAuthEvidence[];
};

export type PluginManifestSetupProviderAuthEvidence = {
  type: "local-file-with-env";
  fileEnvVar?: string;
  fallbackPaths?: string[];
  requiresAnyEnv?: string[];
  requiresAllEnv?: string[];
  credentialMarker: string;
  source?: string;
};

export type PluginManifestSetup = {
  providers?: PluginManifestSetupProvider[];
  cliBackends?: string[];
  configMigrations?: string[];
  requiresRuntime?: boolean;
};

export type PluginManifestQaRunner = {
  commandName: string;
  description?: string;
};

export type PluginManifestConfigLiteral = string | number | boolean | null;

export type PluginManifestDangerousConfigFlag = {
  path: string;
  equals: PluginManifestConfigLiteral;
};

export type PluginManifestSecretInputPath = {
  path: string;
  expected?: "string";
};

export type PluginManifestSecretInputContracts = {
  bundledDefaultEnabled?: boolean;
  paths: PluginManifestSecretInputPath[];
};

export type PluginManifestConfigContracts = {
  compatibilityMigrationPaths?: string[];
  compatibilityRuntimePaths?: string[];
  dangerousFlags?: PluginManifestDangerousConfigFlag[];
  secretInputs?: PluginManifestSecretInputContracts;
};

export type PluginManifestCommandAlias = {
  alias: string;
  command: string;
};

export type PluginKind = string;

export type PluginManifest = {
  id: string;
  configSchema: JsonSchemaObject;
  requiresPlugins?: string[];
  enabledByDefault?: boolean;
  enabledByDefaultOnPlatforms?: PluginManifestDefaultPlatform[];
  legacyPluginIds?: string[];
  autoEnableWhenConfiguredProviders?: string[];
  kind?: PluginKind | PluginKind[];
  channels?: string[];
  providers?: string[];
  providerCatalogEntry?: string;
  modelSupport?: PluginManifestModelSupport;
  modelCatalog?: PluginManifestModelCatalog;
  modelPricing?: PluginManifestModelPricing;
  modelIdNormalization?: PluginManifestModelIdNormalization;
  providerEndpoints?: PluginManifestProviderEndpoint[];
  providerRequest?: PluginManifestProviderRequest;
  secretProviderIntegrations?: Record<string, PluginManifestSecretProviderIntegration>;
  cliBackends?: string[];
  syntheticAuthRefs?: string[];
  nonSecretAuthMarkers?: string[];
  commandAliases?: PluginManifestCommandAlias[];
  providerAuthEnvVars?: Record<string, string[]>;
  providerAuthAliases?: Record<string, string>;
  channelEnvVars?: Record<string, string[]>;
  providerAuthChoices?: PluginManifestProviderAuthChoice[];
  activation?: PluginManifestActivation;
  setup?: PluginManifestSetup;
  qaRunners?: PluginManifestQaRunner[];
  skills?: string[];
  name?: string;
  description?: string;
  icon?: string;
  version?: string;
  uiHints?: Record<string, PluginConfigUiHint>;
  contracts?: PluginManifestContracts;
  mediaUnderstandingProviderMetadata?: Record<
    string,
    PluginManifestMediaUnderstandingProviderMetadata
  >;
  imageGenerationProviderMetadata?: Record<string, PluginManifestCapabilityProviderMetadata>;
  videoGenerationProviderMetadata?: Record<string, PluginManifestCapabilityProviderMetadata>;
  musicGenerationProviderMetadata?: Record<string, PluginManifestCapabilityProviderMetadata>;
  toolMetadata?: Record<string, PluginManifestToolMetadata>;
  configContracts?: PluginManifestConfigContracts;
  channelConfigs?: Record<string, PluginManifestChannelConfig>;
};

export type PluginManifestContracts = {
  embeddedExtensionFactories?: string[];
  agentToolResultMiddleware?: string[];
  trustedToolPolicies?: string[];
  externalAuthProviders?: string[];
  embeddingProviders?: string[];
  memoryEmbeddingProviders?: string[];
  speechProviders?: string[];
  realtimeTranscriptionProviders?: string[];
  realtimeVoiceProviders?: string[];
  mediaUnderstandingProviders?: string[];
  transcriptSourceProviders?: string[];
  documentExtractors?: string[];
  imageGenerationProviders?: string[];
  videoGenerationProviders?: string[];
  musicGenerationProviders?: string[];
  webContentExtractors?: string[];
  webFetchProviders?: string[];
  webSearchProviders?: string[];
  migrationProviders?: string[];
  gatewayMethodDispatch?: string[];
  tools?: string[];
};

export type PluginManifestMediaUnderstandingCapability = "image" | "audio" | "video";

export type PluginManifestMediaUnderstandingProviderMetadata = {
  capabilities?: PluginManifestMediaUnderstandingCapability[];
  defaultModels?: Partial<Record<PluginManifestMediaUnderstandingCapability, string>>;
  autoPriority?: Partial<Record<PluginManifestMediaUnderstandingCapability, number>>;
  nativeDocumentInputs?: Array<"pdf">;
  documentModels?: Partial<
    Record<
      "pdf",
      {
        textExtraction?: string;
        image?: string | false;
      }
    >
  >;
};

export type PluginManifestProviderBaseUrlGuard = {
  provider: string;
  defaultBaseUrl?: string;
  allowedBaseUrls: string[];
};

export type PluginManifestCapabilityProviderAuthSignal = {
  provider: string;
  providerBaseUrl?: PluginManifestProviderBaseUrlGuard;
};

export type PluginManifestCapabilityProviderModeConfigSignal = {
  path?: string;
  default?: string;
  allowed?: string[];
  disallowed?: string[];
};

export type PluginManifestCapabilityProviderConfigSignal = {
  rootPath: string;
  overlayPath?: string;
  overlayMapPath?: string;
  required?: string[];
  requiredAny?: string[];
  mode?: PluginManifestCapabilityProviderModeConfigSignal;
};

export type PluginManifestCapabilityProviderMetadata = {
  aliases?: string[];
  authProviders?: string[];
  authSignals?: PluginManifestCapabilityProviderAuthSignal[];
  configSignals?: PluginManifestCapabilityProviderConfigSignal[];
  referenceAudioInputs?: boolean;
};

export type PluginManifestToolMetadata = PluginManifestCapabilityProviderMetadata & {
  optional?: boolean;
  replaySafe?: boolean;
};

export type PluginManifestProviderAuthChoice = {
  provider: string;
  method: string;
  choiceId: string;
  choiceLabel?: string;
  choiceHint?: string;
  assistantPriority?: number;
  assistantVisibility?: "visible" | "manual-only";
  deprecatedChoiceIds?: string[];
  groupId?: string;
  groupLabel?: string;
  groupHint?: string;
  onboardingFeatured?: boolean;
  optionKey?: string;
  cliFlag?: string;
  cliOption?: string;
  cliDescription?: string;
  onboardingScopes?: PluginManifestOnboardingScope[];
};

export type PluginManifestOnboardingScope =
  | "text-inference"
  | "image-generation"
  | "music-generation";

export type PluginManifestLoadResult =
  | { ok: true; manifest: PluginManifest; manifestPath: string }
  | { ok: false; error: string; manifestPath: string };

export type PluginPackageChannel = {
  id?: string;
  label?: string;
  selectionLabel?: string;
  detailLabel?: string;
  docsPath?: string;
  docsLabel?: string;
  blurb?: string;
  order?: number;
  aliases?: readonly string[];
  preferOver?: readonly string[];
  systemImage?: string;
  selectionDocsPrefix?: string;
  selectionDocsOmitLabel?: boolean;
  selectionExtras?: readonly string[];
  markdownCapable?: boolean;
  exposure?: {
    configured?: boolean;
    setup?: boolean;
    docs?: boolean;
  };
  showConfigured?: boolean;
  showInSetup?: boolean;
  quickstartAllowFrom?: boolean;
  forceAccountBinding?: boolean;
  preferSessionLookupForAnnounceTarget?: boolean;
  commands?: PluginManifestChannelCommandDefaults;
  configuredState?: {
    specifier?: string;
    exportName?: string;
    env?: {
      allOf?: readonly string[];
      anyOf?: readonly string[];
    };
  };
  persistedAuthState?: {
    specifier?: string;
    exportName?: string;
  };
  doctorCapabilities?: PluginPackageChannelDoctorCapabilities;
  cliAddOptions?: readonly PluginPackageChannelCliOption[];
};

export type PluginPackageChannelDoctorCapabilities = {
  dmAllowFromMode?: "topOnly" | "topOrNested" | "nestedOnly";
  groupModel?: "sender" | "route" | "hybrid";
  groupAllowFromFallbackToAllowFrom?: boolean;
  warnOnEmptyGroupSenderAllowlist?: boolean;
};

export type PluginPackageChannelCliOption = {
  flags: string;
  description: string;
  defaultValue?: boolean | string;
};

export type PluginPackageInstall = {
  clawhubSpec?: string;
  npmSpec?: string;
  localPath?: string;
  defaultChoice?: "clawhub" | "npm" | "local";
  minHostVersion?: string;
  expectedIntegrity?: string;
  allowInvalidConfigRecovery?: boolean;
  requiredPlatformPackages?: string[];
};

export type OpenClawPackageStartup = {
  deferConfiguredChannelFullLoadUntilAfterListen?: boolean;
};

export type OpenClawPackageSetupFeatures = {
  configPromotion?: boolean;
  legacyStateMigrations?: boolean;
  legacySessionSurfaces?: boolean;
};

export type OpenClawPackageCompat = {
  pluginApi?: string;
};

export type OpenClawPackageManifest = {
  extensions?: string[];
  runtimeExtensions?: string[];
  setupEntry?: string;
  runtimeSetupEntry?: string;
  setupFeatures?: OpenClawPackageSetupFeatures;
  plugin?: {
    id?: string;
    label?: string;
  };
  channel?: PluginPackageChannel;
  compat?: OpenClawPackageCompat;
  install?: PluginPackageInstall;
  startup?: OpenClawPackageStartup;
};

export type ManifestKey = typeof MANIFEST_KEY;

export type PackageManifest = {
  name?: string;
  version?: string;
  description?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
} & Partial<Record<ManifestKey, OpenClawPackageManifest>>;

export type PackageExtensionResolution =
  | { status: "ok"; entries: string[] }
  | { status: "missing"; entries: [] }
  | { status: "empty"; entries: [] }
  | { status: "invalid"; entries: []; error: string };

// ---------------------------------------------------------------------------
// 运行时函数（降级实现）
// ---------------------------------------------------------------------------

/** Clears process-local manifest parse cache for tests and explicit refresh flows. */
export function clearPluginManifestLoadCache(): void {
  // 降级：空实现
}

/** Normalizes manifest activation metadata. */
export function normalizeManifestActivation(value: unknown): PluginManifestActivation | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  void ENV_SECRET_REF_ID_RE;
  void normalizeModelCatalog;
  void parseJsonWithJson5Fallback;
  void isBlockedObjectKey;
  const onStartup = typeof value.onStartup === "boolean" ? value.onStartup : undefined;
  const onProviders = normalizeTrimmedStringList(value.onProviders);
  const onCommands = normalizeTrimmedStringList(value.onCommands);
  const onChannels = normalizeTrimmedStringList(value.onChannels);
  const activation = {
    ...(onStartup !== undefined ? { onStartup } : {}),
    ...(onProviders.length > 0 ? { onProviders } : {}),
    ...(onCommands.length > 0 ? { onCommands } : {}),
    ...(onChannels.length > 0 ? { onChannels } : {}),
  };
  return Object.keys(activation).length > 0 ? activation : undefined;
}

/** Normalizes manifest channel command defaults. */
export function normalizeManifestChannelCommandDefaults(
  value: unknown,
): PluginManifestChannelCommandDefaults | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const nativeCommandsAutoEnabled =
    typeof value.nativeCommandsAutoEnabled === "boolean"
      ? value.nativeCommandsAutoEnabled
      : undefined;
  const nativeSkillsAutoEnabled =
    typeof value.nativeSkillsAutoEnabled === "boolean" ? value.nativeSkillsAutoEnabled : undefined;
  return nativeCommandsAutoEnabled !== undefined || nativeSkillsAutoEnabled !== undefined
    ? {
        ...(nativeCommandsAutoEnabled !== undefined ? { nativeCommandsAutoEnabled } : {}),
        ...(nativeSkillsAutoEnabled !== undefined ? { nativeSkillsAutoEnabled } : {}),
      }
    : undefined;
}

/** Resolves the plugin manifest path for a root directory. */
export function resolvePluginManifestPath(rootDir: string): string {
  void rootDir;
  throw new Error("not implemented: resolvePluginManifestPath requires fs deps");
}

/** Loads and parses a plugin manifest from the filesystem. */
export function loadPluginManifest(
  _rootDir: string,
  _rejectHardlinks?: boolean,
  _rootRealPath?: string,
): PluginManifestLoadResult {
  throw new Error("not implemented: loadPluginManifest requires fs deps");
}

/** Returns the openclaw package manifest metadata. */
export function getPackageManifestMetadata(
  manifest: PackageManifest | undefined,
): OpenClawPackageManifest | undefined {
  if (!manifest) {
    return undefined;
  }
  return manifest[MANIFEST_KEY];
}

/** Resolves package extension entries from a package manifest. */
export function resolvePackageExtensionEntries(
  manifest: PackageManifest | undefined,
): PackageExtensionResolution {
  const rawOpenClaw = manifest?.[MANIFEST_KEY] as unknown;
  if (rawOpenClaw === undefined || rawOpenClaw === null) {
    return { status: "missing", entries: [] };
  }
  if (!isRecord(rawOpenClaw)) {
    return {
      status: "invalid",
      entries: [],
      error: "package.json openclaw must be an object",
    };
  }
  const raw = rawOpenClaw.extensions;
  if (raw === undefined || raw === null) {
    return { status: "missing", entries: [] };
  }
  if (!Array.isArray(raw)) {
    return {
      status: "invalid",
      entries: [],
      error: "package.json openclaw.extensions must be an array",
    };
  }
  const entries: string[] = [];
  for (const [index, entry] of raw.entries()) {
    const normalized = normalizeOptionalString(entry);
    if (!normalized) {
      return {
        status: "invalid",
        entries: [],
        error: `package.json openclaw.extensions[${index}] must be a non-empty string`,
      };
    }
    entries.push(normalized);
  }
  if (entries.length === 0) {
    return { status: "empty", entries: [] };
  }
  return { status: "ok", entries };
}

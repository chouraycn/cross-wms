/** Shared registration types that make up the in-memory plugin registry. */
//
// 移植自 openclaw/src/plugins/registry-types.ts。
//
// 降级策略：
//  - 原文件依赖 50+ 个外部模块的类型。cross-wms 尚未移植其中大部分。
//    这里对已移植的模块直接引用，对未移植的模块定义本地 unknown 占位类型。
//  - 已移植可直接引用的模块：
//    ./manifest-types.js (PluginFormat, PluginBundleFormat, PluginConfigUiHint, PluginDiagnostic)
//    ./plugin-kind.types.js (PluginKind)
//    ./agent-tool-result-middleware-types.js (AgentToolResultMiddleware, AgentToolResultMiddlewareRuntime)
//    ./codex-app-server-extension-types.js (CodexAppServerExtensionFactory)
//  - 未移植模块的类型降级为 unknown 占位（作为 PluginRegistry 数组元素类型）。
//  - PluginRecord 保留完整字段集以维持类型契约。

import type {
  AgentToolResultMiddleware,
  AgentToolResultMiddlewareRuntime,
} from "./agent-tool-result-middleware-types.js";
import type { CodexAppServerExtensionFactory } from "./codex-app-server-extension-types.js";
import type {
  PluginBundleFormat,
  PluginConfigUiHint,
  PluginDiagnostic,
  PluginFormat,
} from "./manifest-types.js";
import type { PluginKind } from "./plugin-kind.types.js";

// ============================================================================
// 内联降级类型占位：未移植模块
// ============================================================================

/** 降级占位：../agents/harness/types.js —— AgentHarness */
type AgentHarness = unknown;

/** 降级占位：../gateway/methods/descriptor.js —— GatewayMethodDescriptor */
type GatewayMethodDescriptor = unknown;

/** 降级占位：../gateway/server-methods/types.js —— GatewayRequestHandlers */
type GatewayRequestHandlers = Record<string, unknown>;

/** 降级占位：../hooks/types.js —— HookEntry */
type HookEntry = unknown;

/** 降级占位：../shared/json-schema.types.js —— JsonSchemaObject */
type JsonSchemaObject = Record<string, unknown>;

/** 降级占位：./compat/registry.js —— PluginCompatCode */
type PluginCompatCode = string;

/** 降级占位：./config-state.js —— PluginActivationSource */
type PluginActivationSource = unknown;

/** 降级占位：./embedding-providers.js —— EmbeddingProviderAdapter */
type EmbeddingProviderAdapter = { id: string };

/** 降级占位：./host-hooks.js —— 多个类型 */
type PluginAgentEventSubscriptionRegistration = unknown;
type PluginControlUiDescriptor = unknown;
type PluginRuntimeLifecycleRegistration = unknown;
type PluginSessionActionRegistration = unknown;
type PluginSessionSchedulerJobRegistration = {
  id: string;
  sessionKey: string;
  kind: string;
  cleanup?: (params: { reason: unknown; sessionKey: string; jobId: string }) => void | Promise<void>;
};
type PluginSessionExtensionRegistration = unknown;
type PluginToolMetadataRegistration = unknown;
type PluginTrustedToolPolicyRegistration = unknown;

/** 降级占位：./manifest.js —— PluginManifestContracts */
type PluginManifestContracts = Record<string, unknown>;

/** 降级占位：./memory-embedding-providers.js —— MemoryEmbeddingProviderAdapter */
type MemoryEmbeddingProviderAdapter = { id: string };

/** 降级占位：./runtime/types.js —— PluginRuntime */
type PluginRuntime = unknown;

/** 降级占位：./status-dependencies-core.js —— PluginDependencyStatus */
type PluginDependencyStatus = unknown;

/** 降级占位：../channels/plugins/types.plugin.js —— ChannelPlugin */
type ChannelPlugin = unknown;

/** 降级占位：./types.js —— 多个类型（cross-wms types.ts 导出集与 openclaw 不同） */
type OpenClawPluginCliCommandDescriptor = unknown;
type OpenClawPluginCliRegistrar = unknown;
type OpenClawPluginCommandDefinition = unknown;
type OpenClawPluginGatewayRuntimeScopeSurface = unknown;
type OpenClawGatewayDiscoveryService = unknown;
type OpenClawPluginHttpRouteAuth = unknown;
type OpenClawPluginHttpRouteHandler = unknown;
type OpenClawPluginHttpRouteUpgradeHandler = unknown;
type OpenClawPluginHttpRouteMatch = unknown;
type OpenClawPluginHostedMediaResolver = unknown;
type OpenClawPluginReloadRegistration = unknown;
type OpenClawPluginSecurityAuditCollector = unknown;
type OpenClawPluginService = unknown;
type OpenClawPluginToolFactory = unknown;
type PluginConversationBindingResolvedEvent = unknown;
type PluginLogger = (...args: unknown[]) => void;
type PluginOrigin = string;
type PluginTextTransformRegistration = unknown;
type CliBackendPlugin = unknown;
type ImageGenerationProviderPlugin = { id: string };
type MediaUnderstandingProviderPlugin = { id: string };
type TranscriptSourceProvider = { id: string };
type MusicGenerationProviderPlugin = { id: string };
type MigrationProviderPlugin = { id: string };
type ProviderPlugin = { id: string };
type RealtimeTranscriptionProviderPlugin = { id: string };
type RealtimeVoiceProviderPlugin = { id: string };
type SpeechProviderPlugin = { id: string };
type VideoGenerationProviderPlugin = { id: string };
type WebFetchProviderPlugin = { id: string };
type WebSearchProviderPlugin = { id: string };
type UnifiedModelCatalogProviderPlugin = { id: string };
/** 降级占位：./types.js —— OpenClawPluginNodeInvokePolicy */
type OpenClawPluginNodeInvokePolicy = unknown;

/** 降级占位：../cron/service-contract.js —— CronServiceContract */
type CronServiceContract = unknown;

// ============================================================================
// Registration 类型定义
// ============================================================================

/** Agent tool factory registered by one plugin runtime. */
export type PluginToolRegistration = {
  pluginId: string;
  pluginName?: string;
  factory: OpenClawPluginToolFactory;
  names: string[];
  declaredNames?: string[];
  optional: boolean;
  source: string;
  rootDir?: string;
};

export type PluginCliRegistration = {
  pluginId: string;
  pluginName?: string;
  register: OpenClawPluginCliRegistrar;
  parentPath: string[];
  commands: string[];
  descriptors: OpenClawPluginCliCommandDescriptor[];
  source: string;
  rootDir?: string;
};

/** Gateway HTTP route registered by a plugin runtime. */
export type PluginHttpRouteRegistration = {
  pluginId?: string;
  path: string;
  handler: OpenClawPluginHttpRouteHandler;
  handleUpgrade?: OpenClawPluginHttpRouteUpgradeHandler;
  auth: OpenClawPluginHttpRouteAuth;
  match: OpenClawPluginHttpRouteMatch;
  gatewayRuntimeScopeSurface?: OpenClawPluginGatewayRuntimeScopeSurface;
  gatewayMethodDispatchAllowed?: boolean;
  nodeCapability?: {
    surface: string;
    ttlMs?: number;
  };
  source?: string;
};

export type PluginHostedMediaResolverRegistration = {
  pluginId: string;
  pluginName?: string;
  resolver: OpenClawPluginHostedMediaResolver;
  source: string;
  rootDir?: string;
};

export type PluginChannelRegistration = {
  pluginId: string;
  pluginName?: string;
  plugin: ChannelPlugin;
  source: string;
  rootDir?: string;
};

export type PluginChannelSetupRegistration = {
  pluginId: string;
  pluginName?: string;
  plugin: ChannelPlugin;
  source: string;
  enabled: boolean;
  rootDir?: string;
};

export type PluginProviderRegistration = {
  pluginId: string;
  pluginName?: string;
  provider: ProviderPlugin;
  source: string;
  rootDir?: string;
};

export type PluginModelCatalogProviderRegistration = {
  pluginId: string;
  pluginName?: string;
  provider: UnifiedModelCatalogProviderPlugin;
  source: string;
  rootDir?: string;
};

export type PluginCliBackendRegistration = {
  pluginId: string;
  pluginName?: string;
  backend: CliBackendPlugin;
  source: string;
  rootDir?: string;
};

export type PluginTextTransformsRegistration = {
  pluginId: string;
  pluginName?: string;
  transforms: PluginTextTransformRegistration;
  source: string;
  rootDir?: string;
};

type PluginOwnedProviderRegistration<T extends { id: string }> = {
  pluginId: string;
  pluginName?: string;
  provider: T;
  source: string;
  rootDir?: string;
};

export type PluginSpeechProviderRegistration =
  PluginOwnedProviderRegistration<SpeechProviderPlugin>;
export type PluginEmbeddingProviderRegistration =
  PluginOwnedProviderRegistration<EmbeddingProviderAdapter>;
export type PluginRealtimeTranscriptionProviderRegistration =
  PluginOwnedProviderRegistration<RealtimeTranscriptionProviderPlugin>;
export type PluginRealtimeVoiceProviderRegistration =
  PluginOwnedProviderRegistration<RealtimeVoiceProviderPlugin>;
export type PluginMediaUnderstandingProviderRegistration =
  PluginOwnedProviderRegistration<MediaUnderstandingProviderPlugin>;
export type PluginTranscriptsSourceProviderRegistration =
  PluginOwnedProviderRegistration<TranscriptSourceProvider>;
export type PluginImageGenerationProviderRegistration =
  PluginOwnedProviderRegistration<ImageGenerationProviderPlugin>;
export type PluginVideoGenerationProviderRegistration =
  PluginOwnedProviderRegistration<VideoGenerationProviderPlugin>;
export type PluginMusicGenerationProviderRegistration =
  PluginOwnedProviderRegistration<MusicGenerationProviderPlugin>;
export type PluginWebFetchProviderRegistration =
  PluginOwnedProviderRegistration<WebFetchProviderPlugin>;
export type PluginWebSearchProviderRegistration =
  PluginOwnedProviderRegistration<WebSearchProviderPlugin>;
export type PluginMigrationProviderRegistration =
  PluginOwnedProviderRegistration<MigrationProviderPlugin>;
export type PluginMemoryEmbeddingProviderRegistration =
  PluginOwnedProviderRegistration<MemoryEmbeddingProviderAdapter>;
export type PluginCodexAppServerExtensionFactoryRegistration = {
  pluginId: string;
  pluginName?: string;
  rawFactory: CodexAppServerExtensionFactory;
  factory: CodexAppServerExtensionFactory;
  source: string;
  rootDir?: string;
};
export type PluginAgentToolResultMiddlewareRegistration = {
  pluginId: string;
  pluginName?: string;
  rawHandler: AgentToolResultMiddleware;
  handler: AgentToolResultMiddleware;
  runtimes: AgentToolResultMiddlewareRuntime[];
  source: string;
  rootDir?: string;
};
export type PluginAgentHarnessRegistration = {
  pluginId: string;
  pluginName?: string;
  harness: AgentHarness;
  source: string;
  rootDir?: string;
};

export type PluginHookRegistration = {
  pluginId: string;
  entry: HookEntry;
  events: string[];
  source: string;
  rootDir?: string;
};

export type PluginServiceRegistration = {
  pluginId: string;
  pluginName?: string;
  service: OpenClawPluginService;
  source: string;
  origin: PluginOrigin;
  trustedOfficialInstall?: boolean;
  rootDir?: string;
};

export type PluginGatewayDiscoveryServiceRegistration = {
  pluginId: string;
  pluginName?: string;
  service: OpenClawGatewayDiscoveryService;
  source: string;
  rootDir?: string;
};

export type PluginReloadRegistration = {
  pluginId: string;
  pluginName?: string;
  registration: OpenClawPluginReloadRegistration;
  source: string;
  rootDir?: string;
};

export type PluginNodeHostCommandRegistration = {
  pluginId: string;
  pluginName?: string;
  command: OpenClawPluginNodeHostCommand;
  source: string;
  rootDir?: string;
};

export type PluginNodeInvokePolicyRegistration = {
  pluginId: string;
  pluginName?: string;
  policy: OpenClawPluginNodeInvokePolicy;
  pluginConfig?: Record<string, unknown>;
  source: string;
  rootDir?: string;
};

export type PluginSecurityAuditCollectorRegistration = {
  pluginId: string;
  pluginName?: string;
  collector: OpenClawPluginSecurityAuditCollector;
  source: string;
  rootDir?: string;
};

export type PluginCommandRegistration = {
  pluginId: string;
  pluginName?: string;
  command: OpenClawPluginCommandDefinition;
  source: string;
  rootDir?: string;
};

export type PluginSessionExtensionRegistryRegistration = {
  pluginId: string;
  pluginName?: string;
  extension: PluginSessionExtensionRegistration;
  source: string;
  rootDir?: string;
};

export type PluginTrustedToolPolicyRegistryRegistration = {
  pluginId: string;
  pluginName?: string;
  policy: PluginTrustedToolPolicyRegistration;
  origin?: PluginRecord["origin"];
  source: string;
  rootDir?: string;
};

export type PluginToolMetadataRegistryRegistration = {
  pluginId: string;
  pluginName?: string;
  metadata: PluginToolMetadataRegistration;
  source: string;
  rootDir?: string;
};

export type PluginControlUiDescriptorRegistryRegistration = {
  pluginId: string;
  pluginName?: string;
  descriptor: PluginControlUiDescriptor;
  source: string;
  rootDir?: string;
};

export type PluginRuntimeLifecycleRegistryRegistration = {
  pluginId: string;
  pluginName?: string;
  lifecycle: PluginRuntimeLifecycleRegistration;
  source: string;
  rootDir?: string;
};

export type PluginAgentEventSubscriptionRegistryRegistration = {
  pluginId: string;
  pluginName?: string;
  subscription: PluginAgentEventSubscriptionRegistration;
  source: string;
  rootDir?: string;
};

export type PluginSessionSchedulerJobRegistryRegistration = {
  pluginId: string;
  pluginName?: string;
  job: PluginSessionSchedulerJobRegistration;
  generation?: number;
  source: string;
  rootDir?: string;
};

export type PluginSessionActionRegistryRegistration = {
  pluginId: string;
  pluginName?: string;
  action: PluginSessionActionRegistration;
  source: string;
  rootDir?: string;
};

export type PluginConversationBindingResolvedHandlerRegistration = {
  pluginId: string;
  pluginName?: string;
  pluginRoot?: string;
  handler: (event: PluginConversationBindingResolvedEvent) => void | Promise<void>;
  source: string;
  rootDir?: string;
};

export type PluginRecord = {
  id: string;
  name: string;
  version?: string;
  packageName?: string;
  description?: string;
  format?: PluginFormat;
  bundleFormat?: PluginBundleFormat;
  bundleCapabilities?: string[];
  kind?: PluginKind | PluginKind[];
  source: string;
  rootDir?: string;
  origin: PluginOrigin;
  workspaceDir?: string;
  trustedOfficialInstall?: boolean;
  enabled: boolean;
  explicitlyEnabled?: boolean;
  activated?: boolean;
  imported?: boolean;
  compat?: readonly PluginCompatCode[];
  activationSource?: PluginActivationSource;
  activationReason?: string;
  status: "loaded" | "disabled" | "error";
  error?: string;
  failedAt?: Date;
  failurePhase?: "validation" | "load" | "register";
  toolNames: string[];
  hookNames: string[];
  channelIds: string[];
  cliBackendIds: string[];
  providerIds: string[];
  syntheticAuthRefs?: string[];
  embeddingProviderIds: string[];
  speechProviderIds: string[];
  realtimeTranscriptionProviderIds: string[];
  realtimeVoiceProviderIds: string[];
  mediaUnderstandingProviderIds: string[];
  transcriptSourceProviderIds: string[];
  imageGenerationProviderIds: string[];
  videoGenerationProviderIds: string[];
  musicGenerationProviderIds: string[];
  webFetchProviderIds: string[];
  webSearchProviderIds: string[];
  migrationProviderIds: string[];
  contextEngineIds?: string[];
  memoryEmbeddingProviderIds: string[];
  agentHarnessIds: string[];
  cliCommands: string[];
  services: string[];
  gatewayDiscoveryServiceIds: string[];
  commands: string[];
  httpRoutes: number;
  hookCount: number;
  configSchema: boolean;
  configUiHints?: Record<string, PluginConfigUiHint>;
  configJsonSchema?: JsonSchemaObject;
  contracts?: PluginManifestContracts;
  memorySlotSelected?: boolean;
  dependencyStatus?: PluginDependencyStatus;
};

export type PluginRegistry = {
  plugins: PluginRecord[];
  tools: PluginToolRegistration[];
  hooks: PluginHookRegistration[];
  typedHooks: PluginHookRegistration[];
  channels: PluginChannelRegistration[];
  channelSetups: PluginChannelSetupRegistration[];
  providers: PluginProviderRegistration[];
  modelCatalogProviders: PluginModelCatalogProviderRegistration[];
  cliBackends?: PluginCliBackendRegistration[];
  textTransforms: PluginTextTransformsRegistration[];
  embeddingProviders: PluginEmbeddingProviderRegistration[];
  speechProviders: PluginSpeechProviderRegistration[];
  realtimeTranscriptionProviders: PluginRealtimeTranscriptionProviderRegistration[];
  realtimeVoiceProviders: PluginRealtimeVoiceProviderRegistration[];
  mediaUnderstandingProviders: PluginMediaUnderstandingProviderRegistration[];
  transcriptSourceProviders: PluginTranscriptsSourceProviderRegistration[];
  imageGenerationProviders: PluginImageGenerationProviderRegistration[];
  videoGenerationProviders: PluginVideoGenerationProviderRegistration[];
  musicGenerationProviders: PluginMusicGenerationProviderRegistration[];
  webFetchProviders: PluginWebFetchProviderRegistration[];
  webSearchProviders: PluginWebSearchProviderRegistration[];
  migrationProviders: PluginMigrationProviderRegistration[];
  codexAppServerExtensionFactories: PluginCodexAppServerExtensionFactoryRegistration[];
  agentToolResultMiddlewares: PluginAgentToolResultMiddlewareRegistration[];
  memoryEmbeddingProviders: PluginMemoryEmbeddingProviderRegistration[];
  agentHarnesses: PluginAgentHarnessRegistration[];
  gatewayHandlers: GatewayRequestHandlers;
  gatewayMethodDescriptors: GatewayMethodDescriptor[];
  coreGatewayMethodNames?: string[];
  httpRoutes: PluginHttpRouteRegistration[];
  hostedMediaResolvers?: PluginHostedMediaResolverRegistration[];
  cliRegistrars: PluginCliRegistration[];
  reloads?: PluginReloadRegistration[];
  nodeHostCommands?: PluginNodeHostCommandRegistration[];
  nodeInvokePolicies?: PluginNodeInvokePolicyRegistration[];
  securityAuditCollectors?: PluginSecurityAuditCollectorRegistration[];
  services: PluginServiceRegistration[];
  gatewayDiscoveryServices: PluginGatewayDiscoveryServiceRegistration[];
  commands: PluginCommandRegistration[];
  sessionExtensions?: PluginSessionExtensionRegistryRegistration[];
  trustedToolPolicies?: PluginTrustedToolPolicyRegistryRegistration[];
  toolMetadata?: PluginToolMetadataRegistryRegistration[];
  controlUiDescriptors?: PluginControlUiDescriptorRegistryRegistration[];
  runtimeLifecycles?: PluginRuntimeLifecycleRegistryRegistration[];
  agentEventSubscriptions?: PluginAgentEventSubscriptionRegistryRegistration[];
  sessionSchedulerJobs?: PluginSessionSchedulerJobRegistryRegistration[];
  sessionActions?: PluginSessionActionRegistryRegistration[];
  conversationBindingResolvedHandlers: PluginConversationBindingResolvedHandlerRegistration[];
  diagnostics: PluginDiagnostic[];
};

export type PluginRegistryParams = {
  logger: PluginLogger;
  coreGatewayHandlers?: GatewayRequestHandlers;
  coreGatewayMethodNames?: readonly string[];
  runtime: PluginRuntime;
  hostServices?: {
    /** May be a live accessor; plugin APIs must read it at call time. */
    cron?: CronServiceContract;
  };
  activateGlobalSideEffects?: boolean;
};

export type PluginRegistrationMode = unknown;
export type OpenClawPluginNodeHostCommand = unknown;
export type OpenClawPluginToolContext = unknown;
export type OpenClawPluginHttpRouteParams = unknown;
export type OpenClawPluginHookOptions = unknown;
export type PluginHookHandlerMap = unknown;
export type OpenClawPluginApi = unknown;

/**
 * Plugin Types — 深化插件系统的扩展类型定义
 *
 * 参考 openclaw/src/plugins/types.ts 与 openclaw/src/plugin-sdk/index.ts 的分层方式，
 * 在 server/engine/plugins/types.ts 暴露运行时内部使用的类型契约。
 *
 * - 与 shared/pluginManifest.ts 的 PluginManifest 互补：本文件聚焦运行时类型
 * - 与 plugin-sdk/types.ts 互补：SDK 侧暴露给插件作者，本文件暴露给宿主
 */

import type { PluginPermission } from './permissions.js';
import type { PluginLoadState } from './loader-state.js';
import type { PluginStatus } from './status.js';
import type {
  UnifiedModelCatalogEntry,
  UnifiedModelCatalogKind,
} from './_openclaw__model_catalog_core__model_catalog_types.js';
import type { OpenClawConfig } from '../config/types.openclaw.js';
import type {
  ApiKeyCredential,
  AuthProfileCredential,
} from '../agents/auth-profiles/types.js';

/** 插件能力种类 — 对应 plugin-sdk 装饰器可声明的扩展点 */
export type PluginCapabilityKind =
  | 'tool'
  | 'hook'
  | 'command'
  | 'channel'
  | 'provider'
  | 'memory-host'
  | 'embedding'
  | 'service'
  | 'search'
  | 'media'
  | 'skill';

/** 插件来源 — 与 loader-state.ts 中的 source 字段对齐 */
export type PluginSource = 'local' | 'npm' | 'git' | 'zip' | 'bundled' | 'dev';

/** 语义化版本范围（兼容 npm semver 子集） */
export interface PluginVersionRange {
  /** 主版本号，必须 >= 0 */
  major: number;
  /** 次版本号，必须 >= 0 */
  minor: number;
  /** 修订号，必须 >= 0 */
  patch: number;
  /** 预发布标识，如 alpha.1 / beta.2 */
  prerelease?: string;
}

/** 插件依赖声明 */
export interface PluginDependency {
  /** 依赖的插件 ID */
  id: string;
  /** 版本范围字符串，例如 ^1.2.0 / >=2.0.0 / * */
  versionRange: string;
  /** 是否为可选依赖 */
  optional?: boolean;
}

/** 插件清单（运行时扩展形态） */
export interface PluginManifest {
  /** 唯一标识（小写字母、数字、下划线、连字符） */
  id: string;
  /** 机器名 */
  name: string;
  /** 显示名 */
  displayName?: string;
  /** 语义化版本号 */
  version: string;
  /** 作者 */
  author?: string;
  /** 描述 */
  description?: string;
  /** MUI 图标名 */
  icon?: string;
  /** 入口文件路径（相对于插件根目录） */
  entry?: string;
  /** 入口文件路径（旧字段，与 entry 等价，保留以兼容旧 manifest） */
  entrypoint?: string;
  /** 许可证 */
  license?: string;
  /** 工具列表 */
  tools?: PluginToolDefinition[];
  /** 触发器列表 */
  triggers?: PluginTrigger[];
  /** 权限声明 */
  permissions?: string[];
  /** 整体风险等级 */
  riskLevel?: 'auto' | 'confirm' | 'high-risk';
  /** 插件 API 版本（用于兼容性检查） */
  apiVersion?: string;
  /** 依赖列表 */
  dependencies?: PluginDependency[];
  /** 能力声明 */
  capabilities?: PluginCapabilityKind[];
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
  /** 配置 schema（JSON Schema 子集） */
  configSchema?: PluginConfigSchema;
}

/** 插件工具定义 */
export interface PluginToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  riskLevel?: 'auto' | 'confirm' | 'high-risk';
}

/** 插件触发器 */
export interface PluginTrigger {
  keyword: string;
  description?: string;
}

/** 插件配置 schema（JSON Schema 子集） */
export interface PluginConfigSchema {
  type?: 'object';
  properties?: Record<string, PluginConfigProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/** 配置属性定义 */
export interface PluginConfigProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: PluginConfigProperty;
  properties?: Record<string, PluginConfigProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/** 插件实例（已加载并实例化） */
export interface PluginInstance {
  /** 插件 ID */
  id: string;
  /** 来自 manifest */
  manifest: PluginManifest;
  /** 模块导出实例（来自 entry import） */
  module?: unknown;
  /** 加载时间戳 */
  loadedAt: number;
  /** 当前运行状态 */
  status: PluginStatus;
  /** 错误信息（如有） */
  error?: string;
  /** 已声明的能力列表 */
  capabilities: PluginCapabilityKind[];
}

/** 插件上下文（注入到插件运行时） */
export interface PluginContext {
  /** 插件 ID */
  pluginId: string;
  /** 受限 logger */
  logger: PluginLogger;
  /** 受限存储 */
  storage: PluginStorage;
  /** 受限网络访问 */
  fetch: PluginFetch;
  /** 事件总线 */
  eventBus: PluginEventBus;
  /** 配置读取器 */
  config: PluginConfigAccessor;
  /** 权限查询 */
  hasPermission: (permission: PluginPermission) => boolean;
  /** 当前 manifest */
  manifest: PluginManifest;
}

/** 受限 logger */
export interface PluginLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** 受限 KV 存储（按插件 ID 命名空间隔离） */
export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** 受限 fetch */
export interface PluginFetch {
  (input: string, init?: PluginFetchInit): Promise<PluginFetchResponse>;
}

/** fetch 初始化参数 */
export interface PluginFetchInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/** fetch 响应 */
export interface PluginFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/** 事件总线 */
export interface PluginEventBus {
  emit(event: string, payload?: unknown): void;
  on(event: string, handler: (payload: unknown) => void): () => void;
  off(event: string, handler: (payload: unknown) => void): void;
}

/** 配置访问器 */
export interface PluginConfigAccessor {
  get<T = unknown>(key: string): T | undefined;
  getAll(): Record<string, unknown>;
}

/** 插件生命周期接口（可选实现） */
export interface PluginLifecycle {
  /** 安装时调用（仅一次） */
  install?: (context: PluginContext) => Promise<void> | void;
  /** 启用时调用 */
  enable?: (context: PluginContext) => Promise<void> | void;
  /** 禁用时调用 */
  disable?: (context: PluginContext) => Promise<void> | void;
  /** 卸载时调用 */
  uninstall?: (context: PluginContext) => Promise<void> | void;
  /** 更新时调用 */
  update?: (fromVersion: string, context: PluginContext) => Promise<void> | void;
}

/** 插件运行时记录（合并 manifest + load-state + status） */
export interface PluginRuntimeRecord {
  pluginId: string;
  version: string;
  source: PluginSource;
  status: PluginStatus;
  loadState: PluginLoadState;
  capabilities: PluginCapabilityKind[];
  dependencies: PluginDependency[];
  lastError?: string;
  enabledAt?: number;
  loadedAt?: number;
}

/** 插件事件（供 eventBus 与 health-checker 使用） */
export interface PluginEvent {
  type: 'load' | 'activate' | 'deactivate' | 'error' | 'uninstall' | 'update';
  pluginId: string;
  timestamp: number;
  payload?: unknown;
}

/** 插件健康指标 */
export interface PluginHealthMetrics {
  pluginId: string;
  healthy: boolean;
  memoryBytes?: number;
  errorCount: number;
  lastErrorAt?: number;
  lastCheckAt: number;
  uptimeMs: number;
}

/** 插件市场条目 */
export interface MarketplaceEntry {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  version: string;
  author: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  categories: string[];
  homepage?: string;
  repository?: string;
  license?: string;
  publishedAt: number;
  updatedAt: number;
}

/** 插件市场搜索查询 */
export interface MarketplaceSearchQuery {
  keyword?: string;
  category?: string;
  author?: string;
  /** 限制返回条数 */
  limit?: number;
  /** 偏移量（分页） */
  offset?: number;
  /** 排序字段 */
  sortBy?: 'downloads' | 'rating' | 'updatedAt' | 'name';
  /** 排序方向 */
  order?: 'asc' | 'desc';
}

/** 插件市场搜索结果 */
export interface MarketplaceSearchResult {
  entries: MarketplaceEntry[];
  total: number;
  hasMore: boolean;
}

/** 插件市场评分请求 */
export interface MarketplaceRating {
  pluginId: string;
  score: number;
  comment?: string;
  userId: string;
  createdAt: number;
}

/** 插件契约校验结果 */
export interface PluginContractResult {
  compatible: boolean;
  /** 不兼容原因列表 */
  reasons: string[];
  /** 宿主 API 版本 */
  hostApiVersion: string;
  /** 插件声明的 API 版本 */
  pluginApiVersion: string;
}

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const AGENT_PROMPT_SURFACE_KINDS: readonly string[] = [
  "openclaw_main",
  "pi_main",
  "openclaw_subagent",
  "openclaw_compaction",
  "openclaw_planner",
];

// ---------------------------------------------------------------------------
// 降级类型桩：对应 openclaw src/plugins/types.ts 中引用外部模块的类型。
// cross-wms 暂未移植这些模块，以最小化结构占位保证 import 兼容。
// ---------------------------------------------------------------------------

export type AgentHarness = { id: string; [key: string]: unknown };
export type AgentPromptGuidanceEntry = {
  text: string;
  surfaces?: readonly string[];
};
export type AgentPromptGuidance = string | AgentPromptGuidanceEntry;
export type AnyAgentTool = { name: string; [key: string]: unknown };
export type CliBackendPlugin = { id: string; [key: string]: unknown };
export type ImageGenerationProviderPlugin = { id: string; [key: string]: unknown };
export type MediaUnderstandingProviderPlugin = { id: string; [key: string]: unknown };
export type MigrationProviderPlugin = { id: string; [key: string]: unknown };
export type MusicGenerationProviderPlugin = { id: string; [key: string]: unknown };
export type OpenClawPluginApi = { [key: string]: unknown };
export type OpenClawPluginCliCommandDescriptor = {
  name: string;
  description: string;
  hasSubcommands: boolean;
};
export type OpenClawPluginCliContext = { [key: string]: unknown };
export type OpenClawPluginCliRegistrar = (ctx: OpenClawPluginCliContext) => void | Promise<void>;
export type OpenClawPluginCommandDefinition = {
  name: string;
  description: string;
  nativeNames?: Partial<Record<string, string>> & { default?: string };
  nativeProgressMessages?: Partial<Record<string, string>> & { default?: string };
  descriptionLocalizations?: Record<string, string>;
  channels?: readonly string[];
  agentPromptGuidance?: readonly AgentPromptGuidance[];
  acceptsArgs?: boolean;
  requireAuth?: boolean;
  requiredScopes?: readonly string[];
  exposeSenderIsOwner?: boolean;
  ownership?: "plugin" | "reserved";
  handler: (...args: unknown[]) => unknown;
};
export type OpenClawPluginDefinition = { [key: string]: unknown };
export type OpenClawPluginHttpRouteAuth = "gateway" | "plugin";
export type OpenClawPluginHttpRouteMatch = "exact" | "prefix";
export type OpenClawPluginModule = { [key: string]: unknown };
export type OpenClawPluginToolContext = { [key: string]: unknown };
export type PluginCommandContext = { [key: string]: unknown };
export type PluginCommandResult = { [key: string]: unknown };
export type PluginConfigMigration = (config: unknown) =>
  | { config: unknown; changes: string[] }
  | null;
export type PluginConversationBindingRequestParams = { [key: string]: unknown };
export type PluginInteractiveHandlerResult = {
  handled?: boolean;
} | void;
export type PluginInteractiveHandlerRegistration = {
  channel: string;
  namespace: string;
  handler: (ctx: unknown) => Promise<PluginInteractiveHandlerResult> | PluginInteractiveHandlerResult;
};
export type PluginSetupAutoEnableProbe = (
  ctx: { config: unknown; env: NodeJS.ProcessEnv },
) => string | string[] | null | undefined;
export type PluginTextTransformRegistration = { [key: string]: unknown };
export type PluginTextTransforms = { [key: string]: unknown };
export type PluginWebFetchProviderEntry = { [key: string]: unknown };
export type PluginWebSearchProviderEntry = { [key: string]: unknown };
export type ProviderAuthContext = { [key: string]: unknown };
export type ProviderAuthMethod = {
  id: string;
  run: (ctx: ProviderAuthContext) => Promise<ProviderAuthResult>;
  [key: string]: unknown;
};
export type ProviderAuthMethodNonInteractiveContext = {
  authChoice: string;
  config: OpenClawConfig;
  baseConfig?: OpenClawConfig;
  opts: {
    customBaseUrl?: unknown;
    customModelId?: unknown;
    customApiKey?: unknown;
    token?: string;
    tokenProvider?: string;
    [key: string]: unknown;
  };
  runtime: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    exit: (code: number) => void;
  };
  agentDir?: string;
  workspaceDir?: string;
  resolveApiKey: (params: {
    provider: string;
    flagValue?: string;
    flagName: string;
    envVar: string;
    envVarName?: string;
    allowProfile?: boolean;
    required?: boolean;
  }) => Promise<ProviderNonInteractiveApiKeyResult | null>;
  toApiKeyCredential: (params: {
    provider: string;
    resolved: ProviderNonInteractiveApiKeyResult;
    email?: string;
    metadata?: Record<string, string>;
  }) => ApiKeyCredential | null;
};
export type ProviderAuthResult = {
  profiles: Array<{ profileId: string; credential: AuthProfileCredential }>;
  configPatch?: Partial<OpenClawConfig>;
  defaultModel?: string;
  notes?: string[];
  replaceDefaultModels?: boolean;
};
export type ProviderDiscoveryContext = {
  config: OpenClawConfig;
  agentDir?: string;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  resolveProviderApiKey: (providerId?: string) => {
    apiKey: string | undefined;
    discoveryApiKey?: string;
  };
  resolveProviderAuth?: (
    providerId?: string,
    options?: { oauthMarker?: string },
  ) => {
    apiKey: string | undefined;
    discoveryApiKey?: string;
    mode: 'api_key' | 'aws-sdk' | 'oauth' | 'token' | 'none';
    source: 'env' | 'profile' | 'none';
    profileId?: string;
  };
};
export type ProviderNonInteractiveApiKeyResult = {
  key: string;
  source: 'profile' | 'env' | 'flag';
  envVarName?: string;
};
export type ProviderPluginCatalog = {
  run: (ctx: unknown) => Promise<unknown>;
};
export type ProviderPlugin = {
  id: string;
  pluginId?: string;
  label?: string;
  aliases?: string[];
  auth: ProviderAuthMethod[];
  catalog?: ProviderPluginCatalog;
  staticCatalog?: ProviderPluginCatalog;
  [key: string]: unknown;
};
export type RealtimeTranscriptionProviderPlugin = { id: string; [key: string]: unknown };
export type RealtimeVoiceProviderPlugin = { id: string; [key: string]: unknown };
export type SpeechProviderPlugin = { id: string; [key: string]: unknown };
export type TranscriptSourceProvider = { id: string; [key: string]: unknown };
export type UnifiedModelCatalogProviderContext = { [key: string]: unknown };
export type UnifiedModelCatalogProviderPlugin = {
  provider: string;
  kinds: readonly UnifiedModelCatalogKind[];
  staticCatalog?: (
    ctx: UnifiedModelCatalogProviderContext,
  ) =>
    | readonly UnifiedModelCatalogEntry[]
    | Promise<readonly UnifiedModelCatalogEntry[] | null | undefined>
    | null
    | undefined;
  liveCatalog?: (
    ctx: UnifiedModelCatalogProviderContext,
  ) =>
    | readonly UnifiedModelCatalogEntry[]
    | Promise<readonly UnifiedModelCatalogEntry[] | null | undefined>
    | null
    | undefined;
};
export type VideoGenerationProviderPlugin = { id: string; [key: string]: unknown };
export type WebFetchProviderPlugin = { id: string; [key: string]: unknown };
export type WebSearchProviderPlugin = { id: string; [key: string]: unknown };

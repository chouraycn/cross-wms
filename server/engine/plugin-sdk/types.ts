/**
 * Plugin SDK 核心类型定义
 *
 * 参考 OpenClaw 的 plugin-sdk 设计，建立 cdf-know 自己的插件 SDK 抽象层。
 * 遵循四项核心原则：
 *   1. manifest-first — 发现、配置校验、setup 在元数据层完成，不导入运行时
 *   2. 控制面/运行面分离 — manifest 是控制面，register() 是运行面
 *   3. 窄入口 — 插件作者只通过 definePluginEntry() 暴露自身
 *   4. 能力注册优于 hook — 显式 register*() 比 hook 更易追溯
 *
 * 与 server/engine/pluginRegistry.ts（DB-backed 安装管理器）互补：
 *   - pluginRegistry.ts 负责"安装/启用/禁用/卸载"的物理生命周期
 *   - plugin-sdk 负责"能力声明/注册/激活/清理"的逻辑生命周期
 */

import type { AdapterCompatConfig } from '../../adapters/types.js';
import type { PluginManifest } from '../../../shared/pluginManifest.js';

// ===================== 能力类型 =====================

/** 能力种类 — 插件可注册的所有能力类型 */
export type PluginCapabilityKind =
  | 'tool'
  | 'provider'
  | 'embedding-provider'
  | 'memory-host'
  | 'channel'
  | 'hook'
  | 'command'
  | 'service';

/** 工具能力 — 工具函数 + 元数据 */
export interface PluginToolCapability {
  kind: 'tool';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  riskLevel?: 'auto' | 'confirm' | 'high-risk';
  /** 执行超时（毫秒），默认 30000 */
  timeoutMs?: number;
  /** 工具处理函数 */
  handler: (args: Record<string, unknown>, ctx?: PluginToolContext) => Promise<string>;
}

/** 工具执行上下文 */
export interface PluginToolContext {
  pluginId: string;
  sessionId?: string;
  abortSignal?: AbortSignal;
}

/** Provider 能力 — 模型提供商声明 */
export interface PluginProviderCapability {
  kind: 'provider';
  /** Provider 唯一 ID（如 'anthropic', 'openai', 'deepseek'） */
  id: string;
  /** 显示名 */
  displayName: string;
  /** API 类型 */
  apiType: 'openai-chat' | 'openai-completions' | 'anthropic-messages' | 'google-generative-ai';
  /** 能力开关声明（复用 AdapterCompatConfig） */
  compat?: Partial<AdapterCompatConfig>;
  /** 默认 endpoint */
  defaultEndpoint?: string;
  /** 环境变量名（用于读取 API Key） */
  apiKeyEnvVar?: string;
  /** 是否需要 OAuth 登录 */
  requiresOAuth?: boolean;
}

/** Embedding Provider 能力 */
export interface PluginEmbeddingProviderCapability {
  kind: 'embedding-provider';
  id: string;
  displayName: string;
  /** 模型名 */
  modelName: string;
  /** 向量维度 */
  dimensions: number;
  /** 最大输入字符数 */
  maxInputChars?: number;
  /** 支持批量 */
  supportsBatch?: boolean;
  /** 工厂函数 */
  factory: (config: Record<string, unknown>) => Promise<PluginEmbeddingRuntime>;
}

/** Embedding 运行时接口 */
export interface PluginEmbeddingRuntime {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  dispose(): Promise<void>;
}

/** Memory Host 能力 */
export interface PluginMemoryHostCapability {
  kind: 'memory-host';
  id: string;
  displayName: string;
  description?: string;
  /** 工厂函数，返回 BaseMemoryHost 实现 */
  factory: () => PluginMemoryHostRuntime;
  /** 是否设为默认 */
  isDefault?: boolean;
  /** 优先级（数字越大优先级越高） */
  priority?: number;
}

/** Memory Host 运行时接口（与 BaseMemoryHost 对齐） */
export interface PluginMemoryHostRuntime {
  init(): Promise<void>;
  add(entry: Omit<PluginMemoryEntry, 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt' | 'sizeBytes'>): Promise<PluginMemoryEntry>;
  addBatch(entries: Array<Omit<PluginMemoryEntry, 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt' | 'sizeBytes'>>): Promise<PluginMemoryEntry[]>;
  get(id: string): Promise<PluginMemoryEntry | null>;
  update(id: string, updates: Partial<Pick<PluginMemoryEntry, 'content' | 'metadata' | 'importanceScore'>>): Promise<PluginMemoryEntry | null>;
  delete(id: string): Promise<boolean>;
  search(query: string, options?: Partial<PluginMemorySearchOptions>): Promise<PluginMemorySearchResult[]>;
  listBySession(sessionId: string, limit?: number, offset?: number): Promise<PluginMemoryEntry[]>;
  deleteBySession(sessionId: string): Promise<number>;
  getStats(): Promise<PluginMemoryHostStats>;
  cleanup(options?: { maxAgeMs?: number; maxEntries?: number; strategy?: 'lru' | 'fifo' | 'importance' }): Promise<{ removed: number; freedBytes: number }>;
  dispose(): Promise<void>;
  isReady(): boolean;
}

/** Memory 条目（与 memory-host/types.ts 对齐） */
export interface PluginMemoryEntry {
  id: string;
  sessionId: string;
  content: string;
  embedding?: Float32Array;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt: number;
  sizeBytes: number;
  importanceScore?: number;
}

export interface PluginMemorySearchOptions {
  query?: string;
  topK?: number;
  minScore?: number;
  filter?: Record<string, unknown>;
  timeRange?: { from?: number; to?: number };
  hybridWeights?: { vector: number; text: number };
  mmr?: { enabled: boolean; lambda: number };
}

export interface PluginMemorySearchResult {
  entry: PluginMemoryEntry;
  score: number;
  rank: number;
}

export interface PluginMemoryHostStats {
  totalEntries: number;
  totalBytes: number;
  sessionCount: number;
  totalSearches: number;
  cacheHits: number;
  cacheMisses: number;
  avgSearchTimeMs: number;
}

/** Channel 能力 — 通信通道 */
export interface PluginChannelCapability {
  kind: 'channel';
  id: string;
  displayName: string;
  /** 通道类型 */
  channelType: 'im' | 'webhook' | 'email' | 'sms' | 'cli';
  /** 是否支持双向通信 */
  bidirectional?: boolean;
  /** 是否支持流式回复 */
  supportsStreaming?: boolean;
  /** 入站消息处理 */
  handleInbound?: (message: PluginChannelMessage) => Promise<PluginChannelReply | null>;
  /** 出站消息发送 */
  send?: (target: string, message: PluginChannelMessage) => Promise<PluginChannelSendResult>;
}

export interface PluginChannelMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName?: string;
  content: string;
  contentType?: 'text' | 'markdown' | 'json';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PluginChannelReply {
  content: string;
  contentType?: 'text' | 'markdown' | 'json';
  replyToId?: string;
}

export interface PluginChannelSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** Hook 能力 — 事件钩子 */
export interface PluginHookCapability {
  kind: 'hook';
  /** Hook 事件名（如 'agent.before-turn', 'agent.after-turn', 'tool.before-call'） */
  event: string;
  /** 处理函数 */
  handler: (payload: unknown, ctx?: PluginHookContext) => Promise<PluginHookResult | void>;
  /** 优先级（数字越大越先执行） */
  priority?: number;
}

export interface PluginHookContext {
  pluginId: string;
  sessionId?: string;
}

export interface PluginHookResult {
  /** 是否阻止后续 hook 执行 */
  stopPropagation?: boolean;
  /** 修改后的 payload（用于链式处理） */
  mutatedPayload?: unknown;
}

/** Command 能力 — 斜杠命令 */
export interface PluginCommandCapability {
  kind: 'command';
  /** 命令名（不含 /，如 'memory', 'agent'） */
  name: string;
  /** 命令描述 */
  description: string;
  /** 用法示例 */
  usage?: string;
  /** 处理函数 */
  handler: (args: string[], ctx?: PluginCommandContext) => Promise<string>;
}

export interface PluginCommandContext {
  pluginId: string;
  sessionId?: string;
}

/** Service 能力 — 长期运行服务 */
export interface PluginServiceCapability {
  kind: 'service';
  id: string;
  displayName: string;
  /** 启动服务 */
  start: (ctx?: PluginServiceContext) => Promise<void>;
  /** 停止服务 */
  stop?: (ctx?: PluginServiceContext) => Promise<void>;
  /** 健康检查 */
  healthCheck?: () => Promise<{ healthy: boolean; details?: string }>;
}

export interface PluginServiceContext {
  pluginId: string;
}

/** 所有能力类型的联合 */
export type PluginCapability =
  | PluginToolCapability
  | PluginProviderCapability
  | PluginEmbeddingProviderCapability
  | PluginMemoryHostCapability
  | PluginChannelCapability
  | PluginHookCapability
  | PluginCommandCapability
  | PluginServiceCapability;

// ===================== 插件定义与清单 =====================

/** 注册模式 — 控制 plugin 在不同阶段如何被发现和加载 */
export type RegistrationMode =
  | 'full'              // 完整加载：发现 + 注册所有能力 + 激活
  | 'discovery'         // 仅发现：只读取 manifest，不调用 register()
  | 'tool-discovery'    // 工具发现：注册工具元数据但不激活 handler
  | 'setup-only'        // 仅 setup：执行 setup() 后即卸载
  | 'cli-metadata';     // CLI 元数据：仅暴露 CLI 元信息

/** 插件配置 Schema 字段定义 */
export interface PluginConfigSchemaField {
  /** 字段键名 */
  key: string;
  /** 字段类型 */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** 显示名 */
  label?: string;
  /** 描述 */
  description?: string;
  /** 默认值 */
  default?: unknown;
  /** 是否必填 */
  required?: boolean;
  /** 枚举可选值 */
  enum?: unknown[];
  /** 嵌套字段（type=object 时使用） */
  properties?: PluginConfigSchemaField[];
}

/** 插件配置 Schema */
export interface PluginConfigSchema {
  /** Schema 版本 */
  version?: string;
  /** 字段列表 */
  fields: PluginConfigSchemaField[];
}

/** 空配置 Schema */
export const emptyPluginConfigSchema: PluginConfigSchema = { fields: [] };

// ===================== 插件运行时生命周期 =====================

/** 插件运行时生命周期注册 */
export interface PluginRuntimeLifecycleRegistration {
  /** 插件激活后调用 */
  onActivate?: (ctx: PluginLifecycleContext) => Promise<void> | void;
  /** 插件停用前调用 */
  onDeactivate?: (ctx: PluginLifecycleContext) => Promise<void> | void;
  /** 插件清理时调用（卸载或进程退出） */
  onCleanup?: (ctx: PluginLifecycleContext) => Promise<void> | void;
  /** 插件重载时调用 */
  onReload?: (ctx: PluginLifecycleContext) => Promise<void> | void;
}

export interface PluginLifecycleContext {
  pluginId: string;
  config: Record<string, unknown>;
}

/** 插件运行时状态 */
export type PluginRuntimeStatus =
  | 'discovered'    // 已发现（manifest 已加载）
  | 'registered'    // 已注册（register() 已执行）
  | 'activated'     // 已激活（onActivate 已执行）
  | 'deactivated'   // 已停用
  | 'error'         // 错误
  | 'unloaded';     // 已卸载

// ===================== 插件 API 与定义 =====================

/**
 * 插件 API — 暴露给插件 register() 函数的能力注册接口
 *
 * 设计参考 OpenClaw 的 OpenClawPluginApi，提供 30+ register* 方法。
 * cdf-know 首批实现 8 个核心 register* 方法，覆盖 8 种能力类型。
 */
export interface PluginApi {
  /** 插件 ID（只读） */
  readonly pluginId: string;

  /** 注册工具 */
  registerTool(cap: PluginToolCapability): void;

  /** 注册模型 Provider */
  registerProvider(cap: PluginProviderCapability): void;

  /** 注册 Embedding Provider */
  registerEmbeddingProvider(cap: PluginEmbeddingProviderCapability): void;

  /** 注册 Memory Host */
  registerMemoryHost(cap: PluginMemoryHostCapability): void;

  /** 注册通信通道 */
  registerChannel(cap: PluginChannelCapability): void;

  /** 注册事件钩子 */
  registerHook(cap: PluginHookCapability): void;

  /** 注册斜杠命令 */
  registerCommand(cap: PluginCommandCapability): void;

  /** 注册长期运行服务 */
  registerService(cap: PluginServiceCapability): void;

  /** 注册运行时生命周期 */
  registerLifecycle(lifecycle: PluginRuntimeLifecycleRegistration): void;

  /** 获取插件配置（用户在设置面板配置的值） */
  getConfig(): Record<string, unknown>;

  /** 获取插件配置 Schema */
  getConfigSchema(): PluginConfigSchema;

  /** 日志（写入插件专属日志通道） */
  log: PluginLogger;
}

/** 插件日志接口 */
export interface PluginLogger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

/**
 * 插件定义 — definePluginEntry() 返回的标准化结构
 */
export interface PluginDefinition {
  /** 插件 ID */
  id: string;
  /** 显示名 */
  name: string;
  /** 描述 */
  description: string;
  /** 配置 Schema */
  configSchema: PluginConfigSchema;
  /** 注册模式（默认 'full'） */
  registrationMode?: RegistrationMode;
  /** 能力注册函数 */
  register: (api: PluginApi) => void | Promise<void>;
  /** 可选：setup 钩子（在 manifest 校验后、register 前执行） */
  setup?: (ctx: PluginLifecycleContext) => Promise<void> | void;
}

/**
 * 扩展的插件清单 — 在原有 PluginManifest 基础上增加 SDK 字段
 *
 * 注意：这是 Plugin SDK 使用的扩展清单，向后兼容 shared/pluginManifest.ts 的 PluginManifest。
 * 原有 manifest 的 tools/triggers/permissions 字段保留，新增 capabilities 声明字段。
 */
export interface ExtendedPluginManifest extends PluginManifest {
  /** SDK 版本 */
  sdkVersion?: string;
  /** 注册模式 */
  registrationMode?: RegistrationMode;
  /** 声明的能力种类列表（用于 manifest-first 发现） */
  declaredCapabilities?: PluginCapabilityKind[];
  /** 配置 Schema */
  configSchema?: PluginConfigSchema;
  /** 是否需要 setup 阶段 */
  requiresSetup?: boolean;
}

// ===================== 插件运行时实例 =====================

/** 插件运行时实例 — 注册中心中保存的插件运行时状态 */
export interface PluginRuntime {
  /** 插件定义 */
  definition: PluginDefinition;
  /** 已注册的能力列表 */
  capabilities: PluginCapability[];
  /** 生命周期注册 */
  lifecycle?: PluginRuntimeLifecycleRegistration;
  /** 当前状态 */
  status: PluginRuntimeStatus;
  /** 配置值 */
  config: Record<string, unknown>;
  /** 最后激活时间 */
  activatedAt?: number;
  /** 错误信息 */
  error?: string;
}

/** 插件注册中心统计 */
export interface PluginRegistryStats {
  total: number;
  discovered: number;
  registered: number;
  activated: number;
  deactivated: number;
  error: number;
  capabilitiesByKind: Record<PluginCapabilityKind, number>;
}

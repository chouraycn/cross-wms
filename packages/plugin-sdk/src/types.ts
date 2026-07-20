export type PluginType =
  | 'tool'
  | 'agent'
  | 'hook'
  | 'ui'
  | 'api'
  | 'integration'
  | 'memory'
  | 'channel'
  | 'provider'
  | 'skill'
  | 'embedding'
  | 'compaction';

export type PluginStatus =
  | 'installed'
  | 'enabled'
  | 'disabled'
  | 'error'
  | 'loading'
  | 'uninstalling';

export type PluginHookType =
  | 'before_chat'
  | 'after_chat'
  | 'before_tool_call'
  | 'after_tool_call'
  | 'message_received'
  | 'message_sent'
  | 'session_created'
  | 'session_closed'
  | 'memory_inserted'
  | 'memory_searched'
  | 'skill_triggered'
  | 'plugin_loaded'
  | 'plugin_unloaded';

export type PluginCapabilityKind =
  | 'tool'
  | 'provider'
  | 'embedding-provider'
  | 'memory-host'
  | 'channel'
  | 'hook'
  | 'command'
  | 'service'
  | 'audio-provider'
  | 'image-generation'
  | 'video-generation'
  | 'web-search'
  | 'security-provider'
  | 'api-integration';

export interface PluginToolCapability {
  kind: 'tool';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  riskLevel?: 'auto' | 'confirm' | 'high-risk';
  timeoutMs?: number;
  handler: (args: Record<string, unknown>, ctx?: PluginToolContext) => Promise<string>;
}

export interface PluginToolContext {
  pluginId: string;
  sessionId?: string;
  abortSignal?: AbortSignal;
}

export interface AdapterCompatConfig {
  streaming?: boolean;
  tools?: boolean;
  parallelToolCalls?: boolean;
  jsonMode?: boolean;
  vision?: boolean;
  functionCalling?: boolean;
}

/** Provider auth method definition used in plugin registration. */
export interface ProviderAuthMethodDefinition {
  methodId?: string;
  label?: string;
  hint?: string;
  [key: string]: unknown;
}

/** Model catalog provider registration. */
export interface ModelCatalogProviderRegistration {
  id?: string;
  run?: (ctx: unknown) => Promise<unknown>;
  order?: string;
  provider?: string;
  kinds?: string[];
  liveCatalog?: (ctx: unknown) => Promise<unknown[]>;
  staticCatalog?: (ctx: unknown) => Promise<unknown[]>;
  [key: string]: unknown;
}

export interface PluginProviderCapability {
  kind: 'provider';
  id: string;
  displayName: string;
  apiType: 'openai-chat' | 'openai-completions' | 'anthropic-messages' | 'google-generative-ai';
  compat?: Partial<AdapterCompatConfig>;
  defaultEndpoint?: string;
  apiKeyEnvVar?: string;
  requiresOAuth?: boolean;
  auth?: ProviderAuthMethodDefinition[];
  /** Provider registration extra fields from plugin entry helpers. */
  label?: string;
  docsPath?: string;
  aliases?: string[];
  envVars?: string[];
  catalog?: unknown;
  staticCatalog?: unknown;
}

export interface PluginEmbeddingProviderCapability {
  kind: 'embedding-provider';
  id: string;
  displayName: string;
  modelName: string;
  dimensions: number;
  maxInputChars?: number;
  supportsBatch?: boolean;
  factory: (config: Record<string, unknown>) => Promise<PluginEmbeddingRuntime>;
}

export interface PluginEmbeddingRuntime {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  dispose(): Promise<void>;
}

export interface PluginMemoryHostCapability {
  kind: 'memory-host';
  id: string;
  displayName: string;
  description?: string;
  factory: () => PluginMemoryHostRuntime;
  isDefault?: boolean;
  priority?: number;
}

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

export interface PluginChannelCapability {
  kind: 'channel';
  id: string;
  displayName: string;
  channelType: 'im' | 'webhook' | 'email' | 'sms' | 'cli';
  bidirectional?: boolean;
  supportsStreaming?: boolean;
  handleInbound?: (message: PluginChannelMessage) => Promise<PluginChannelReply | null>;
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

export interface PluginHookCapability {
  kind: 'hook';
  event: string;
  handler: (payload: unknown, ctx?: PluginHookContext) => Promise<PluginHookResult | void>;
  priority?: number;
}

export interface PluginHookContext {
  pluginId: string;
  sessionId?: string;
}

export interface PluginHookResult {
  stopPropagation?: boolean;
  mutatedPayload?: unknown;
}

export interface PluginCommandCapability {
  kind: 'command';
  name: string;
  description: string;
  usage?: string;
  handler: (args: string[], ctx?: PluginCommandContext) => Promise<string>;
}

export interface PluginCommandContext {
  pluginId: string;
  sessionId?: string;
}

export interface PluginServiceCapability {
  kind: 'service';
  id: string;
  displayName: string;
  start: (ctx?: PluginServiceContext) => Promise<void>;
  stop?: (ctx?: PluginServiceContext) => Promise<void>;
  healthCheck?: () => Promise<{ healthy: boolean; details?: string }>;
}

export interface PluginServiceContext {
  pluginId: string;
}

export interface PluginAudioProviderCapability {
  kind: 'audio-provider';
  id: string;
  displayName: string;
  supportedFormats: string[];
  supportsStreaming?: boolean;
  synthesizeSpeech: (text: string, options?: { voice?: string; rate?: number; pitch?: number }) => Promise<Buffer>;
  recognizeSpeech?: (audio: Buffer, options?: { language?: string }) => Promise<string>;
}

export interface PluginImageGenerationCapability {
  kind: 'image-generation';
  id: string;
  displayName: string;
  supportedModels: string[];
  supportsAspectRatios?: string[];
  generateImage: (prompt: string, options?: { model?: string; width?: number; height?: number; style?: string }) => Promise<{ url?: string; data?: string; error?: string }>;
}

export interface PluginVideoGenerationCapability {
  kind: 'video-generation';
  id: string;
  displayName: string;
  supportedModels: string[];
  generateVideo: (prompt: string, options?: { model?: string; duration?: number; resolution?: string }) => Promise<{ url?: string; error?: string }>;
}

export interface PluginWebSearchCapability {
  kind: 'web-search';
  id: string;
  displayName: string;
  search: (query: string, options?: { maxResults?: number; language?: string; timeRange?: string }) => Promise<Array<{ title: string; url: string; snippet: string; thumbnail?: string }>>;
}

export interface PluginSecurityProviderCapability {
  kind: 'security-provider';
  id: string;
  displayName: string;
  scanContent?: (content: string) => Promise<{ safe: boolean; threats?: Array<{ type: string; severity: 'low' | 'medium' | 'high'; message: string }> }>;
  sanitizeContent?: (content: string) => Promise<string>;
  validateUrl?: (url: string) => Promise<{ safe: boolean; reason?: string }>;
}

export interface PluginApiIntegrationCapability {
  kind: 'api-integration';
  id: string;
  displayName: string;
  baseUrl: string;
  authType?: 'none' | 'api-key' | 'oauth' | 'basic';
  endpoints: Array<{
    name: string;
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    description?: string;
    parameters?: Record<string, { type: string; required?: boolean; description?: string }>;
  }>;
  invoke: (endpointName: string, params?: Record<string, unknown>) => Promise<unknown>;
}

export type PluginCapability =
  | PluginToolCapability
  | PluginProviderCapability
  | PluginEmbeddingProviderCapability
  | PluginMemoryHostCapability
  | PluginChannelCapability
  | PluginHookCapability
  | PluginCommandCapability
  | PluginServiceCapability
  | PluginAudioProviderCapability
  | PluginImageGenerationCapability
  | PluginVideoGenerationCapability
  | PluginWebSearchCapability
  | PluginSecurityProviderCapability
  | PluginApiIntegrationCapability;

export type RegistrationMode =
  | 'full'
  | 'discovery'
  | 'tool-discovery'
  | 'setup-only'
  | 'cli-metadata';

export interface PluginConfigSchemaField {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  label?: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  enum?: unknown[];
  properties?: PluginConfigSchemaField[];
}

export interface PluginConfigSchema {
  version?: string;
  fields: PluginConfigSchemaField[];
}

export const emptyPluginConfigSchema: PluginConfigSchema = { fields: [] };

export interface PluginRuntimeLifecycleRegistration {
  onActivate?: (ctx: PluginLifecycleContext) => Promise<void> | void;
  onDeactivate?: (ctx: PluginLifecycleContext) => Promise<void> | void;
  onCleanup?: (ctx: PluginLifecycleContext) => Promise<void> | void;
  onReload?: (ctx: PluginLifecycleContext) => Promise<void> | void;
}

export interface PluginLifecycleContext {
  pluginId: string;
  config: Record<string, unknown>;
}

export type PluginRuntimeStatus =
  | 'discovered'
  | 'registered'
  | 'activated'
  | 'deactivated'
  | 'error'
  | 'unloaded';

export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  kind?: string;
  configSchema: PluginConfigSchema;
  registrationMode?: RegistrationMode;
  register: (api: PluginApi) => void | Promise<void>;
  setup?: (ctx: PluginLifecycleContext) => Promise<void> | void;
}

export type PluginManifestModelSupport = {
  supports: string[];
  excludes?: string[];
};

export type PluginManifestModelCatalog = {
  models: Array<{
    id: string;
    name?: string;
    provider?: string;
    capabilities?: string[];
  }>;
};

export type PluginManifestActivation = {
  requiresSetup?: boolean;
  setupEntry?: string;
  deferFullRuntime?: boolean;
};

export type PluginManifestSetup = {
  cliBackends?: string[];
};

export type PluginManifestContracts = {
  requires?: string[];
  provides?: string[];
};

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  kind?: PluginCapabilityKind | PluginCapabilityKind[];
  channels?: string[];
  providers?: string[];
  requiresPlugins?: string[];
  enabledByDefault?: boolean;
  configSchema?: Record<string, unknown>;
  entry: string;
  dependencies?: string[];
  permissions?: string[];
  keywords?: string[];
  homepage?: string;
  repository?: string;
  license?: string;
  minAppVersion?: string;
  modelSupport?: PluginManifestModelSupport;
  modelCatalog?: PluginManifestModelCatalog;
  activation?: PluginManifestActivation;
  setup?: PluginManifestSetup;
  contracts?: PluginManifestContracts;
  sdkVersion?: string;
  registrationMode?: RegistrationMode;
  declaredCapabilities?: PluginCapabilityKind[];
}

export interface ExtendedPluginManifest extends Omit<PluginManifest, 'configSchema'> {
  sdkVersion?: string;
  registrationMode?: RegistrationMode;
  declaredCapabilities?: PluginCapabilityKind[];
  configSchema?: PluginConfigSchema;
  requiresSetup?: boolean;
}

export interface PluginRuntime {
  definition: PluginDefinition;
  capabilities: PluginCapability[];
  lifecycle?: PluginRuntimeLifecycleRegistration;
  status: PluginRuntimeStatus;
  config: Record<string, unknown>;
  activatedAt?: number;
  error?: string;
}

export interface PluginRegistryStats {
  total: number;
  discovered: number;
  registered: number;
  activated: number;
  deactivated: number;
  error: number;
  capabilitiesByKind: Record<PluginCapabilityKind, number>;
}

export interface PluginApi {
  readonly pluginId: string;
  registerTool(cap: PluginToolCapability): void;
  unregisterTool(name: string): void;
  registerHook(cap: PluginHookCapability): void;
  unregisterHook(hookType: PluginHookType, handler: HookHandler): void;
  registerContract(contract: PluginContract): void;
  registerProvider(cap: PluginProviderCapability): void;
  registerModelCatalogProvider(provider: ModelCatalogProviderRegistration): void;
  registerMemoryHost(cap: PluginMemoryHostCapability): void;
  registerChannel(cap: PluginChannelCapability): void;
  registerCommand(cap: PluginCommandCapability): void;
  registerService(cap: PluginServiceCapability): void;
  registerEmbeddingProvider(cap: PluginEmbeddingProviderCapability): void;
  registerAudioProvider(cap: PluginAudioProviderCapability): void;
  registerImageGeneration(cap: PluginImageGenerationCapability): void;
  registerVideoGeneration(cap: PluginVideoGenerationCapability): void;
  registerWebSearch(cap: PluginWebSearchCapability): void;
  registerSecurityProvider(cap: PluginSecurityProviderCapability): void;
  registerApiIntegration(cap: PluginApiIntegrationCapability): void;
  registerCompactionProvider(provider: CompactionProviderRegistration): void;
  registerLifecycle(lifecycle: PluginRuntimeLifecycleRegistration): void;
  getConfig(): Record<string, unknown>;
  getConfigSchema(): PluginConfigSchema;
  log: PluginLogger;
}

export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface PluginContract {
  id: string;
  name: string;
  version: string;
  description?: string;
  methods: ContractMethod[];
  events?: string[];
}

export interface ContractMethod {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  returns?: string;
}

export interface ProviderRegistration {
  type: 'llm' | 'embedding' | 'tts' | 'stt' | 'image' | 'video';
  id: string;
  name: string;
  models: string[];
  capabilities?: string[];
  stream?: boolean;
}

export interface MemoryBackendRegistration {
  type: string;
  name: string;
  version: string;
  capabilities: string[];
  factory: (config: Record<string, unknown>) => unknown;
}

export interface ChannelPluginRegistration {
  type: string;
  name: string;
  version: string;
  capabilities: string[];
  factory: (config: Record<string, unknown>) => unknown;
}

export interface SkillRegistration {
  id: string;
  name: string;
  description?: string;
  version: string;
  trigger?: string;
  handler: (params: Record<string, unknown>, context: unknown) => Promise<unknown>;
}

export interface EmbeddingProviderRegistration {
  id: string;
  name: string;
  models: string[];
  factory: (config: Record<string, unknown>) => unknown;
}

export interface CompactionProviderRegistration {
  id: string;
  name: string;
  version: string;
  factory: (config: Record<string, unknown>) => unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: ToolHandler;
  category?: string;
  tags?: string[];
}

export type ToolHandler = (
  params: Record<string, unknown>,
  context: ToolContext,
) => Promise<unknown>;

export interface ToolContext {
  sessionId: string;
  userId?: string;
  agentId?: string;
  pluginId: string;
}

export type HookHandler = (context: HookContext) => Promise<HookResult> | HookResult;

export interface HookContext {
  type: PluginHookType;
  data: Record<string, unknown>;
  pluginId: string;
  timestamp: number;
}

export interface HookResult {
  modified?: Record<string, unknown>;
  cancel?: boolean;
  error?: string;
}

export interface PluginInstance {
  manifest: PluginManifest;
  status: PluginStatus;
  installedAt: number;
  enabledAt?: number;
  disabledAt?: number;
  errorMessage?: string;
  loadDurationMs?: number;
  activated: boolean;
  exports?: Record<string, unknown>;
  config?: Record<string, unknown>;
  sourceId?: string;
  version: string;
}

export interface PluginActivationContext {
  pluginId: string;
  manifest: PluginManifest;
  config: Record<string, unknown>;
  logger: PluginLogger;
  api: PluginApi;
}

export type PluginSlotKey = 'memory' | 'contextEngine';

export type HookFailurePolicy = 'fail-open' | 'fail-closed';

export interface HookRunOptions {
  catchErrors?: boolean;
  failurePolicyByHook?: Partial<Record<string, HookFailurePolicy>>;
  voidHookTimeoutMsByHook?: Partial<Record<string, number>>;
  modifyingHookTimeoutMsByHook?: Partial<Record<string, number>>;
}

export type HookRunnerLogger = {
  debug?: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

// ==================== Channel Runtime Types ====================

/**
 * 频道状态
 */
export type ChannelState = 'creating' | 'active' | 'paused' | 'error' | 'destroyed';

/**
 * 频道配置
 */
export interface ChannelConfig {
  id: string;
  type: 'im' | 'webhook' | 'email' | 'sms' | 'cli';
  displayName?: string;
  metadata?: Record<string, unknown>;
  supports?: ChannelSupports;
}

/**
 * 频道能力支持
 */
export interface ChannelSupports {
  typing?: boolean;
  pairing?: boolean;
  reply?: boolean;
  websocket?: boolean;
}

/**
 * 频道实例
 */
export interface Channel {
  id: string;
  type: ChannelConfig['type'];
  state: ChannelState;
  config: ChannelConfig;
  sendMessage(content: string, metadata?: Record<string, unknown>): Promise<void>;
  getState(): ChannelState;
  destroy(): Promise<void>;
}

// ==================== Approval Runtime Types ====================

/**
 * 审批策略
 */
export interface ApprovalPolicy {
  mode: 'auto' | 'manual' | 'interactive';
  autoApprove?: string[];
  autoReject?: string[];
  requireConfirmation?: string[];
  timeout?: number;
}

/**
 * 审批结果
 */
export interface ApprovalResult {
  approved: boolean;
  reason?: string;
  timestamp: number;
  approver?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 审批请求
 */
export interface ApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  requester?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  action: 'request' | 'approve' | 'reject' | 'timeout' | 'override';
  toolName: string;
  args?: Record<string, unknown>;
  result?: ApprovalResult;
  actor?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 审计日志记录器
 */
export interface AuditLogger {
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void;
  getEntries(filter?: { toolName?: string; from?: number; to?: number }): AuditLogEntry[];
  clear(): void;
}

// ==================== Memory Core Types ====================

/**
 * 内存条目
 */
export interface MemoryEntry {
  id: string;
  content: string;
  type?: 'fact' | 'event' | 'preference' | 'context' | 'custom';
  importance?: number;
  embedding?: Float32Array;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

/**
 * 内存查询
 */
export interface MemoryQuery {
  text?: string;
  type?: MemoryEntry['type'];
  ids?: string[];
  metadata?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  minImportance?: number;
  timeRange?: { from?: number; to?: number };
}

// ==================== Provider Stream Types ====================

/**
 * 使用量统计
 */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
}

/**
 * 流式消息
 */
export interface StreamMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  name?: string;
}

/**
 * 流式配置
 */
export interface StreamConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * 流式块
 */
export interface StreamChunk {
  type: 'text' | 'tool_use' | 'error' | 'done';
  content?: string;
  toolUse?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  error?: string;
  usage?: Partial<Usage>;
}

// ==================== Reply Pipeline Types ====================

/**
 * 回复消息
 */
export interface ReplyMessage {
  id: string;
  content: string;
  role: 'assistant' | 'system';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * 回复结果
 */
export interface Reply {
  id: string;
  message: ReplyMessage;
  stages: string[];
  processingTime: number;
  metadata?: Record<string, unknown>;
}

/**
 * 处理阶段
 */
export interface PipelineStage {
  id: string;
  name: string;
  priority?: number;
  enabled?: boolean;
  process(message: ReplyMessage, context?: PipelineContext): Promise<ReplyMessage>;
}

/**
 * 流水线上下文
 */
export interface PipelineContext {
  sessionId?: string;
  userId?: string;
  pluginId?: string;
  metadata?: Record<string, unknown>;
}

// ==================== Secret Provider Types ====================

/**
 * 密钥配置
 */
export interface SecretConfig {
  key: string;
  value: string;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
  rotationPolicy?: {
    enabled: boolean;
    interval?: number;
    algorithm?: 'random' | 'incremental';
  };
}

/**
 * 密钥状态
 */
export interface SecretStatus {
  key: string;
  exists: boolean;
  expiresAt?: number;
  lastRotated?: number;
  lastAccessed?: number;
}

// ==================== Security Context Types ====================

/**
 * 权限定义
 */
export interface Permission {
  action: string;
  resource?: string;
  conditions?: Record<string, unknown>;
}

/**
 * 安全策略
 */
export interface SecurityPolicy {
  permissions: Permission[];
  restrictions?: string[];
  sandbox?: boolean;
  auditLevel?: 'none' | 'basic' | 'detailed';
}

/**
 * 安全上下文配置
 */
export interface SecurityContextConfig {
  policy: SecurityPolicy;
  identity?: {
    userId?: string;
    roles?: string[];
    groups?: string[];
  };
  metadata?: Record<string, unknown>;
}
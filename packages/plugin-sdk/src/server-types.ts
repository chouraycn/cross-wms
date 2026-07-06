export type PluginCapabilityKind =
  | 'tool'
  | 'provider'
  | 'embedding-provider'
  | 'memory-host'
  | 'channel'
  | 'hook'
  | 'command'
  | 'service';

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

export interface PluginProviderCapability {
  kind: 'provider';
  id: string;
  displayName: string;
  apiType: 'openai-chat' | 'openai-completions' | 'anthropic-messages' | 'google-generative-ai';
  defaultEndpoint?: string;
  apiKeyEnvVar?: string;
  requiresOAuth?: boolean;
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

export type PluginCapability =
  | PluginToolCapability
  | PluginProviderCapability
  | PluginEmbeddingProviderCapability
  | PluginMemoryHostCapability
  | PluginChannelCapability
  | PluginHookCapability
  | PluginCommandCapability
  | PluginServiceCapability;

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

export interface PluginApi {
  readonly pluginId: string;
  registerTool(cap: PluginToolCapability): void;
  registerProvider(cap: PluginProviderCapability): void;
  registerEmbeddingProvider(cap: PluginEmbeddingProviderCapability): void;
  registerMemoryHost(cap: PluginMemoryHostCapability): void;
  registerChannel(cap: PluginChannelCapability): void;
  registerHook(cap: PluginHookCapability): void;
  registerCommand(cap: PluginCommandCapability): void;
  registerService(cap: PluginServiceCapability): void;
  registerLifecycle(lifecycle: PluginRuntimeLifecycleRegistration): void;
  getConfig(): Record<string, unknown>;
  getConfigSchema(): PluginConfigSchema;
  log: PluginLogger;
}

export interface PluginLogger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  configSchema: PluginConfigSchema;
  registrationMode?: RegistrationMode;
  register: (api: PluginApi) => void | Promise<void>;
  setup?: (ctx: PluginLifecycleContext) => Promise<void> | void;
}

export interface ExtendedPluginManifest extends PluginManifest {
  sdkVersion?: string;
  registrationMode?: RegistrationMode;
  declaredCapabilities?: PluginCapabilityKind[];
  configSchema?: PluginConfigSchema;
  requiresSetup?: boolean;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  type?: string;
  entry?: string;
  dependencies?: string[];
  permissions?: string[];
  hooks?: string[];
  tools?: string[];
  triggers?: string[];
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
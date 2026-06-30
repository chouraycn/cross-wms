export interface AgentMessage {
  id?: string;
  role: string;
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: unknown[];
  isError?: boolean;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export interface ContextEngineStats {
  totalMessages: number;
  totalTokens: number;
  systemMessages: number;
  compactedCount: number;
  memoryItems: number;
  lastCompactTime?: number;
}

export type ContextEngineOperation = 'agent-run' | 'manual-compact' | 'subagent-spawn';

export type ContextEngineRuntimeMode = 'normal' | 'fallback' | 'degraded';

export type ContextEngineSelectionSource = 'configured' | 'default' | 'unknown';

export type ContextEngineRuntimeReasonCode =
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'context_overflow'
  | 'runtime_unavailable'
  | 'unknown';

export type ContextEngineHostCapability =
  | 'bootstrap'
  | 'assemble-before-prompt'
  | 'after-turn'
  | 'maintain'
  | 'compact'
  | 'runtime-llm-complete'
  | 'thread-bootstrap-projection'
  | 'memory-search'
  | 'embedding-provider';

export interface ContextEngineHostRequirements {
  requiredCapabilities: ContextEngineHostCapability[];
  unsupportedMessage?: string;
}

export type ContextEngineRuntimeSettings = {
  schemaVersion: 1;
  runtime: {
    host: string;
    mode: ContextEngineRuntimeMode;
    harnessId: string | null;
    runtimeId: string | null;
  };
  model: {
    requested: string | null;
    resolved: string | null;
    provider: string | null;
    family: string | null;
  };
  contextEngineSelection: {
    selectedId: string | null;
    source: ContextEngineSelectionSource;
  };
  executionHost: {
    id: string | null;
    label: string | null;
  };
  limits: {
    promptTokenBudget: number | null;
    maxOutputTokens: number | null;
  };
  diagnostics: {
    fallbackReason: ContextEngineRuntimeReasonCode | null;
    degradedReason: ContextEngineRuntimeReasonCode | null;
  };
};

export class ContextEngineRuntimeSettingsUnavailableError extends Error {
  readonly code = 'context_engine_runtime_settings_unavailable';
  constructor(message?: string) {
    super(message);
    this.name = 'ContextEngineRuntimeSettingsUnavailableError';
  }
}

export class ContextEngineRuntimeSettingsUnsupportedError extends Error {
  readonly code = 'context_engine_runtime_settings_unsupported';
  constructor(message?: string) {
    super(message);
    this.name = 'ContextEngineRuntimeSettingsUnsupportedError';
  }
}

export type AssembleResult = {
  messages: AgentMessage[];
  estimatedTokens: number;
  promptAuthority?: 'assembled' | 'preassembly_may_overflow';
  systemPromptAddition?: string;
  compactedCount?: number;
  memoryItemsUsed?: number;
  contextProjection?: ContextEngineProjection;
};

export type ContextEngineProjection = {
  mode: 'per_turn' | 'thread_bootstrap';
  epoch?: string;
  fingerprint?: string;
};

export type CompactResult = {
  ok: boolean;
  compacted: boolean;
  reason?: string;
  result?: {
    summary?: string;
    firstKeptEntryId?: string;
    tokensBefore: number;
    tokensAfter?: number;
    details?: unknown;
    sessionId?: string;
    sessionFile?: string;
  };
  didCompact?: boolean;
  messagesRemoved?: number;
  tokensSaved?: number;
  summaryLength?: number;
  strategy?: string;
};

export type IngestResult = {
  ingested: boolean;
  added?: number;
  skipped?: number;
  tokensAdded?: number;
};

export type IngestBatchResult = {
  ingestedCount: number;
  added?: number;
  skipped?: number;
  tokensAdded?: number;
};

export type BootstrapResult = {
  bootstrapped: boolean;
  importedMessages?: number;
  reason?: string;
};

export type ContextEngineInfo = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  ownsCompaction?: boolean;
  turnMaintenanceMode?: 'foreground' | 'background';
  hostRequirements?: Partial<Record<ContextEngineOperation, ContextEngineHostRequirements>>;
  defaultMemorySync?: MemorySyncOptions;
};

export type SubagentSpawnPreparation = {
  rollback: () => void | Promise<void>;
};

export type SubagentEndReason = 'deleted' | 'completed' | 'swept' | 'released';

export type TranscriptRewriteReplacement = {
  entryId: string;
  message: AgentMessage;
};

export type TranscriptRewriteRequest = {
  replacements: TranscriptRewriteReplacement[];
  allowedRewriteSuffixEntryIds?: string[];
};

export type TranscriptRewriteResult = {
  changed: boolean;
  bytesFreed: number;
  rewrittenEntries: number;
  reason?: string;
};

export type ContextEngineMaintenanceResult = TranscriptRewriteResult;

export type ContextEnginePromptCacheRetention = 'none' | 'short' | 'long' | 'in_memory' | '24h';

export type ContextEnginePromptCacheUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
};

export type ContextEnginePromptCacheObservationChangeCode =
  | 'cacheRetention'
  | 'model'
  | 'streamStrategy'
  | 'systemPrompt'
  | 'tools'
  | 'transport';

export type ContextEnginePromptCacheObservationChange = {
  code: ContextEnginePromptCacheObservationChangeCode;
  detail: string;
};

export type ContextEnginePromptCacheObservation = {
  broke: boolean;
  previousCacheRead?: number;
  cacheRead?: number;
  changes?: ContextEnginePromptCacheObservationChange[];
};

export type ContextEnginePromptCacheInfo = {
  retention?: ContextEnginePromptCacheRetention;
  lastCallUsage?: ContextEnginePromptCacheUsage;
  observation?: ContextEnginePromptCacheObservation;
  lastCacheTouchAt?: number;
  expiresAt?: number;
};

export interface MemorySearchResult {
  id: string;
  content: string;
  score: number;
  source?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
  searchDetails?: {
    vectorScore?: number;
    textScore?: number;
    timeDecayFactor?: number;
    mmrAdjustedScore?: number;
  };
}

export interface MemorySearchOptions {
  query: string;
  topK?: number;
  minScore?: number;
  maxAgeMs?: number;
  includeMetadata?: boolean;
  hybridWeight?: number;
  timeDecayFactor?: number;
  useMMR?: boolean;
  mmrDiversity?: number;
}

export interface MemorySyncOptions {
  strategy: 'on_turn' | 'on_search' | 'interval' | 'manual';
  intervalMs?: number;
  batchSize?: number;
}

export type ContextEngineRuntimeContext = Record<string, unknown> & {
  cwd?: string;
  modelId?: string;
  provider?: string;
  modelFamily?: string;
  allowDeferredCompactionExecution?: boolean;
  tokenBudget?: number;
  maxOutputTokens?: number;
  runtimeMode?: ContextEngineRuntimeMode;
  agentId?: string;
  agentHarnessId?: string;
  toolCount?: number;
  currentTokenCount?: number;
  fallbackReason?: ContextEngineRuntimeReasonCode;
  degradedReason?: ContextEngineRuntimeReasonCode;
  promptCache?: ContextEnginePromptCacheInfo;
  rewriteTranscriptEntries?: (
    request: TranscriptRewriteRequest,
  ) => Promise<TranscriptRewriteResult>;
  llm?: {
    complete: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  sessionFile?: string;
  sessionKey?: string;
  workspaceDir?: string;
};

export interface ContextEngineConfig {
  engineId: string;
  displayName: string;
  version: string;
  description?: string;
  defaultMemorySync?: MemorySyncOptions;
  hostRequirements?: Partial<Record<string, ContextEngineHostRequirements>>;
  turnMaintenanceMode?: 'foreground' | 'background';
  ownsCompaction?: boolean;
}

export interface ContextEngineSessionState {
  sessionId: string;
  agentId: string;
  createdAt: number;
  lastModified: number;
  messageCount: number;
  tokenCount: number;
  sessionKey?: string;
  sessionFile?: string;
}

export type ContextEngineHealthStatus = 'healthy' | 'degraded' | 'quarantined';

export interface ContextEngineHealthInfo {
  status: ContextEngineHealthStatus;
  failureCount: number;
  lastFailureAt?: number;
  lastFailureReason?: string;
  quarantinedUntil?: number;
  consecutiveSuccesses: number;
}

export interface ContextEngine {
  readonly info: ContextEngineInfo;
  readonly config: ContextEngineConfig;

  bootstrap?(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile?: string;
    initialMessages?: AgentMessage[];
    runtimeSettings?: ContextEngineRuntimeSettings;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<BootstrapResult>;

  maintain?(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile?: string;
    runtimeSettings?: ContextEngineRuntimeSettings;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<ContextEngineMaintenanceResult>;

  ingest(params: {
    sessionId: string;
    sessionKey?: string;
    message: AgentMessage;
    isHeartbeat?: boolean;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<IngestResult>;

  ingestBatch?(params: {
    sessionId: string;
    sessionKey?: string;
    messages: AgentMessage[];
    isHeartbeat?: boolean;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<IngestBatchResult>;

  afterTurn?(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile?: string;
    messages: AgentMessage[];
    prePromptMessageCount: number;
    autoCompactionSummary?: string;
    isHeartbeat?: boolean;
    tokenBudget?: number;
    runtimeSettings?: ContextEngineRuntimeSettings;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<void>;

  assemble(params: {
    sessionId: string;
    sessionKey?: string;
    messages: AgentMessage[];
    tokenBudget?: number;
    availableTools?: Set<string>;
    model?: string;
    prompt?: string;
    runtimeSettings?: ContextEngineRuntimeSettings;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<AssembleResult>;

  compact(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile?: string;
    tokenBudget?: number;
    force?: boolean;
    currentTokenCount?: number;
    compactionTarget?: 'budget' | 'threshold';
    customInstructions?: string;
    runtimeSettings?: ContextEngineRuntimeSettings;
    runtimeContext?: ContextEngineRuntimeContext;
    abortSignal?: AbortSignal;
  }): Promise<CompactResult>;

  searchMemory?(params: {
    sessionId: string;
    sessionKey?: string;
    query: string;
    topK?: number;
    minScore?: number;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<MemorySearchResult[]>;

  prepareSubagentSpawn?(params: {
    parentSessionKey: string;
    childSessionKey: string;
    contextMode?: 'isolated' | 'fork';
    parentSessionId?: string;
    parentSessionFile?: string;
    childSessionId?: string;
    childSessionFile?: string;
    ttlMs?: number;
  }): Promise<SubagentSpawnPreparation | undefined>;

  onSubagentEnded?(params: {
    childSessionKey: string;
    reason: SubagentEndReason;
  }): Promise<void>;

  getStats?(): Promise<ContextEngineStats>;

  getSessionState?(): ContextEngineSessionState | null;

  dispose?(): Promise<void>;
}

export type ContextEngineFactory = (
  ctx: ContextEngineFactoryContext,
) => ContextEngine | Promise<ContextEngine>;

export type ContextEngineFactoryContext = {
  config?: Record<string, unknown>;
  agentDir?: string;
  workspaceDir?: string;
  sessionId?: string;
};

export interface ContextEngineRegistration {
  id: string;
  factory: ContextEngineFactory;
  config: ContextEngineConfig;
  owner?: string;
  isDefault?: boolean;
}

export type ContextEngineLifecyclePhase =
  | 'bootstrap'
  | 'ingest'
  | 'assemble'
  | 'after_turn'
  | 'compact'
  | 'maintain'
  | 'dispose';

export interface ContextEngineLifecycleHook {
  phase: ContextEngineLifecyclePhase;
  handler: (engine: ContextEngine, ...args: unknown[]) => Promise<void> | void;
  priority?: number;
}

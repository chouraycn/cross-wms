// Agent/runtime helpers.
export { resolveCronStyleNow } from "../../../../engine/agents/current-time.js";
export {
  resolveAgentContextLimits,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
  resolveSessionAgentId,
} from "../../../../engine/agents/agent-scope.js";
export { requireApiKey, resolveApiKeyForProvider } from "../../../../engine/agents/model-auth.js";
export { stripInternalRuntimeContext } from "../../../../engine/agents/internal-runtime-context.js";
export { DEFAULT_AGENT_COMPACTION_RESERVE_TOKENS_FLOOR } from "../../../../engine/agents/agent-settings.js";
export {
  asToolParamsRecord,
  jsonResult,
  readNumberParam,
  readStringParam,
} from "../../../../engine/agents/tools/common.js";
export type { AnyAgentTool } from "../../../../engine/agents/tools/common.js";
export {
  resolveMemorySearchConfig,
  resolveMemorySearchSyncConfig,
  type ResolvedMemorySearchConfig,
  type ResolvedMemorySearchSyncConfig,
} from "../../../../engine/agents/memory-search.js";

// Session and reply helpers.
export { isHeartbeatUserMessage } from "../../../../engine/auto-reply/heartbeat-filter.js";
export { HEARTBEAT_PROMPT } from "../../../../engine/auto-reply/heartbeat.js";
export { stripInboundMetadata } from "../../../../engine/auto-reply/reply/strip-inbound-meta.js";
export {
  HEARTBEAT_TOKEN,
  SILENT_REPLY_TOKEN,
  isSilentReplyPayloadText,
} from "../../../../engine/auto-reply/tokens.js";

// CLI/runtime/config helpers.
export { formatErrorMessage, withManager } from "../../../../engine/cli/cli-utils.js";
export { resolveCommandSecretRefsViaGateway } from "../../../../engine/cli/command-secret-gateway.js";
export { formatHelpExamples } from "../../../../engine/cli/help-format.js";
export { parseDurationMs } from "../../../../engine/cli/parse-duration.js";
export { withProgress, withProgressTotals } from "../../../../engine/cli/progress.js";
export { parseNonNegativeByteSize } from "../../../../engine/config/byte-size.js";
export {
  clearConfigCache,
  clearRuntimeConfigSnapshot,
  getRuntimeConfig,
  /** @deprecated Use getRuntimeConfig(), or pass the already loaded config through the call path. */
  loadConfig,
} from "../../../../engine/config/config.js";
export type { OpenClawConfig } from "../../../../engine/config/config.js";
export { resolveStateDir } from "../../../../engine/config/paths.js";
export {
  isCompactionCheckpointTranscriptFileName,
} from "../../../../engine/config/sessions/artifacts.js";
export { canonicalizeMainSessionAlias } from "../../../../engine/config/sessions/main-session.js";
export { resolveSessionTranscriptsDirForAgent } from "../../../../engine/config/sessions/paths.js";
export {
  listSessionEntries,
  resolveSessionFilePath,
  resolveStorePath,
} from "../../../../engine/plugin-sdk/session-store-runtime.js";
export type { SessionEntry } from "../../../../engine/config/sessions/types.js";
export type { SessionSendPolicyConfig } from "../../../../engine/config/types.base.js";
export type {
  MemoryBackend,
  MemoryCitationsMode,
  MemoryQmdConfig,
  MemoryQmdIndexPath,
  MemoryQmdMcporterConfig,
  MemoryQmdSearchMode,
} from "../../../../engine/config/types.memory.js";
export {
  hasConfiguredSecretInput,
  normalizeResolvedSecretInputString,
} from "../../../../engine/config/types.secrets.js";
export type { SecretInput } from "../../../../engine/config/types.secrets.js";
export type { MemorySearchConfig } from "../../../../engine/config/types.tools.js";
export { isVerbose, setVerbose } from "../../../../engine/globals.js";

// IO, network, and logging helpers.
export { isExecCompletionEvent } from "../../../../engine/infra/heartbeat-events-filter.js";
export { fetchWithSsrFGuard } from "../../../../engine/infra/net/fetch-guard.js";
export { shouldUseEnvHttpProxyForUrl } from "../../../../engine/infra/net/proxy-env.js";
export { ssrfPolicyFromHttpBaseUrlAllowedHostname } from "../../../../engine/infra/net/ssrf.js";
export {
  DEFAULT_SQLITE_WAL_AUTOCHECKPOINT_PAGES,
  DEFAULT_SQLITE_WAL_CHECKPOINT_INTERVAL_MS,
  DEFAULT_SQLITE_WAL_TRUNCATE_INTERVAL_MS,
  configureSqliteConnectionPragmas,
  configureSqliteWalMaintenance,
} from "../../../../engine/infra/sqlite-wal.js";
export type {
  SqliteConnectionPragmaOptions,
  SqliteWalMaintenance,
  SqliteWalMaintenanceOptions,
} from "../../../../engine/infra/sqlite-wal.js";
export {
  installProcessWarningFilter,
  shouldIgnoreWarning,
} from "../../../../engine/infra/warning-filter.js";
export type { ProcessWarning } from "../../../../engine/infra/warning-filter.js";
export { redactSensitiveText } from "../../../../engine/logging/redact.js";
export { createSubsystemLogger } from "../../../../engine/logging/subsystem.js";
export { detectMime } from "@openclaw/media-core/mime";

// Memory plugin helpers.
export {
  getMemoryEmbeddingProvider,
  listMemoryEmbeddingProviders,
  listRegisteredMemoryEmbeddingProviderAdapters,
  listRegisteredMemoryEmbeddingProviders,
} from "../../../../engine/plugins/memory-embedding-provider-runtime.js";
export {
  clearMemoryEmbeddingProviders,
} from "../../../../engine/plugins/memory-embedding-providers.js";
export type {
  MemoryEmbeddingProviderAdapter,
} from "../../../../engine/plugins/memory-embedding-providers.js";
export { emptyPluginConfigSchema } from "../../../../engine/plugins/config-schema.js";
export {
  buildMemoryPromptSection as buildActiveMemoryPromptSection,
  getMemoryCapabilityRegistration,
  listActiveMemoryPublicArtifacts,
} from "../../../../engine/plugins/memory-state.js";
export type {
  MemoryFlushPlan,
  MemoryFlushPlanResolver,
  MemoryPluginCapability,
  MemoryPluginPublicArtifact,
  MemoryPluginPublicArtifactsProvider,
  MemoryPluginRuntime,
  MemoryPromptSectionBuilder,
} from "../../../../engine/plugins/memory-state.js";
export type { OpenClawPluginApi } from "../../../../engine/plugins/types.js";

// Shared session/text utilities.
export { defaultRuntime } from "../../../../engine/runtime.js";
export { parseAgentSessionKey } from "../../../../engine/routing/session-key.js";
export { hasInterSessionUserProvenance } from "../../../../engine/sessions/input-provenance.js";
export { isCronRunSessionKey } from "../../../../engine/sessions/session-key-utils.js";
export { onSessionTranscriptUpdate } from "../../../../engine/sessions/transcript-events.js";
export { formatDocsLink } from "../../../terminal-core/src/links.js";
export { colorize, isRich, theme } from "../../../terminal-core/src/theme.js";
export { CHARS_PER_TOKEN_ESTIMATE, estimateStringChars } from "../../../../engine/utils/cjk-chars.js";
export { runTasksWithConcurrency } from "../../../../engine/utils/run-with-concurrency.js";
export { splitShellArgs } from "../../../../engine/utils/shell-argv.js";
export {
  resolveUserPath,
  shortenHomeInString,
  shortenHomePath,
  truncateUtf16Safe,
} from "../../../../engine/utils.js";
export {
  applyWindowsSpawnProgramPolicy,
  materializeWindowsSpawnProgram,
  resolveWindowsExecutablePath,
  resolveWindowsSpawnProgram,
  resolveWindowsSpawnProgramCandidate,
} from "../../../../engine/plugin-sdk/windows-spawn.js";
export type {
  ResolveWindowsSpawnProgramCandidateParams,
  ResolveWindowsSpawnProgramParams,
  WindowsSpawnCandidateResolution,
  WindowsSpawnInvocation,
  WindowsSpawnProgram,
  WindowsSpawnProgramCandidate,
  WindowsSpawnResolution,
} from "../../../../engine/plugin-sdk/windows-spawn.js";
export { resolveGlobalSingleton } from "../../../../engine/shared/global-singleton.js";

// Local stubs for helpers not yet ported to the cross-wms engine modules.
// Signatures mirror openclaw/src; implementations degrade safely.
export function isSessionArchiveArtifactName(_fileName: string): boolean {
  return false;
}
export function isUsageCountedSessionTranscriptFileName(_fileName: string): boolean {
  return false;
}
export function parseUsageCountedSessionIdFromFileName(_fileName: string): string | null {
  return null;
}
export async function root(_rootDir: string): Promise<unknown> {
  throw new Error("fs-safe root() is not implemented in cross-wms");
}
export async function resolveCanonicalRootMemoryFile(_workspaceDir: string): Promise<string | null> {
  return null;
}
export function shouldSkipRootMemoryAuxiliaryPath(_params: {
  workspaceDir: string;
  absPath: string;
}): boolean {
  return false;
}

// Local type stubs for memory embedding types not yet ported to cross-wms engine.
export type MemoryEmbeddingBatchChunk = {
  text: string;
  embeddingInput?: unknown;
};
export type MemoryEmbeddingBatchOptions = {
  agentId: string;
  chunks: MemoryEmbeddingBatchChunk[];
  wait: boolean;
  concurrency: number;
  pollIntervalMs: number;
  timeoutMs: number;
  debug: (message: string, data?: Record<string, unknown>) => void;
};
export type MemoryEmbeddingProviderCallOptions = {
  signal?: AbortSignal;
};
export type MemoryEmbeddingProviderRuntime = {
  id: string;
  cacheKeyData?: Record<string, unknown>;
  indexIdentityAliases?: Array<{
    model: string;
    cacheKeyData: Record<string, unknown>;
  }>;
  inlineQueryTimeoutMs?: number;
  inlineBatchTimeoutMs?: number;
  sourceWideBatchEmbed?: boolean;
  batchEmbed?: (options: MemoryEmbeddingBatchOptions) => Promise<number[][] | null>;
};
export type MemoryEmbeddingProvider = {
  id: string;
  model: string;
  maxInputTokens?: number;
  embedQuery: (text: string, options?: MemoryEmbeddingProviderCallOptions) => Promise<number[]>;
  embedBatch: (
    texts: string[],
    options?: MemoryEmbeddingProviderCallOptions,
  ) => Promise<number[][]>;
  embedBatchInputs?: (
    inputs: unknown[],
    options?: MemoryEmbeddingProviderCallOptions,
  ) => Promise<number[][]>;
  close?: () => Promise<void> | void;
};
export type MemoryEmbeddingProviderCreateOptions = {
  config: unknown;
  agentDir?: string;
  provider?: string;
  fallback?: string;
  remote?: {
    baseUrl?: string;
    apiKey?: unknown;
    headers?: Record<string, string>;
  };
  model: string;
  inputType?: string;
  queryInputType?: string;
  documentInputType?: string;
  local?: {
    modelPath?: string;
    modelCacheDir?: string;
    contextSize?: number | "auto";
  };
  outputDimensionality?: number;
  taskType?:
    | "RETRIEVAL_QUERY"
    | "RETRIEVAL_DOCUMENT"
    | "SEMANTIC_SIMILARITY"
    | "CLASSIFICATION"
    | "CLUSTERING"
    | "QUESTION_ANSWERING"
    | "FACT_VERIFICATION";
};
export type MemoryEmbeddingProviderCreateResult = {
  provider: MemoryEmbeddingProvider | null;
  runtime?: MemoryEmbeddingProviderRuntime;
};

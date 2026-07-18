import { globalRegistry } from './registry.js';
import { LEGACY_ENGINE_CONFIG, createLegacyContextEngine } from './legacyEngine.js';
import { logger } from '../../logger.js';
import type { ContextEngineFactoryContext } from './types.js';

export function initContextEngineRegistry(): void {
  if (globalRegistry.has('legacy')) {
    logger.debug('[ContextEngine] 注册表已初始化，跳过');
    return;
  }

  globalRegistry.register(
    'legacy',
    createLegacyContextEngine,
    LEGACY_ENGINE_CONFIG,
    { isDefault: true }
  );

  logger.info('[ContextEngine] 上下文引擎注册表初始化完成，可用引擎:',
    globalRegistry.listEngines().map(e => `${e.engineId} (${e.displayName})`).join(', '));
}

export function getContextEngine(
  sessionId: string,
  options?: {
    engineId?: string;
    factoryContext?: ContextEngineFactoryContext;
  }
) {
  if (!globalRegistry.has('legacy')) {
    initContextEngineRegistry();
  }
  return globalRegistry.createEngine(sessionId, {
    engineId: options?.engineId,
    factoryContext: options?.factoryContext
  });
}

export { globalRegistry } from './registry.js';
export * from './types.js';
export { LegacyContextEngine, createLegacyContextEngine } from './legacyEngine.js';

export * from './promptCache.js';
export * from './quarantineHealth.js';
export * from './runtimeSettings.js';
export * from './subagentLifecycle.js';
export * from './transcriptRewrite.js';

export { TokenBudgetManager, calculateTokenEstimate } from './token-budget.js';
export type {
  TokenBudgetConfig,
  TokenBudgetStats,
  TokenAllocation,
  TokenCostEstimate,
} from './token-budget.js';

export { RelevanceScorer } from './relevance-scorer.js';
export type {
  RelevanceScorerConfig,
  ScoredItem,
  ScoringOptions,
  KeywordMatchResult,
} from './relevance-scorer.js';

export { MemoryLayers } from './memory-layers.js';
export type {
  MemoryLayerType,
  MemoryItem,
  MemoryLayerConfig,
  MemoryStats,
} from './memory-layers.js';

export { Summarizer } from './summarizer.js';
export type {
  SummarizerConfig,
  SummaryResult,
  SummarizationStrategy,
  // Alias for backward compatibility
  SummarizationStrategy as SummaryStrategy,
} from './summarizer.js';

export { ContextCompactor } from './compaction.js';
export type {
  CompactionStrategy,
  CompactionConfig,
  CompactionResult,
  MessageForCompaction,
} from './compaction.js';

export { MessageFilter } from './message-filter.js';
export type {
  MessageFilterConfig,
  FilterResult,
  FilterRule,
} from './message-filter.js';

export { VectorRetrieval } from './retrieval.js';
export type {
  VectorStoreConfig as VectorRetrievalConfig,
  VectorStoreType,
  VectorRecord as VectorItem,
  SearchOptions,
  SearchResult,
} from './retrieval.js';

export { ArtifactStore } from './artifact-store.js';
export type {
  ArtifactStoreConfig as ArtifactConfig,
  Artifact as ArtifactItem,
  ArtifactType,
  ArtifactStats,
} from './artifact-store.js';

export { WorkspaceContext } from './workspace-context.js';
export type {
  WorkspaceContextConfig,
  WorkspaceFile,
  FileSearchOptions,
} from './workspace-context.js';

export { ToolContext } from './tool-context.js';
export type {
  ToolContextConfig,
  ToolCallRecord,
  ToolStats,
} from './tool-context.js';

export { ContextBuilder } from './context-builder.js';
export type {
  ContextBuilderConfig,
  BuildContextOptions as BuildOptions,
  BuiltContext as BuildResult,
} from './context-builder.js';

export { EnhancedContextEngine } from './context-engine.js';
export type {
  EnhancedContextEngineConfig,
  ContextWindowState,
} from './context-engine.js';

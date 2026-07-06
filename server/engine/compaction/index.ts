/**
 * 上下文压缩 barrel 文件（组织性）。
 * 本文件仅用于聚合 re-export 父目录中的上下文压缩与裁剪相关模块，便于以
 * `engine/compaction` 子路径统一引用；不移动或修改任何现有文件。
 *
 * 说明：以下模块存在重名导出，已对后出现者改用具名 re-export 并排除冲突名：
 * - compactionPlanning 与 compaction-planning 在 BASE_CHUNK_RATIO /
 *   MIN_CHUNK_RATIO / SUMMARIZATION_OVERHEAD_TOKENS 上重名（由 compaction-planning 提供）。
 * - contextTruncate / contextWindowGuard 与 compaction-planning 在
 *   estimateMessagesTokens 上重名（由 compaction-planning 提供）。
 * - contextTruncate 与 contextWindowGuard 在 estimateTokens 上重名
 *   （由 contextTruncate 提供）。
 */
export * from '../compaction-config.js';
export * from '../compaction-dedupe.js';
export * from '../compaction-hooks.js';
export {
  CompactionIdentifierPolicy,
  CompactionIdentifierConfig,
  IDENTIFIER_PRESERVATION_INSTRUCTIONS,
  GENERAL_IDENTIFIER_PRESERVATION_INSTRUCTIONS,
  CompactionSummarizationInstructions,
  resolveIdentifierPreservationInstructions,
  buildCompactionSummarizationInstructions,
  MERGE_SUMMARIES_INSTRUCTIONS,
  SUMMARY_VALIDATION_INSTRUCTIONS,
  extractValidSummaryContent,
} from '../compaction-identifier.js';
export {
  BASE_CHUNK_RATIO,
  MIN_CHUNK_RATIO,
  SAFETY_MARGIN,
  SUMMARIZATION_OVERHEAD_TOKENS,
  MIN_PROMPT_BUDGET_TOKENS,
  MIN_PROMPT_BUDGET_RATIO,
  estimateMessageTokens,
  estimateMessagesTokens,
  normalizeCompactionParts,
  splitMessagesByTokenShare,
  chunkMessagesByMaxTokens,
  computeAdaptiveChunkRatio,
  isOversizedForSummary,
  buildSummaryChunks,
  buildOversizedFallbackPlan,
  buildStageSplitPlan,
  pruneHistoryForContextShare,
  buildHistoryPrunePlan,
  estimateTokensAfterCompaction,
} from '../compaction-planning.js';
export * from '../compaction-safety.js';
export * from '../compaction-sanitize.js';
export * from '../compaction-transcript.js';
export {
  DEFAULT_RECENT_MESSAGES_KEEP,
  COMPACTION_SAFETY_MARGIN,
  MAX_SINGLE_MESSAGE_TOKENS,
  CompactionMessage,
  ToolUsePair,
  ChunkPlan,
  CompactionPlan,
  CompactionPlanOptions,
  sanitizeForCompaction,
  repairToolCallPairs,
  planChunks,
  buildCompactionPlan,
} from '../compactionPlanning.js';
export * from '../contextCompress.js';
export * from '../contextEnhancer.js';
export {
  estimateTokens,
  sanitizeToolMessages,
  truncateContextForModel,
} from '../contextTruncate.js';
export {
  CONTEXT_WINDOW_HARD_MIN_TOKENS,
  CONTEXT_WINDOW_WARN_BELOW_TOKENS,
  CONTEXT_WINDOW_HARD_MIN_RATIO,
  CONTEXT_WINDOW_WARN_BELOW_RATIO,
  DEFAULT_SAFETY_MARGIN,
  DEFAULT_COMPACTION_TRIGGER_RATIO,
  DEFAULT_COMPACTION_TARGET_RATIO,
  ContextWindowSource,
  ContextWindowInfo,
  TokenUsageEstimate,
  ContextGuardDecision,
  ContextWindowGuard,
  getContextWindowGuard,
} from '../contextWindowGuard.js';
export * from '../context-projection.js';
export * from '../autoCompressor.js';
export * from '../semanticCompressor.js';
export * from '../observationCompressor.js';
export * from '../historySanitizer.js';

// v9.0: 压缩系统增强模块
export * from './tokenBudget.js';
export * from './compactionSafety.js';
export {
  CompactionHookType,
  CompactionTrigger,
  CompactionHookContext,
  AfterCompactHookContext,
  CompactFailedHookContext,
  CompactionAbortSignal,
  CompactionHooks,
} from './compactionHooks.js';
export {
  TranscriptRecord,
  TranscriptChain,
  SuccessorTranscriptManager,
} from './successorTranscript.js';

// P1-4: 结构化压缩摘要消息（对齐 OpenClaw agent-core compaction 设计）
export {
  CompactionSummaryStructure,
  CompactionFileManifest,
  CompactionSummaryMetadata,
  CompactionSummaryMessage,
  serializeCompactionSummary,
  createCompactionSummaryMessage,
  summaryMessageToCompactionMessage,
  tryParseCompactionSummary,
  incrementallyUpdateSummary,
} from './summaryMessage.js';

export { adaptiveChunk } from './adaptiveChunk.js';
export { chunkWorker } from './chunkWorker.js';
export { compactionBridge } from './compaction-bridge.js';
export { compactionHooks } from './compactionHooks.js';
export { compactionNotification } from './compactionNotification.js';
export { compactionRecovery } from './compactionRecovery.js';
export { compactionSafety } from './compactionSafety.js';
export { multiLevelSummary } from './multiLevelSummary.js';
export { summaryMessage } from './summaryMessage.js';
export { tokenBudget } from './tokenBudget.js';
export { workerPool } from './workerPool.js';

// ===== 阶段⑥新增模块 =====
// 文件操作三桶累积（read/written/edited 独立跟踪，跨压缩回滚合并）
export {
  extractFileOperations,
  extractFileOpsFromMessage,
  computeFileLists,
  formatFileOperations,
} from './file-operations.js';
export type {
  FileOperations,
  CompactionFileDetails,
} from './file-operations.js';

// Split-turn 处理（切点落在 turn 中间时，对 turn 前缀单独摘要并拼接）
export {
  TURN_PREFIX_SUMMARIZATION_PROMPT,
  isSplitTurnCut,
  extractTurnPrefixMessages,
  appendTurnContextToSummary,
} from './split-turn.js';

// 双 Prompt 体系（首次摘要 + 增量更新）+ 消息格式化
export {
  SUMMARIZATION_SYSTEM_PROMPT,
  SUMMARIZATION_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT,
  formatMessagesForSummarization,
  buildSummarizationInput,
} from './summary-prompts.js';

// 散落文件整合 - 按实际导出
export {
  DEFAULT_RECENT_MESSAGES_KEEP,
  MAX_SINGLE_MESSAGE_TOKENS,
  sanitizeForCompaction,
  repairToolCallPairs,
  planChunks,
} from '../compactionPlanning.js';
export type { CompactionMessage, ToolUsePair, ChunkPlan, CompactionPlan, CompactionPlanOptions } from '../compactionPlanning.js';

export {
  IDENTIFIER_PRESERVATION_INSTRUCTIONS,
  GENERAL_IDENTIFIER_PRESERVATION_INSTRUCTIONS,
  MERGE_SUMMARIES_INSTRUCTIONS,
  SUMMARY_VALIDATION_INSTRUCTIONS,
  resolveIdentifierPreservationInstructions,
  buildCompactionSummarizationInstructions,
  extractValidSummaryContent,
} from '../compaction-identifier.js';
export type { CompactionIdentifierPolicy, CompactionIdentifierConfig, CompactionSummarizationInstructions } from '../compaction-identifier.js';

export {
  deduplicateUserMessages,
  deduplicateAssistantMessages,
  mergeConsecutiveSystemMessages,
  preprocessForCompaction,
} from '../compaction-dedupe.js';
export type { DeduplicationConfig, DeduplicationResult } from '../compaction-dedupe.js';

export {
  TranscriptManager,
  getGlobalTranscriptManager,
  setGlobalTranscriptManager,
  createTranscriptManager,
} from '../compaction-transcript.js';
export type { TranscriptRotation, CompactionCheckpoint } from '../compaction-transcript.js';

export {
  stripToolResultDetails,
  stripRuntimeContextMessages,
  sanitizeCompactionMessages,
  estimateSanitizedMessagesTokens,
  extractToolPairs,
  repairOrphanToolResults,
  validateMessageIntegrity,
} from '../compaction-sanitize.js';
export type { ToolPairInfo } from '../compaction-sanitize.js';

export type { CompactionConfig } from '../compaction-config.js';
export { CompactionConfigManager } from '../compaction-config.js';
export type { CompactionProvider } from '../compactionProvider.js';
export { CompactionProviderRegistry } from '../compactionProvider.js';
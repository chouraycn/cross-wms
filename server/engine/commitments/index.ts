/**
 * Commitments 模块入口 - Barrel 导出
 *
 * 汇总承诺跟踪模块的公开类型和函数，供外部统一从
 * `server/engine/commitments/index.js` 导入。
 */

// ===================== 类型 =====================
export type {
  CommitmentKind,
  CommitmentSensitivity,
  CommitmentStatus,
  CommitmentPriority,
  CommitmentSource,
  CommitmentScope,
  CommitmentDueWindow,
  CommitmentRecord,
  CommitmentStoreFile,
  CommitmentCandidate,
  CommitmentExtractionItem,
  CommitmentExtractionBatchResult,
  CommitmentHeartbeat,
  CommitmentFilter,
  CommitmentStats,
  SortParams,
  PaginationParams,
  PaginatedResult,
} from "./types.js";

// ===================== 配置 =====================
export {
  DEBOUNCE_MS,
  BATCH_MAX_ITEMS,
  QUEUE_MAX_ITEMS,
  CONFIDENCE_THRESHOLD,
  CARE_CONFIDENCE_THRESHOLD,
  EXTRACTION_TIMEOUT_SECONDS,
  MAX_PER_HEARTBEAT,
  EXPIRE_AFTER_HOURS,
  MAX_PER_DAY,
  resolveCommitmentsConfig,
  resolveCommitmentTimezone,
  priorityToNumber,
  numberToPriority,
} from "./config.js";
export type {
  CommitmentsConfigInput,
  ResolvedCommitmentsConfig,
} from "./config.js";

// ===================== 存储 =====================
export {
  resolveCommitmentStorePath,
  loadCommitmentStore,
  saveCommitmentStore,
  coerceCommitment,
  addCommitment,
  getCommitment,
  updateCommitment,
  deleteCommitment,
  updateCommitmentStatus,
  markCommitmentsAttempted,
  expireStaleCommitments,
  claimDueCommitments,
  listPendingCommitmentsForScope,
  listCommitments,
  getCommitmentStats,
  addHeartbeatRecord,
  getHeartbeatsForCommitment,
  listHeartbeats,
  applyFilter,
  applySort,
  applyPagination,
} from "./store.js";
export type {
  CommitmentUpdateParams,
  ListCommitmentsParams,
} from "./store.js";

// ===================== 运行时 =====================
export {
  createCommitmentRuntime,
} from "./runtime.js";
export type {
  CommitmentRuntime,
  CommitmentRuntimeHooks,
  CommitmentExtractBatchFn,
  CommitmentCandidateResolver,
  CommitmentExtractionEnqueueInput,
  CompletionVerifier,
} from "./runtime.js";

// ===================== 提取 =====================
export {
  generateDedupeKey,
  extractCommitmentsFromText,
  buildCommitmentCandidates,
  ruleBasedExtractBatch,
  addExtractionRule,
  clearExtractionRules,
  getExtractionRules,
  buildExtractionPrompt,
  validateCandidate,
  parseTimeExpression,
  detectEntities,
} from "./extraction.js";
export type {
  ExtractionPromptContext,
  CommitmentExtractionRule,
  ExtractionResult,
  TimeParseResult,
  EntityMatch,
} from "./extraction.js";

// ===================== 模型选择 =====================
export {
  CommitmentModelSelector,
  commitmentModelSelector,
  selectCommitmentModel,
  configureCommitmentModelSelection,
} from "./model-selection.runtime.js";
export type {
  CommitmentModelConfig,
  ModelSelectionContext,
  ModelSelectionResult,
  ModelSelectionStats,
  CachedSelection,
} from "./model-selection.runtime.js";

// ===================== 存储写入器 =====================
export {
  CommitmentStoreWriter,
  CommitmentStoreWriterManager,
  commitmentStoreWriterManager,
  getCommitmentStoreWriter,
} from "./store-writer.js";
export type {
  StoreWriterOptions,
  PendingWrite,
  StoreWriterStats,
} from "./store-writer.js";

// ===================== 心跳策略 =====================
export {
  HeartbeatPolicy,
  buildHeartbeatPolicyConfig,
} from "./heartbeat-policy.js";
export type {
  HeartbeatPolicyConfig,
  HeartbeatPolicyHooks,
  HeartbeatRunResult,
  HeartbeatDeliveryResult,
  HeartbeatDeliveryFn,
  HeartbeatPolicyStats,
} from "./heartbeat-policy.js";

// ===================== 完整链路 =====================
export {
  CommitmentsFullChain,
  getCommitmentsFullChain,
  resetCommitmentsFullChainForTests,
} from "./commitments-full-chain.js";
export type {
  FullChainOptions,
  FullChainStats,
  CommitmentsFullChainOptions,
} from "./commitments-full-chain.js";

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
  CommitmentSource,
  CommitmentScope,
  CommitmentDueWindow,
  CommitmentRecord,
  CommitmentStoreFile,
  CommitmentCandidate,
  CommitmentExtractionItem,
  CommitmentExtractionBatchResult,
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
  updateCommitmentStatus,
  markCommitmentsAttempted,
  expireStaleCommitments,
  claimDueCommitments,
  listPendingCommitmentsForScope,
  listCommitments,
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
} from "./runtime.js";

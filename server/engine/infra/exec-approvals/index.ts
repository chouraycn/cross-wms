export type {
  ApprovalStatus,
  ApprovalLevel,
  ExecApproval,
  ExecApprovalRequest,
  ExecSafetyCheckResult,
  SafeBinPolicy,
  UnixSocketMessage,
  UnixSocketResponse,
} from './types.js';

export {
  DEFAULT_SAFE_BIN_POLICY,
  isBinAllowed,
  isBinBlocked,
  requiresApproval,
  createSafeBinPolicy,
  isPathAllowed,
} from './exec-safe-bin-policy.js';

export {
  checkCommandSafety,
  assertCommandSafe,
  isSafeCommand,
} from './exec-safety.js';

export {
  ExecApprovalStore,
  defaultApprovalStore,
} from './exec-approval-store.js';
export type { ApprovalStoreOptions } from './exec-approval-store.js';

export {
  UnixSocketServer,
  UnixSocketClient,
} from './unix-socket.js';
export type { UnixSocketServerOptions, UnixSocketClientOptions } from './unix-socket.js';

// 序列化的白名单条目与 exec 自动审查
export type { ExecAllowlistEntry } from './exec-approvals.types.js';
export type {
  ExecAutoReviewDecision,
  ExecAutoReviewHost,
  ExecAutoReviewInput,
  ExecAutoReviewer,
} from './exec-auto-review.js';
export { defaultExecAutoReviewer } from './exec-auto-review.js';

// wrapper token 规范化
export { basenameLower, normalizeExecutableToken } from './exec-wrapper-tokens.js';

// safe-bin 命令参数语义验证
export {
  normalizeSafeBinName,
  validateSafeBinSemantics,
  listRiskyConfiguredSafeBins,
} from './exec-safe-bin-semantics.js';

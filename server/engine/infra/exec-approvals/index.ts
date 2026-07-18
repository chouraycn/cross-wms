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

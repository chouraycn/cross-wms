// 移植自 openclaw/src/infra/exec-approvals.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecHost = unknown;
export type ExecTarget = unknown;
export type ExecSecurity = unknown;
export type ExecAsk = unknown;
export type ExecMode = unknown;
export type SystemRunApprovalBinding = unknown;
export type SystemRunApprovalFileOperand = unknown;
export type SystemRunApprovalPlan = unknown;
export type ExecApprovalCommandSpan = unknown;
export type ExecApprovalRequestPayload = unknown;
export type ExecApprovalRequest = unknown;
export type ExecApprovalResolved = unknown;
export type ExecApprovalsDefaults = unknown;
export type ExecApprovalsAgent = unknown;
export type ExecApprovalsFile = unknown;
export type ExecApprovalsSnapshot = unknown;
export type ExecApprovalsResolved = unknown;
export type ExecApprovalsDefaultOverrides = unknown;
export type AllowAlwaysPersistenceReason = unknown;
export type AllowAlwaysPersistenceDecision = unknown;
export type ExecApprovalDecision = unknown;
export type ExecApprovalUnavailableDecision = unknown;
export type ExecAllowlistEntry = unknown;
export function normalizeExecHost(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeExecHost");
}
export function normalizeExecTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeExecTarget");
}
export function requireValidExecTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: requireValidExecTarget");
}
export function normalizeExecSecurity(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeExecSecurity");
}
export function normalizeExecAsk(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeExecAsk");
}
export function normalizeExecMode(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeExecMode");
}
export function resolveExecModeFromPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecModeFromPolicy");
}
export function resolveExecPolicyForMode(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecPolicyForMode");
}
export function resolveExecModePolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecModePolicy");
}
export function resolveExecApprovalsPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovalsPath");
}
export function resolveExecApprovalsSocketPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovalsSocketPath");
}
export function resolveExecApprovalsDisplayPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovalsDisplayPath");
}
export function resolveExecApprovalsTranscriptPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovalsTranscriptPath");
}
export function normalizeExecApprovals(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeExecApprovals");
}
export function mergeExecApprovalsSocketDefaults(...args: unknown[]): unknown {
  throw new Error("not implemented: mergeExecApprovalsSocketDefaults");
}
export function readExecApprovalsSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: readExecApprovalsSnapshot");
}
export function loadExecApprovals(...args: unknown[]): unknown {
  throw new Error("not implemented: loadExecApprovals");
}
export function saveExecApprovals(...args: unknown[]): unknown {
  throw new Error("not implemented: saveExecApprovals");
}
export function restoreExecApprovalsSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: restoreExecApprovalsSnapshot");
}
export function ensureExecApprovals(...args: unknown[]): unknown {
  throw new Error("not implemented: ensureExecApprovals");
}
export function resolveExecApprovals(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovals");
}
export function resolveExecApprovalsFromFile(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovalsFromFile");
}
export function requiresExecApproval(...args: unknown[]): unknown {
  throw new Error("not implemented: requiresExecApproval");
}
export function commandRequiresSecurityAuditSuppressionApproval(...args: unknown[]): unknown {
  throw new Error("not implemented: commandRequiresSecurityAuditSuppressionApproval");
}
export function hasDurableExecApproval(...args: unknown[]): unknown {
  throw new Error("not implemented: hasDurableExecApproval");
}
export function hasNodeCommandAllowAlwaysMarker(...args: unknown[]): unknown {
  throw new Error("not implemented: hasNodeCommandAllowAlwaysMarker");
}
export function hasExactCommandDurableExecApproval(...args: unknown[]): unknown {
  throw new Error("not implemented: hasExactCommandDurableExecApproval");
}
export function recordAllowlistUse(...args: unknown[]): unknown {
  throw new Error("not implemented: recordAllowlistUse");
}
export function recordAllowlistMatchesUse(...args: unknown[]): unknown {
  throw new Error("not implemented: recordAllowlistMatchesUse");
}
export function addAllowlistEntry(...args: unknown[]): unknown {
  throw new Error("not implemented: addAllowlistEntry");
}
export function addDurableCommandApproval(...args: unknown[]): unknown {
  throw new Error("not implemented: addDurableCommandApproval");
}
export function resolveAllowAlwaysPatternCoverage(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAllowAlwaysPatternCoverage");
}
export function persistAllowAlwaysPatterns(...args: unknown[]): unknown {
  throw new Error("not implemented: persistAllowAlwaysPatterns");
}
export function resolveAllowAlwaysPersistenceDecision(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAllowAlwaysPersistenceDecision");
}
export function persistAllowAlwaysDecision(...args: unknown[]): unknown {
  throw new Error("not implemented: persistAllowAlwaysDecision");
}
export function minSecurity(...args: unknown[]): unknown {
  throw new Error("not implemented: minSecurity");
}
export function maxAsk(...args: unknown[]): unknown {
  throw new Error("not implemented: maxAsk");
}
export function normalizeExecApprovalUnavailableDecisions(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeExecApprovalUnavailableDecisions");
}
export function resolveExecApprovalAllowedDecisions(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovalAllowedDecisions");
}
export function resolveExecApprovalUnavailableDecisions(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovalUnavailableDecisions");
}
export function resolveExecApprovalRequestAllowedDecisions(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovalRequestAllowedDecisions");
}
export function isExecApprovalDecisionAllowed(...args: unknown[]): unknown {
  throw new Error("not implemented: isExecApprovalDecisionAllowed");
}
export function requestExecApprovalViaSocket(...args: unknown[]): unknown {
  throw new Error("not implemented: requestExecApprovalViaSocket");
}
export const EXEC_TARGET_VALUES: unknown = undefined;
export const DEFAULT_EXEC_APPROVAL_TIMEOUT_MS: unknown = undefined;
export const DEFAULT_EXEC_APPROVAL_ASK_FALLBACK: unknown = undefined;
export const DEFAULT_EXEC_APPROVAL_DECISIONS: unknown = undefined;
export const OPTIONAL_EXEC_APPROVAL_DECISIONS: unknown = undefined;

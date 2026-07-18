// 移植自 openclaw/src/gateway/server-methods/approval-shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isApprovalDecision(...args: unknown[]): unknown {
  throw new Error("not implemented: isApprovalDecision");
}

export function isApprovalRecordVisibleToClient(...args: unknown[]): unknown {
  throw new Error("not implemented: isApprovalRecordVisibleToClient");
}

export function listVisiblePendingApprovalRequests(...args: unknown[]): unknown {
  throw new Error("not implemented: listVisiblePendingApprovalRequests");
}

export function bindApprovalRequesterMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: bindApprovalRequesterMetadata");
}

export function bindApprovalReviewerDeviceIds(...args: unknown[]): unknown {
  throw new Error("not implemented: bindApprovalReviewerDeviceIds");
}

export function registerPendingApprovalRecord(...args: unknown[]): unknown {
  throw new Error("not implemented: registerPendingApprovalRecord");
}

export function buildRequestedApprovalEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: buildRequestedApprovalEvent");
}

export function resolveApprovalDecisionParams(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalDecisionParams");
}

export function resolveApprovalRequestRecipientConnIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalRequestRecipientConnIds");
}

export function resolvePendingApprovalRecord(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePendingApprovalRecord");
}

export function respondPendingApprovalLookupError(...args: unknown[]): unknown {
  throw new Error("not implemented: respondPendingApprovalLookupError");
}

export async function handleApprovalWaitDecision(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: handleApprovalWaitDecision");
}

export async function handlePendingApprovalRequest(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: handlePendingApprovalRequest");
}

export async function handleApprovalResolve(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: handleApprovalResolve");
}

// 移植自 openclaw/src/gateway/server-methods/approval-shared.ts

export function isApprovalDecision(...args: unknown[]): unknown {
  return false;
}

export function isApprovalRecordVisibleToClient(...args: unknown[]): unknown {
  return false;
}

export function listVisiblePendingApprovalRequests(...args: unknown[]): unknown {
  return [];
}

export function bindApprovalRequesterMetadata(...args: unknown[]): unknown {
  return undefined;
}

export function bindApprovalReviewerDeviceIds(...args: unknown[]): unknown {
  return undefined;
}

export function registerPendingApprovalRecord(...args: unknown[]): unknown {
  return undefined;
}

export function buildRequestedApprovalEvent(...args: unknown[]): unknown {
  return undefined;
}

export function resolveApprovalDecisionParams(...args: unknown[]): unknown {
  return undefined;
}

export function resolveApprovalRequestRecipientConnIds(...args: unknown[]): unknown {
  return undefined;
}

export function resolvePendingApprovalRecord(...args: unknown[]): unknown {
  return undefined;
}

export function respondPendingApprovalLookupError(...args: unknown[]): unknown {
  return undefined;
}

export async function handleApprovalWaitDecision(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function handlePendingApprovalRequest(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function handleApprovalResolve(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

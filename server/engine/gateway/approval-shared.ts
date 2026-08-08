// 移植自 openclaw/src/gateway/server-methods/approval-shared.ts

export function isApprovalDecision(...args: any[]): any {
  return false;
}

export function isApprovalRecordVisibleToClient(...args: any[]): any {
  return false;
}

export function listVisiblePendingApprovalRequests(...args: any[]): any {
  return [];
}

export function bindApprovalRequesterMetadata(...args: any[]): any {
  return undefined;
}

export function bindApprovalReviewerDeviceIds(...args: any[]): any {
  return undefined;
}

export function registerPendingApprovalRecord(...args: any[]): any {
  return undefined;
}

export function buildRequestedApprovalEvent(...args: any[]): any {
  return undefined;
}

export function resolveApprovalDecisionParams(...args: any[]): any {
  return undefined;
}

export function resolveApprovalRequestRecipientConnIds(...args: any[]): any {
  return undefined;
}

export function resolvePendingApprovalRecord(...args: any[]): any {
  return undefined;
}

export function respondPendingApprovalLookupError(...args: any[]): any {
  return undefined;
}

export async function handleApprovalWaitDecision(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function handlePendingApprovalRequest(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function handleApprovalResolve(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

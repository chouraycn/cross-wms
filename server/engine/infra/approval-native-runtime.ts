// 移植自 openclaw/src/infra/approval-native-runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PreparedChannelNativeApprovalTarget = unknown;
export function deliverApprovalRequestViaChannelNativePlan(...args: unknown[]): unknown {
  throw new Error("not implemented: deliverApprovalRequestViaChannelNativePlan");
}
export function createChannelNativeApprovalRuntime(...args: unknown[]): unknown {
  throw new Error("not implemented: createChannelNativeApprovalRuntime");
}

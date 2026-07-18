// 移植自 openclaw/src/infra/approval-native-target-key.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function buildChannelApprovalNativeTargetKey(...args: unknown[]): unknown {
  throw new Error("not implemented: buildChannelApprovalNativeTargetKey");
}

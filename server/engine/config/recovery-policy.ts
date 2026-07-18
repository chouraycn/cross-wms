// 移植自 openclaw/src/config/recovery-policy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isPluginPackagingRuntimeOutputIssue(...args: unknown[]): unknown {
  throw new Error("not implemented: isPluginPackagingRuntimeOutputIssue");
}
export function isPluginPackagingRuntimeOutputInvalidConfigSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: isPluginPackagingRuntimeOutputInvalidConfigSnapshot");
}
export function isPluginLocalInvalidConfigSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: isPluginLocalInvalidConfigSnapshot");
}
export function shouldAttemptLastKnownGoodRecovery(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldAttemptLastKnownGoodRecovery");
}

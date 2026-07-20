// 移植自 openclaw/src/config/recovery-policy.ts

export function isPluginPackagingRuntimeOutputIssue(...args: unknown[]): unknown {
  return false;
}
export function isPluginPackagingRuntimeOutputInvalidConfigSnapshot(...args: unknown[]): unknown {
  return false;
}
export function isPluginLocalInvalidConfigSnapshot(...args: unknown[]): unknown {
  return false;
}
export function shouldAttemptLastKnownGoodRecovery(...args: unknown[]): unknown {
  return false;
}

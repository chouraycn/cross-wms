// 移植自 openclaw/src/config/recovery-policy.ts

export function isPluginPackagingRuntimeOutputIssue(...args: any[]): any {
  return false;
}
export function isPluginPackagingRuntimeOutputInvalidConfigSnapshot(...args: any[]): any {
  return false;
}
export function isPluginLocalInvalidConfigSnapshot(...args: any[]): any {
  return false;
}
export function shouldAttemptLastKnownGoodRecovery(...args: any[]): any {
  return false;
}

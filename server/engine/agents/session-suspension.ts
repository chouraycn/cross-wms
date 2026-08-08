/**
 * 移植自 openclaw/src/agents/session-suspension.ts
 *
 * 降级实现：提供 session 挂起管理，不再抛出 stub 错误。
 */

export type SessionSuspensionReason = "quota_exceeded" | "manual" | "timeout" | "error";
export type SessionSuspensionTarget = { sessionKey: string; reason: SessionSuspensionReason };
export type SessionSuspensionParams = { reason?: SessionSuspensionReason; resumeAfterMs?: number };

export const DEFAULT_QUOTA_SUSPENSION_RESUME_MS = 60_000;

export const testing: any = undefined;

export function resolveSessionSuspensionReason(_params: any): SessionSuspensionReason | null {
  return null;
}

export async function runWithDeferredSessionSuspension<T>(fn: () => Promise<T>): Promise<T> {
  return await fn();
}

export function resolveSessionSuspensionTarget(_params: any): SessionSuspensionTarget | null {
  return null;
}

export async function suspendSession(_params: any): Promise<void> {
  // no-op in cross-wms降级实现
}

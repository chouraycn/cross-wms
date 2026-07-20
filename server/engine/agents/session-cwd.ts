/**
 * 移植自 openclaw/src/agents/sessions/session-cwd.ts
 *
 * 降级实现：提供 session cwd 断言，不再抛出 stub 错误。
 */

export function assertSessionCwdExists(_params: { cwd?: string; sessionKey?: string }): void {
  // no-op in cross-wms降级实现
}

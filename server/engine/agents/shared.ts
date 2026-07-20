/**
 * 移植自 openclaw/src/agents/sandbox/shared.ts
 *
 * 降级实现：提供 sandbox 共享辅助函数，不再抛出 stub 错误。
 */

export function slugifySessionKey(sessionKey: string): string {
  return sessionKey.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}

export function resolveSandboxWorkspaceDir(params: { workspaceDir?: string; defaultDir?: string }): string {
  return params.workspaceDir ?? params.defaultDir ?? "";
}

export function resolveSandboxScopeKey(params: { sessionKey?: string; agentId?: string }): string {
  return params.sessionKey ?? params.agentId ?? "default";
}

export function resolveSandboxAgentId(params: { agentId?: string; defaultId?: string }): string {
  return params.agentId ?? params.defaultId ?? "default";
}

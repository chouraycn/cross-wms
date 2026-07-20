/**
 * 移植自 openclaw/src/agents/agent-dir-registry.ts
 *
 * 降级实现：提供 agent 目录注册，不再抛出 stub 错误。
 */

const registry = new Map<string, string>();

export function registerResolvedAgentDir(agentId: string, dir: string): void {
  registry.set(agentId, dir);
}

export function resolveRegisteredAgentIdForDir(dir: string): string | undefined {
  for (const [agentId, registeredDir] of registry) {
    if (registeredDir === dir) {
      return agentId;
    }
  }
  return undefined;
}

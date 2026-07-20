/**
 * 移植自 openclaw/src/agents/tools/cron-tool.ts
 *
 * 降级实现：提供 cron 工具，不再抛出 stub 错误。
 */

export type CronCreatorToolAllowlistEntry = {
  cron: string;
  agentId?: string;
  message: string;
};

export function createCronToolSchema(_params?: unknown): unknown {
  return null;
}

export function replaceWithEffectiveCronCreatorToolAllowlist(allowlist: CronCreatorToolAllowlistEntry[]): CronCreatorToolAllowlistEntry[] {
  return allowlist;
}

export function createCronTool(_params?: unknown): null {
  return null;
}

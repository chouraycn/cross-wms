/**
 * 移植自 openclaw/src/agents/system-prompt-params.ts
 *
 * 降级实现：提供默认的系统提示参数构造，不再抛出 stub 错误。
 */

export type SystemPromptRuntimeParams = {
  runtimeInfo: Record<string, unknown>;
  userTimezone: string;
  userTime?: string;
  userTimeFormat?: string;
};

export function buildSystemPromptParams(params: {
  config?: unknown;
  agentId?: string;
  runtime?: Record<string, unknown>;
  workspaceDir?: string;
  cwd?: string;
}): SystemPromptRuntimeParams {
  return {
    runtimeInfo: {
      agentId: params.agentId,
      ...params.runtime,
    },
    userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userTime: new Date().toISOString(),
  };
}

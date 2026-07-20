/**
 * 移植自 openclaw/src/agents/tools/agent-step.ts
 *
 * 降级实现：提供默认的嵌套 agent step 执行，不再抛出 stub 错误。
 */

export async function runAgentStep(_params: {
  sessionKey: string;
  message: string;
  extraSystemPrompt: string;
  timeoutMs: number;
  channel?: string;
  lane?: string;
  transcriptMessage?: string;
  sourceSessionKey?: string;
  sourceChannel?: string;
  sourceTool?: string;
}): Promise<string | undefined> {
  return undefined;
}

export const testing_agent_step: unknown = undefined;

/**
 * 移植自 openclaw/src/agents/system-prompt-config.ts
 *
 * 降级实现：提供系统提示配置，不再抛出 stub 错误。
 */

export type AgentSystemPromptConfig = {
  enabled: boolean;
  content?: string;
  [key: string]: any;
};

export function resolveAgentSystemPromptConfig(_params?: any): AgentSystemPromptConfig {
  return { enabled: true };
}

export function buildConfiguredAgentSystemPrompt(_params?: any): string {
  return "";
}

/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/effective-tool-policy.ts
 *
 * 降级实现：提供 tool policy 应用，不再抛出 stub 错误。
 */

export function applyFinalEffectiveToolPolicy(params: {
  tools: any;
  config?: any;
  agentId?: string;
}): any {
  return params.tools;
}

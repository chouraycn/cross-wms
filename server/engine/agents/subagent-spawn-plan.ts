/**
 * 移植自 openclaw/src/agents/subagent-spawn-plan.ts
 *
 * 降级实现：提供子代理生成计划，不再抛出 stub 错误。
 */

export function splitModelRef(modelRef: string): { provider: string; model: string } {
  const parts = modelRef.split("/");
  if (parts.length >= 2) {
    return { provider: parts[0], model: parts.slice(1).join("/") };
  }
  return { provider: "", model: modelRef };
}

export function resolveConfiguredSubagentRunTimeoutSeconds(params: { timeoutSeconds?: number; defaultSeconds?: number }): number {
  return params.timeoutSeconds ?? params.defaultSeconds ?? 300;
}

export function resolveSubagentModelAndThinkingPlan(params: { model?: string; thinkingLevel?: string }): { model: string; thinkingLevel: string } {
  return {
    model: params.model ?? "",
    thinkingLevel: params.thinkingLevel ?? "off",
  };
}

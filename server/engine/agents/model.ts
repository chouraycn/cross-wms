/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/model.ts
 *
 * 降级实现：提供模型解析，不再抛出 stub 错误。
 */

export function resolveModelWithRegistry(params: { model?: string; defaultModel?: string }): string {
  return params.model ?? params.defaultModel ?? "";
}

export function resolveModel(params: { model?: string; defaultModel?: string }): string {
  return params.model ?? params.defaultModel ?? "";
}

export async function resolveModelAsync(params: { model?: string; defaultModel?: string }): Promise<string> {
  return params.model ?? params.defaultModel ?? "";
}

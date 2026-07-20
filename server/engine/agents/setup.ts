/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/setup.ts
 *
 * 降级实现：提供运行设置，不再抛出 stub 错误。
 */

export function resolveHookModelSelection(params: { model?: string; defaultModel?: string }): string {
  return params.model ?? params.defaultModel ?? "";
}

export function buildBeforeModelResolveAttachments(_params: unknown): unknown[] {
  return [];
}

export function resolveEffectiveRuntimeModel(params: { model?: string; defaultModel?: string }): string {
  return params.model ?? params.defaultModel ?? "";
}

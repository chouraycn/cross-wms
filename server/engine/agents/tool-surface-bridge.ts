/**
 * 移植自 openclaw/src/agents/harness/tool-surface-bridge.ts
 *
 * 降级实现：提供 harness tool surface runtime，不再抛出 stub 错误。
 */

export type AgentHarnessToolSurfaceRuntime = {
  resolveToolSurface: (toolName: string) => unknown;
};

export function createAgentHarnessToolSurfaceRuntime(_params?: unknown): AgentHarnessToolSurfaceRuntime {
  return {
    resolveToolSurface: () => null,
  };
}

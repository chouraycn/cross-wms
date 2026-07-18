// 移植自 openclaw/src/plugins/runtime-tasks.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type BoundTaskFlowsRuntime = unknown;
export type BoundTaskRunsRuntime = unknown;
export type PluginRuntimeTaskFlows = unknown;
export type PluginRuntimeTaskRuns = unknown;
export type PluginRuntimeTasks = unknown;
export function createRuntimeTaskRuns(...args: unknown[]): unknown {
  throw new Error("not implemented: createRuntimeTaskRuns");
}
export function createRuntimeTaskFlows(...args: unknown[]): unknown {
  throw new Error("not implemented: createRuntimeTaskFlows");
}
export function createRuntimeTasks(...args: unknown[]): unknown {
  throw new Error("not implemented: createRuntimeTasks");
}

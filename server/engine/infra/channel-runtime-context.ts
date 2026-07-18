// 移植自 openclaw/src/infra/channel-runtime-context.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function registerChannelRuntimeContext(...args: unknown[]): unknown {
  throw new Error("not implemented: registerChannelRuntimeContext");
}
export function getChannelRuntimeContext(...args: unknown[]): unknown {
  throw new Error("not implemented: getChannelRuntimeContext");
}
export function watchChannelRuntimeContexts(...args: unknown[]): unknown {
  throw new Error("not implemented: watchChannelRuntimeContexts");
}
export function createTaskScopedChannelRuntime(...args: unknown[]): unknown {
  throw new Error("not implemented: createTaskScopedChannelRuntime");
}

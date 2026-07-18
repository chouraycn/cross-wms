// 移植自 openclaw/src/plugins/runtime-llm.runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type RuntimeLlmAuthority = unknown;
export type CreateRuntimeLlmOptions = unknown;
export function createRuntimeLlm(...args: unknown[]): unknown {
  throw new Error("not implemented: createRuntimeLlm");
}

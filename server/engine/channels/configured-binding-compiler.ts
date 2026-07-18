// 移植自 openclaw/src/channels/plugins/configured-binding-compiler.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type CompiledConfiguredBindingRegistry = unknown;

export function resolveCompiledBindingRegistry(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveCompiledBindingRegistry");
}

export function primeCompiledBindingRegistry(..._args: unknown[]): unknown {
  throw new Error("not implemented: primeCompiledBindingRegistry");
}

export function countCompiledBindingRegistry(..._args: unknown[]): unknown {
  throw new Error("not implemented: countCompiledBindingRegistry");
}

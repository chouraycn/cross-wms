// 移植自 openclaw/src/channels/plugins/stateful-target-builtins.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isStatefulTargetBuiltinDriverId(..._args: unknown[]): unknown {
  throw new Error("not implemented: isStatefulTargetBuiltinDriverId");
}

export async function ensureStatefulTargetBuiltinsRegistered(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: ensureStatefulTargetBuiltinsRegistered");
}

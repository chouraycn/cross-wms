// 移植自 openclaw/src/infra/target-errors.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function missingTargetMessage(...args: unknown[]): unknown {
  throw new Error("not implemented: missingTargetMessage");
}
export function missingTargetError(...args: unknown[]): unknown {
  throw new Error("not implemented: missingTargetError");
}
export function ambiguousTargetMessage(...args: unknown[]): unknown {
  throw new Error("not implemented: ambiguousTargetMessage");
}
export function ambiguousTargetError(...args: unknown[]): unknown {
  throw new Error("not implemented: ambiguousTargetError");
}
export function unknownTargetMessage(...args: unknown[]): unknown {
  throw new Error("not implemented: unknownTargetMessage");
}
export function unknownTargetError(...args: unknown[]): unknown {
  throw new Error("not implemented: unknownTargetError");
}

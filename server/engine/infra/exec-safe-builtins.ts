// 移植自 openclaw/src/infra/exec-safe-builtins.ts

export function isSafeBuiltinSegment(...args: unknown[]): unknown {
  return false;
}

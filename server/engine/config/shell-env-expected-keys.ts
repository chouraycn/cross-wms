// 移植自 openclaw/src/config/shell-env-expected-keys.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveShellEnvExpectedKeys(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveShellEnvExpectedKeys");
}

// 移植自 openclaw/src/infra/provider-usage.fetch.codex.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function fetchCodexUsage(...args: unknown[]): unknown {
  throw new Error("not implemented: fetchCodexUsage");
}

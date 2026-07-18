// 移植自 openclaw/src/infra/provider-usage.fetch.gemini.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function fetchGeminiUsage(...args: unknown[]): unknown {
  throw new Error("not implemented: fetchGeminiUsage");
}

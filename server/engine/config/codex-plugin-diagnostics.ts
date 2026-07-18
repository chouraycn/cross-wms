// 移植自 openclaw/src/config/codex-plugin-diagnostics.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function configExplicitlyKeepsCodexUnavailableForOpenAi(...args: unknown[]): unknown {
  throw new Error("not implemented: configExplicitlyKeepsCodexUnavailableForOpenAi");
}
export function shouldSuppressMissingCodexPluginDiagnostics(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldSuppressMissingCodexPluginDiagnostics");
}

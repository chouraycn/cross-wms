// 移植自 openclaw/src/config/codex-plugin-diagnostics.ts

export function configExplicitlyKeepsCodexUnavailableForOpenAi(...args: unknown[]): unknown {
  return undefined;
}
export function shouldSuppressMissingCodexPluginDiagnostics(...args: unknown[]): unknown {
  return false;
}

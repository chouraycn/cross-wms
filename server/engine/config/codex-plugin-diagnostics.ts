// 移植自 openclaw/src/config/codex-plugin-diagnostics.ts

export function configExplicitlyKeepsCodexUnavailableForOpenAi(...args: any[]): any {
  return undefined;
}
export function shouldSuppressMissingCodexPluginDiagnostics(...args: any[]): any {
  return false;
}

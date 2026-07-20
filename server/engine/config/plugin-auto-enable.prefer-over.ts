// 移植自 openclaw/src/config/plugin-auto-enable.prefer-over.ts

export function shouldSkipPreferredPluginAutoEnable(...args: unknown[]): unknown {
  return false;
}

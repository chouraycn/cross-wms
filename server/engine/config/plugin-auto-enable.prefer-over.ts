// 移植自 openclaw/src/config/plugin-auto-enable.prefer-over.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function shouldSkipPreferredPluginAutoEnable(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldSkipPreferredPluginAutoEnable");
}

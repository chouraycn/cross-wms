/**
 * * Resolves effective plugin ids from config, installed records, and activation metadata.
 * 移植自 openclaw/src/plugins/effective-plugin-ids.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function resolveEffectivePluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveEffectivePluginIds");
}


/**
 * * Loads bundled channel config schema metadata from source or public surface modules.
 * 移植自 openclaw/src/plugins/bundled-channel-config-metadata.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function collectBundledChannelConfigs(...args: unknown[]): unknown {
  throw new Error("not implemented: collectBundledChannelConfigs");
}

